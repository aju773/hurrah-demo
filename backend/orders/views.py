from django.conf import settings
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from . import preflight, size_choice
from .models import Artwork, Product, SLOT_BACK, SLOT_CHOICES, SLOT_FRONT
from .pdf_utils import (
    ERROR_BACK_ONE_PAGE,
    ERROR_BACK_SIZE_DIFFERS,
    ERROR_MESSAGES_EN,
    ERROR_NOT_A_PDF,
    ERROR_PAGE_CHOICE_NEEDED,
    ERROR_SERVER_BUSY,
    ERROR_TOO_MANY_PAGES,
    MAX_PAGES,
    analyze_pdf,
    looks_like_pdf,
    sanitise_filename,
)
from .rendering import render_artwork_images
from .serializers import ArtworkSerializer, ProductSerializer

VALID_SLOTS = {code for code, _ in SLOT_CHOICES}

FILE_UNREADABLE = "file_unreadable"
FILE_TOO_LARGE = "file_too_large"

PREFLIGHT_ERROR_MESSAGES_EN = {
    FILE_UNREADABLE: preflight.MESSAGES_EN[(FILE_UNREADABLE, preflight.ERROR)],
    FILE_TOO_LARGE: preflight.MESSAGES_EN[(FILE_TOO_LARGE, preflight.ERROR)],
}


class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    lookup_field = "slug"


def _size_values_for(product):
    """[{id, code, width_mm, height_mm}] for the Product's active Size Option values."""
    size_option = product.options.filter(code="size", active=True).first()
    if size_option is None:
        return []
    return [
        {"id": value.id, "code": value.code, "width_mm": value.width_mm, "height_mm": value.height_mm}
        for value in size_option.values.filter(active=True)
        if value.width_mm is not None and value.height_mm is not None
    ]


_ALL_ERROR_MESSAGES_EN = {**ERROR_MESSAGES_EN, **PREFLIGHT_ERROR_MESSAGES_EN}


def _error_response(code, page_count=None, slot=None):
    payload = {"errors": [{"code": code, "slot": slot, "message": _ALL_ERROR_MESSAGES_EN[code]}]}
    if page_count is not None:
        payload["page_count"] = page_count
    return Response(payload, status=status.HTTP_400_BAD_REQUEST)


def _preflight_thresholds(product):
    return {
        "bleed_mm": product.bleed_mm,
        "ppi_error_below": product.ppi_error_below,
        "ppi_warn_below": product.ppi_warn_below,
    }


def _save_artwork(product, slot, uploaded_file, page_result, source_page_count, page_index, file_bytes, file_repaired):
    matched_size_id = page_result.get("matched_size_id")
    report = preflight.run_preflight(
        file_bytes,
        page_index,
        page_result,
        _preflight_thresholds(product),
        slot,
        file_repaired=file_repaired,
    )
    artwork = Artwork.objects.create(
        product=product,
        slot=slot,
        file=uploaded_file,
        original_filename=uploaded_file.name,
        source_page_count=source_page_count,
        page_index=page_index,
        matched_size_id=matched_size_id,
        trim_width_mm=page_result["trim_width_mm"],
        trim_height_mm=page_result["trim_height_mm"],
        media_width_mm=page_result["media_width_mm"],
        media_height_mm=page_result["media_height_mm"],
        orientation=page_result["orientation"],
        trim_source=page_result["trim_source"],
        bleed_mm=page_result["bleed_mm"],
        rotation=page_result["rotation"],
        is_valid=report["headline_severity"] != preflight.ERROR,
        preflight_report=report,
    )
    try:
        images = render_artwork_images(file_bytes, page_index)
    except Exception:
        images = None
    if images is not None:
        base_name = f"{slot}-{artwork.id}"
        artwork.page_image.save(f"{base_name}.png", ContentFile(images["page_png"]), save=False)
        artwork.thumbnail_image.save(f"{base_name}-thumb.png", ContentFile(images["thumbnail_png"]), save=False)
        artwork.save(update_fields=["page_image", "thumbnail_image"])
    if not artwork.is_valid:
        first_error = next(f for f in report["findings"] if f["severity"] == preflight.ERROR)
        artwork.error_code = first_error["code"]
        artwork.error_message = first_error["message"]
        artwork.save(update_fields=["error_code", "error_message"])
    return artwork


