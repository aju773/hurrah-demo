"""The Page picker's endpoints: a stored multi-page PDF (SourceFile) is listed,
thumbnailed page by page, and finally assigned to Front and Back.

Phase one (storing the file and listing its pages) happens in the Artwork upload
endpoint, orders/views.ArtworkUploadView. Phase two, `assign`, turns the chosen
pages into Artwork exactly as a one-shot upload does (orders/views._save_artwork:
Preflight, page image, thumbnail). Pages that are not assigned are never checked,
rendered or stored as Artwork.
"""

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from . import preflight
from .models import Artwork, SLOT_BACK, SLOT_FRONT, SourceFile
from .pdf_utils import (
    ERROR_BACK_SIZE_DIFFERS,
    ERROR_INVALID_PAGE,
    ERROR_MESSAGES_EN,
    ERROR_SAME_PAGE_TWICE,
    ERROR_SOURCE_EXPIRED,
    analyze_pdf,
)
from .rendering import render_page_thumbnail
from .views import (
    MAX_UPLOAD_KEY_LENGTH,
    ArtworkUploadThrottle,
    ServerBusy,
    _error_response,
    _save_artwork,
    _size_values_for,
    _source_payload,
    _upload_payload,
)

FILE_UNREADABLE = "file_unreadable"


class SourceExpired(APIException):
    """410 in the upload error shape: the source outlived its 24 hours."""

    status_code = status.HTTP_410_GONE

    def __init__(self):
        super().__init__(
            {"errors": [{"code": ERROR_SOURCE_EXPIRED, "slot": None, "message": ERROR_MESSAGES_EN[ERROR_SOURCE_EXPIRED]}]}
        )


def _live_source(pk):
    source = get_object_or_404(SourceFile, pk=pk)
    if source.is_expired:
        raise SourceExpired()
    return source


def _read_source(source):
    source.file.open("rb")
    try:
        return source.file.read()
    finally:
        source.file.close()


class SourceDetailView(APIView):
    """GET a stored source's page list again, so the picker can reopen."""

    def get(self, request, pk):
        return Response(_source_payload(request, _live_source(pk)))


class SourcePageThumbnailView(APIView):
    """GET one page's 400px PNG. Rendered on the first request and cached on disk
    per source file, so the picker's first rows appear quickly and a 50-page file
    is not rendered up front."""

    def get(self, request, pk, number):
        source = _live_source(pk)
        if not 1 <= number <= source.page_count:
            raise NotFound()
        name = f"source_thumbs/{source.id}/{number}.png"
        if not default_storage.exists(name):
            name = default_storage.save(name, ContentFile(render_page_thumbnail(_read_source(source), number)))
        response = FileResponse(default_storage.open(name), content_type="image/png")
        response["Cache-Control"] = "public, max-age=86400"
        return response


def _page_number(value, page_count):
    """1..page_count, or None when the value is not a page of this file."""
    if isinstance(value, bool) or not isinstance(value, (int, str)) or not str(value).isdigit():
        return None
    number = int(value)
    return number if 1 <= number <= page_count else None


def _same_size(a, b, tolerance_mm):
    """Front and Back are the same Size when both match one Size value, or, when
    neither matches, when they measure alike (either way round)."""
    if a["matched_size_id"] is not None or b["matched_size_id"] is not None:
        return a["matched_size_id"] == b["matched_size_id"]
    aw, ah, bw, bh = a["trim_width_mm"], a["trim_height_mm"], b["trim_width_mm"], b["trim_height_mm"]
    alike = lambda x, y: abs(x - y) <= tolerance_mm
    return (alike(aw, bw) and alike(ah, bh)) or (alike(aw, bh) and alike(ah, bw))


def _size_of(artwork):
    return {
        "matched_size_id": artwork.matched_size_id,
        "trim_width_mm": artwork.trim_width_mm,
        "trim_height_mm": artwork.trim_height_mm,
    }


class SourceAssignView(APIView):
    """POST {front?, back?, front_id?, upload_key?} to make Artwork from chosen
    pages (1-based page numbers), answering like a one-shot upload.

    Front and Back must be the same Size (back_size_differs) and cannot be the
    same page (same_page_twice) when both are sent. `back` alone is for adding or
    replacing the Back later: with `front_id` it is checked against that Front
    Artwork, and it may repeat Front's own page ("Use the same artwork for the
    back"). Nothing is stored when any check fails. `upload_key` makes a resend
    return what the first attempt made.
    """

    throttle_classes = [ArtworkUploadThrottle]

    def throttled(self, request, wait):
        raise ServerBusy(wait)

    def post(self, request, pk):
        source = _live_source(pk)
        upload_key = str(request.data.get("upload_key") or "")[:MAX_UPLOAD_KEY_LENGTH]
        if upload_key:
            earlier = list(Artwork.objects.filter(source=source, upload_key=upload_key).order_by("id"))
            if earlier:
                return Response(_upload_payload(request, {a.slot: a for a in earlier}, source.page_count), status=status.HTTP_201_CREATED)

        chosen = {}
        for slot in (SLOT_FRONT, SLOT_BACK):
            if request.data.get(slot) is None:
                continue
            number = _page_number(request.data.get(slot), source.page_count)
            if number is None:
                return _error_response(ERROR_INVALID_PAGE, page_count=source.page_count, slot=slot)
            chosen[slot] = number
        if not chosen:
            return _error_response(ERROR_INVALID_PAGE, page_count=source.page_count)
        if len(chosen) == 2 and chosen[SLOT_FRONT] == chosen[SLOT_BACK]:
            return _error_response(ERROR_SAME_PAGE_TWICE, page_count=source.page_count, slot=SLOT_BACK)

        product = source.product
        file_bytes = _read_source(source)
        file_repaired = preflight.check_file(file_bytes)["repaired"]
        try:
            analysis = analyze_pdf(
                ContentFile(file_bytes), _size_values_for(product), product.size_tolerance_mm, product.bleed_min_mm, product.bleed_max_mm
            )
        except Exception:
            analysis = {"error": FILE_UNREADABLE}
        if "error" in analysis:
            return _error_response(FILE_UNREADABLE)
        pages = analysis["pages"]

        if len(chosen) == 2:
            front_size = pages[chosen[SLOT_FRONT] - 1]
        elif SLOT_BACK in chosen and request.data.get("front_id"):
            front = Artwork.objects.filter(pk=request.data.get("front_id"), slot=SLOT_FRONT, product=product).first()
            front_size = _size_of(front) if front else None
        else:
            front_size = None
        if SLOT_BACK in chosen and front_size is not None and not _same_size(front_size, pages[chosen[SLOT_BACK] - 1], product.size_tolerance_mm):
            return _error_response(ERROR_BACK_SIZE_DIFFERS, page_count=source.page_count, slot=SLOT_BACK)

        created = {}
        for slot in (SLOT_FRONT, SLOT_BACK):
            if slot not in chosen:
                continue
            number = chosen[slot]
            created[slot] = _save_artwork(
                product,
                slot,
                ContentFile(file_bytes, name=source.original_filename),
                pages[number - 1],
                source.page_count,
                number,
                file_bytes,
                file_repaired,
                upload_key,
                source=source,
            )
        return Response(_upload_payload(request, created, source.page_count), status=status.HTTP_201_CREATED)
