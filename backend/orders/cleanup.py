"""Clearing out uploads nobody ordered: Artwork that never made it onto a submitted
Order, and Page picker sources (SourceFile) that expired or lost all their pages.

Artwork on a submitted Order (an OrderLine's front or back) is never touched.
Everything here is safe to run twice: a second run finds nothing left to remove.
Used by the `cleanup_uploads` command (run it on a schedule) and by `reset_demo`.
"""

from datetime import timedelta

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from .models import SOURCE_TTL, Artwork, OrderLine, SourceFile

UPLOAD_TTL = SOURCE_TTL


def _delete_file(field_file):
    if field_file and field_file.name:
        default_storage.delete(field_file.name)


def _attached_artwork_ids():
    lines = OrderLine.objects
    return set(lines.values_list("front_artwork_id", flat=True)) | set(
        lines.exclude(back_artwork_id=None).values_list("back_artwork_id", flat=True)
    )


def purge_unattached_uploads(*, everything=False, now=None):
    """Remove Artwork not on any Order, and the Page picker sources that no draft
    still needs, along with their files on disk. By default only uploads older than
    24 hours and sources past their expiry; `everything=True` (the demo reset)
    ignores age. Returns {"artworks": n, "sources": n}."""
    now = now or timezone.now()

    artworks = Artwork.objects.exclude(pk__in=_attached_artwork_ids())
    if not everything:
        artworks = artworks.filter(uploaded_at__lte=now - UPLOAD_TTL)
    artwork_count = 0
    for artwork in artworks:
        with transaction.atomic():
            for field in (artwork.file, artwork.page_image, artwork.thumbnail_image):
                _delete_file(field)
            artwork.delete()
        artwork_count += 1

    # A source a live (unattached) draft page was picked from must stay reopenable.
    # Artwork left on a source now belongs to a submitted Order, which never needs it.
    sources = SourceFile.objects.all()
    if not everything:
        sources = sources.filter(expires_at__lte=now)
    live_source_ids = Artwork.objects.exclude(pk__in=_attached_artwork_ids()).values("source_id")
    source_count = 0
    for source in sources.exclude(pk__in=live_source_ids):
        with transaction.atomic():
            _delete_file(source.file)
            source.delete()
        source_count += 1

    return {"artworks": artwork_count, "sources": source_count}