class ServerBusy(APIException):
    """429 in the upload error shape; `wait` becomes the Retry-After header."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS

    def __init__(self, wait=None):
        self.wait = wait
        super().__init__(
            {"errors": [{"code": ERROR_SERVER_BUSY, "slot": None, "message": ERROR_MESSAGES_EN[ERROR_SERVER_BUSY]}]}
        )


class ArtworkUploadThrottle(SimpleRateThrottle):
    """A modest per-visitor cap on upload requests so the demo server isn't
    flooded. The rate ("30/min") is settings.ARTWORK_UPLOAD_RATE, read per
    request; None turns the limit off."""

    scope = "artwork_upload"

    def get_rate(self):
        return getattr(settings, "ARTWORK_UPLOAD_RATE", None)

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class ArtworkUploadView(APIView):
    """Accepts a PDF into a Front or Back slot, detects its trim size/bleed/
    orientation in a process pool worker, and stores the per-slot result.

    A 2-page PDF dropped into Front auto-fills both slots. The file is judged by
    its content, never its name. Errors are returned as {"errors": [{"code",
    "slot", "message"}], ...}: not_a_pdf, file_too_large, file_unreadable,
    too_many_pages (over 50), page_choice_needed (3-50 pages, until the page
    picker), back_one_page, back_size_differs, and server_busy (429, over the
    rate limit). See pdf_utils.ERROR_MESSAGES_EN.
    """

    throttle_classes = [ArtworkUploadThrottle]

    def throttled(self, request, wait):
        raise ServerBusy(wait)

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        slot = request.data.get("slot")
        product_id = request.data.get("product")
        # Id of the sibling Front Artwork, sent when uploading to Back, so a
        # size mismatch can be flagged without an extra round trip.
        front_id = request.data.get("front_id")

        if uploaded_file is None:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
        if slot not in VALID_SLOTS:
            return Response({"detail": f"slot must be one of {sorted(VALID_SLOTS)}."}, status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, pk=product_id)

        file_bytes = uploaded_file.read()
        uploaded_file.seek(0)
        file_check = preflight.check_file(file_bytes)
        if file_check["status"] == "too_large":
            return _error_response(FILE_TOO_LARGE)
        if not looks_like_pdf(file_bytes):
            return _error_response(ERROR_NOT_A_PDF)
        if file_check["status"] == "unreadable":
            return _error_response(FILE_UNREADABLE)

        uploaded_file.name = sanitise_filename(uploaded_file.name)

        size_values = _size_values_for(product)
        try:
            result = analyze_pdf(
                uploaded_file, size_values, product.size_tolerance_mm, product.bleed_min_mm, product.bleed_max_mm
            )
        except Exception:
            return _error_response(FILE_UNREADABLE)

        if "error" in result:
            # It has a PDF header but pikepdf can't open or repair it.
            return _error_response(FILE_UNREADABLE)

        page_count = result["page_count"]
        pages = result["pages"]

        if page_count > MAX_PAGES:
            return _error_response(ERROR_TOO_MANY_PAGES, page_count=page_count)
        if page_count > 2:
            return _error_response(ERROR_PAGE_CHOICE_NEEDED, page_count=page_count)
        if slot == SLOT_BACK and page_count == 2:
            return _error_response(ERROR_BACK_ONE_PAGE, page_count=page_count, slot=SLOT_BACK)

        uploaded_file.seek(0)
        file_repaired = file_check["repaired"]
        created = {}
        if slot == SLOT_FRONT and page_count == 2:
            created[SLOT_FRONT] = _save_artwork(product, SLOT_FRONT, uploaded_file, pages[0], page_count, 1, file_bytes, file_repaired)
            uploaded_file.seek(0)
            created[SLOT_BACK] = _save_artwork(product, SLOT_BACK, uploaded_file, pages[1], page_count, 2, file_bytes, file_repaired)
        else:
            artwork = _save_artwork(product, slot, uploaded_file, pages[0], page_count, 1, file_bytes, file_repaired)
            created[slot] = artwork

            if slot == SLOT_BACK and front_id:
                front = Artwork.objects.filter(pk=front_id, slot=SLOT_FRONT).first()
                if front is not None and front.matched_size_id != artwork.matched_size_id:
                    artwork.is_valid = False
                    artwork.error_code = ERROR_BACK_SIZE_DIFFERS
                    artwork.error_message = ERROR_MESSAGES_EN[ERROR_BACK_SIZE_DIFFERS]
                    artwork.preflight_report["findings"].append(
                        {
                            "code": ERROR_BACK_SIZE_DIFFERS,
                            "severity": preflight.ERROR,
                            "value": None,
                            "slot": SLOT_BACK,
                            "page": artwork.page_index,
                            "bbox": None,
                            "message": ERROR_MESSAGES_EN[ERROR_BACK_SIZE_DIFFERS],
                        }
                    )
                    artwork.preflight_report["headline_severity"] = preflight.ERROR
                    artwork.save(update_fields=["is_valid", "error_code", "error_message", "preflight_report"])

        errors = [
            {"code": artwork.error_code, "slot": slot_name, "message": artwork.error_message}
            for slot_name, artwork in created.items()
            if artwork.error_code
        ]

        data = {
            "page_count": page_count,
            "front": ArtworkSerializer(created[SLOT_FRONT], context={"request": request}).data if SLOT_FRONT in created else None,
            "back": ArtworkSerializer(created[SLOT_BACK], context={"request": request}).data if SLOT_BACK in created else None,
            "errors": errors,
        }
        return Response(data, status=status.HTTP_201_CREATED)


class ArtworkDetailView(generics.RetrieveDestroyAPIView):
    """GET one Artwork slot's detection; DELETE to clear a slot. Artwork
    attached to an Order is locked (spec: "no replace, no delete, no
    re-run") — its OrderLine FK is on_delete=PROTECT, so the delete would
    fail anyway, but this returns a clear 400 instead of a 500."""

    queryset = Artwork.objects.all()
    serializer_class = ArtworkSerializer

    def destroy(self, request, *args, **kwargs):
        from .models import OrderLine

        artwork = self.get_object()
        if OrderLine.objects.filter(front_artwork_id=artwork.id).exists() or OrderLine.objects.filter(back_artwork_id=artwork.id).exists():
            return Response({"detail": "This artwork is on an order and can't be changed."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


def _image_url(request, image_field):
    return request.build_absolute_uri(image_field.url) if image_field else None


def _slot_resize(mode, ordered_trim_mm, artwork, product_bleed_mm):
    """The Fit/Fill instruction for one slot (orders/size_choice), or None
    when no resize mode was requested."""
    if mode not in (size_choice.FIT, size_choice.FILL):
        return None
    file_trim_mm = [artwork.trim_width_mm, artwork.trim_height_mm]
    if None in file_trim_mm:
        return None
    return size_choice.compute_size_choice(mode, ordered_trim_mm, file_trim_mm, artwork.bleed_mm, product_bleed_mm)


def _slot_preview(request, artwork, resize=None, product_bleed_mm=0.0):
    findings = artwork.preflight_report.get("findings", [])
    transform = None
    if resize is not None:
        transform = {"mode": resize["mode"], "scale": resize["scale"]}
        findings = preflight.rescale_report(
            artwork.preflight_report, resize, product_bleed_mm, artwork.slot, artwork.page_index
        )["findings"]
    return {
        "artwork_id": artwork.id,
        "image_url": _image_url(request, artwork.page_image),
        "thumbnail_url": _image_url(request, artwork.thumbnail_image),
        "page_box_mm": [artwork.media_width_mm, artwork.media_height_mm],
        "file_trim_mm": [artwork.trim_width_mm, artwork.trim_height_mm],
        "file_bleed_mm": artwork.bleed_mm,
        "transform": transform,
        "findings": findings,
    }


class ArtworkPreviewView(APIView):
    """GET the step 2 preview payload: Front/Back image URLs, geometry in
    file-mm, the ordered trim size and the Product's bleed/safe, and each
    slot's Findings (orders/preflight.py already produced and stored them).

    Query params: front=<Artwork id> (required), back=<Artwork id> (omitted
    when same_as_front), same_as_front=true|false, size=<Size value code> —
    the customer's currently ordered Size, used for the "ordered trim mm" the
    preview draws its cut line at. resize_mode=fit|fill and resize_applies_to
    (comma-separated "front,back", default both) carry the customer's "Keep
    {Size} and resize" choice (ticket 09): the slots it applies to get a
    `transform` and a Preflight report re-run on the scaled result — the file
    itself is never re-rendered.
    """

    def get(self, request, slug):
        product = get_object_or_404(Product, slug=slug, active=True)

        front_id = request.query_params.get("front")
        if not front_id or not front_id.isdigit():
            return Response({"detail": "front must be an Artwork id."}, status=status.HTTP_400_BAD_REQUEST)
        front = get_object_or_404(Artwork, pk=front_id, product=product, slot=SLOT_FRONT)

        same_as_front = request.query_params.get("same_as_front") == "true"
        back_id = request.query_params.get("back")
        back = None
        if back_id and not same_as_front:
            if not back_id.isdigit():
                return Response({"detail": "back must be an Artwork id."}, status=status.HTTP_400_BAD_REQUEST)
            back = get_object_or_404(Artwork, pk=back_id, product=product, slot=SLOT_BACK)

        size_code = request.query_params.get("size")
        ordered_value = None
        if size_code:
            size_option = product.options.filter(code="size", active=True).first()
            if size_option is not None:
                ordered_value = size_option.values.filter(code=size_code, active=True).first()
        if ordered_value is not None:
            ordered_trim_mm = [ordered_value.width_mm, ordered_value.height_mm]
        else:
            ordered_trim_mm = [front.trim_width_mm, front.trim_height_mm]

        resize_mode = request.query_params.get("resize_mode")
        resize_applies_to = set((request.query_params.get("resize_applies_to") or "front,back").split(","))

        front_resize = _slot_resize(resize_mode, ordered_trim_mm, front, product.bleed_mm) if "front" in resize_applies_to else None

        if same_as_front:
            back_payload = {"same_as_front": True}
        elif back is not None:
            back_resize = _slot_resize(resize_mode, ordered_trim_mm, back, product.bleed_mm) if "back" in resize_applies_to else None
            back_payload = {
                "same_as_front": False,
                **_slot_preview(request, back, resize=back_resize, product_bleed_mm=product.bleed_mm),
            }
        else:
            back_payload = None

        return Response({
            "ordered_trim_mm": ordered_trim_mm,
            "product_bleed_mm": product.bleed_mm,
            "product_safe_mm": product.safe_mm,
            "front": {
                "same_as_front": False,
                **_slot_preview(request, front, resize=front_resize, product_bleed_mm=product.bleed_mm),
            },
            "back": back_payload,
        })
