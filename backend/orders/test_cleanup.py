"""Upload cleanup (ticket 13): stale unattached uploads and Page picker sources go,
Artwork on a submitted Order stays, and the demo reset clears the lot."""

import shutil
import tempfile
from datetime import timedelta
from io import StringIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Artwork, Order, OrderLine, Product, SourceFile
from .numbering import allocate_order_number
from .test_lifecycle import make_order


class CleanupBase(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.product = Product.objects.get(slug="flyers")

    def make_artwork(self, *, age_hours=0, source=None):
        artwork = Artwork(product=self.product, slot="front", original_filename="a.pdf", source=source)
        artwork.file.save("a.pdf", ContentFile(b"%PDF"), save=False)
        artwork.page_image.save("a.png", ContentFile(b"png"), save=False)
        artwork.thumbnail_image.save("a-thumb.png", ContentFile(b"png"), save=False)
        artwork.save()
        Artwork.objects.filter(pk=artwork.pk).update(uploaded_at=timezone.now() - timedelta(hours=age_hours))
        artwork.refresh_from_db()
        return artwork

    def make_source(self, *, age_hours=0):
        source = SourceFile(product=self.product, original_filename="s.pdf", page_count=4)
        source.file.save("s.pdf", ContentFile(b"%PDF"), save=False)
        source.save()
        SourceFile.objects.filter(pk=source.pk).update(
            expires_at=timezone.now() + timedelta(hours=24) - timedelta(hours=age_hours)
        )
        source.refresh_from_db()
        return source

    def make_submitted_artwork(self):
        order = make_order()
        artwork = OrderLine.objects.get(order=order).front_artwork
        for field, name in ((artwork.file, "front.pdf"), (artwork.page_image, "front.png"), (artwork.thumbnail_image, "t.png")):
            field.save(name, ContentFile(b"x"), save=False)
        artwork.save()
        return artwork

    def files_on_disk(self):
        return {p for p in Path(self.media).rglob("*") if p.is_file()}

    def run_cleanup(self):
        out = StringIO()
        call_command("cleanup_uploads", stdout=out)
        return out.getvalue()


class CleanupUploadsTests(CleanupBase):
    def test_removes_unattached_uploads_older_than_24_hours_with_their_files(self):
        stale = self.make_artwork(age_hours=25)
        self.run_cleanup()
        self.assertFalse(Artwork.objects.filter(pk=stale.pk).exists())
        self.assertEqual(self.files_on_disk(), set())

    def test_keeps_recent_uploads(self):
        fresh = self.make_artwork(age_hours=23)
        self.run_cleanup()
        self.assertTrue(Artwork.objects.filter(pk=fresh.pk).exists())
        self.assertEqual(len(self.files_on_disk()), 3)

    def test_removes_expired_sources_and_their_files_but_keeps_live_ones(self):
        expired = self.make_source(age_hours=25)
        live = self.make_source(age_hours=1)
        self.run_cleanup()
        self.assertFalse(SourceFile.objects.filter(pk=expired.pk).exists())
        self.assertTrue(SourceFile.objects.filter(pk=live.pk).exists())
        self.assertEqual(len(self.files_on_disk()), 1)

    def test_expired_source_goes_together_with_its_stale_picked_pages(self):
        source = self.make_source(age_hours=25)
        self.make_artwork(age_hours=25, source=source)
        self.run_cleanup()
        self.assertEqual(SourceFile.objects.count(), 0)
        self.assertEqual(Artwork.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), set())

    def test_expired_source_with_a_recent_picked_page_stays_reopenable(self):
        source = self.make_source(age_hours=25)
        self.make_artwork(age_hours=1, source=source)
        self.run_cleanup()
        self.assertTrue(SourceFile.objects.filter(pk=source.pk).exists())

    def test_never_touches_artwork_on_a_submitted_order(self):
        artwork = self.make_submitted_artwork()
        Artwork.objects.filter(pk=artwork.pk).update(uploaded_at=timezone.now() - timedelta(days=30))
        source = self.make_source(age_hours=48)
        Artwork.objects.filter(pk=artwork.pk).update(source=source)
        before = self.files_on_disk()
        self.run_cleanup()
        self.assertTrue(Artwork.objects.filter(pk=artwork.pk).exists())
        artwork.refresh_from_db()
        self.assertIsNone(artwork.source_id)
        self.assertEqual(len(self.files_on_disk()), len(before) - 1)  # only the source file went
        for field in (artwork.file, artwork.page_image, artwork.thumbnail_image):
            self.assertTrue(Path(field.path).exists())

    def test_safe_to_run_twice(self):
        self.make_artwork(age_hours=30)
        self.make_source(age_hours=30)
        self.assertIn("Removed 1 unattached upload and 1 page-picker source", self.run_cleanup())
        self.assertIn("Removed 0 unattached uploads and 0 page-picker sources", self.run_cleanup())

    def test_missing_file_on_disk_does_not_break_the_run(self):
        stale = self.make_artwork(age_hours=30)
        Path(stale.file.path).unlink()
        self.run_cleanup()
        self.assertEqual(Artwork.objects.count(), 0)


class ResetDemoUploadsTests(CleanupBase):
    def run_reset(self):
        call_command("reset_demo", "--noinput", stdout=StringIO())

    def test_reset_clears_unattached_uploads_of_any_age_and_sources(self):
        self.make_artwork(age_hours=0)
        self.make_source(age_hours=0)
        self.run_reset()
        self.assertEqual(Artwork.objects.count(), 0)
        self.assertEqual(SourceFile.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), set())

    def test_reset_removes_submitted_order_artwork_with_its_order(self):
        self.make_submitted_artwork()
        self.run_reset()
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Artwork.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), set())

    def test_next_order_is_hur_10001_and_a_second_reset_is_harmless(self):
        make_order()
        self.make_artwork()
        self.run_reset()
        self.run_reset()
        self.assertEqual(allocate_order_number(), "HUR-10001")
