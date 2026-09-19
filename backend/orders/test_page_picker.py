"""API tests for the two-phase upload behind the Page picker: phase one stores a
multi-page PDF and lists its pages, phase two assigns Front and Back."""

import io
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from . import preflight, rendering
from .fixtures_pdf import build_five_page_mixed, build_pdf
from .models import Artwork, SourceFile
from .test_artwork import as_upload, make_product


class PagePickerApiTests(TestCase):
    def setUp(self):
        cache.clear()
        # A fresh media folder per test: cached thumbnails are keyed by source id,
        # and ids restart with each test's rolled-back database.
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)
        self.client = APIClient()
        self.product = make_product()

    def upload(self, buf, slot="front", key=None):
        body = {"file": as_upload(buf), "slot": slot, "product": self.product.id}
        if key:
            body["upload_key"] = key
        return self.client.post("/api/artworks/", body, format="multipart")

    def open_picker(self, key=None):
        res = self.upload(build_five_page_mixed(), key=key)
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()["source"]

    def assign(self, source, body):
        return self.client.post(f"/api/sources/{source['id']}/assign/", body, format="json")

    # ---- phase one --------------------------------------------------------

    def test_five_page_fixture_returns_five_pages_with_thumbnails(self):
        data = self.upload(build_five_page_mixed()).json()
        self.assertEqual(data["page_count"], 5)
        pages = data["source"]["pages"]
        self.assertEqual([p["number"] for p in pages], [1, 2, 3, 4, 5])
        for page in pages:
            self.assertTrue(page["thumbnail_url"])
            self.assertIn(page["orientation"], ("portrait", "landscape"))
        self.assertEqual([p["matched_size_code"] for p in pages], ["a4", "a6", "a5", "a5", "a4"])
        self.assertEqual((pages[2]["trim_width_mm"], pages[2]["trim_height_mm"]), (148.0, 210.0))

    def test_phase_one_makes_no_artwork_and_records_an_expiry(self):
        source = self.open_picker()
        self.assertEqual(Artwork.objects.count(), 0)
        stored = SourceFile.objects.get(pk=source["id"])
        self.assertEqual(stored.page_count, 5)
        hours = (stored.expires_at - stored.created_at) / timedelta(hours=1)
        self.assertAlmostEqual(hours, 24, delta=0.01)

    def test_the_source_can_be_read_again(self):
        source = self.open_picker()
        again = self.client.get(f"/api/sources/{source['id']}/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["pages"], source["pages"])

    def test_a_multi_page_file_into_back_opens_the_picker_for_one_page(self):
        for buf in (build_five_page_mixed(), build_pdf({"media": (148, 210)}, {"media": (148, 210)})):
            res = self.upload(buf, slot="back")
            self.assertEqual(res.status_code, 201, res.content)
            data = res.json()
            self.assertIsNone(data["back"])
            self.assertIsNone(data["front"])
            self.assertEqual(data["source"]["page_count"], len(data["source"]["pages"]))
        self.assertEqual(Artwork.objects.count(), 0)
        self.assertEqual(SourceFile.objects.count(), 2)

    def test_resending_phase_one_with_the_same_key_stores_one_source(self):
        first = self.open_picker(key="k1")
        second = self.open_picker(key="k1")
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(SourceFile.objects.count(), 1)

    def test_cancelling_by_key_removes_the_source(self):
        self.open_picker(key="k1")
        res = self.client.delete("/api/artworks/?upload_key=k1")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(SourceFile.objects.count(), 0)

    # ---- thumbnails -------------------------------------------------------

    def test_a_thumbnail_is_a_png_no_bigger_than_400px(self):
        source = self.open_picker()
        res = self.client.get(source["pages"][2]["thumbnail_url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/png")
        image = Image.open(io.BytesIO(b"".join(res.streaming_content)))
        self.assertLessEqual(max(image.size), 400)
        self.assertGreater(min(image.size), 100)

    def test_thumbnails_are_rendered_on_request_and_cached(self):
        source = self.open_picker()
        with patch("orders.source_views.render_page_thumbnail", wraps=rendering.render_page_thumbnail) as render:
            self.client.get(source["pages"][0]["thumbnail_url"])
            self.client.get(source["pages"][0]["thumbnail_url"])
            self.client.get(source["pages"][1]["thumbnail_url"])
        self.assertEqual(render.call_count, 2)

    def test_a_thumbnail_of_a_page_that_is_not_there_is_404(self):
        source = self.open_picker()
        res = self.client.get(f"/api/sources/{source['id']}/pages/9/thumbnail/")
        self.assertEqual(res.status_code, 404)

    # ---- phase two --------------------------------------------------------

    def test_assigning_pages_3_and_4_gives_front_and_back_of_the_same_size(self):
        source = self.open_picker()
        res = self.assign(source, {"front": 3, "back": 4})
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["front"]["matched_size_code"], "a5")
        self.assertEqual(data["back"]["matched_size_code"], "a5")
        self.assertEqual((data["front"]["page_index"], data["back"]["page_index"]), (3, 4))
        self.assertEqual(data["front"]["source_page_count"], 5)
        self.assertEqual(data["front"]["source_id"], source["id"])
        self.assertEqual(data["errors"], [])
        self.assertEqual(Artwork.objects.count(), 2)

    def test_assigned_artwork_is_the_same_as_a_one_shot_upload(self):
        source = self.open_picker()
        data = self.assign(source, {"front": 3, "back": 4}).json()
        for side in ("front", "back"):
            artwork = data[side]
            self.assertEqual(artwork["slot"], side)
            self.assertEqual(artwork["bleed_mm"], 3.0)
            self.assertTrue(artwork["is_valid"])
            self.assertIn("headline_severity", artwork["preflight_report"])
            self.assertTrue(artwork["page_image"])
            self.assertTrue(artwork["thumbnail_image"])
            self.assertTrue(artwork["file"])

    def test_back_is_optional(self):
        source = self.open_picker()
        data = self.assign(source, {"front": 3}).json()
        self.assertEqual(data["front"]["page_index"], 3)
        self.assertIsNone(data["back"])
        self.assertEqual(Artwork.objects.count(), 1)

    def test_a_back_of_a_different_size_is_refused_and_nothing_is_stored(self):
        source = self.open_picker()
        res = self.assign(source, {"front": 3, "back": 1})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "back_size_differs")
        self.assertEqual(Artwork.objects.count(), 0)

    def test_two_pages_of_unmatched_sizes_are_only_the_same_size_if_they_measure_alike(self):
        product_pages = build_pdf({"media": (100, 200)}, {"media": (100, 200)}, {"media": (120, 200)})
        source = self.upload(product_pages).json()["source"]
        same = self.assign(source, {"front": 1, "back": 2})
        self.assertEqual(same.status_code, 201, same.content)
        differs = self.assign(source, {"front": 1, "back": 3})
        self.assertEqual(differs.json()["errors"][0]["code"], "back_size_differs")

    def test_the_same_page_cannot_be_front_and_back(self):
        source = self.open_picker()
        res = self.assign(source, {"front": 3, "back": 3})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "same_page_twice")
        self.assertEqual(Artwork.objects.count(), 0)

    def test_a_back_alone_is_checked_against_an_existing_front(self):
        source = self.open_picker()
        front = self.assign(source, {"front": 3}).json()["front"]
        fits = self.assign(source, {"back": 4, "front_id": front["id"]})
        self.assertEqual(fits.status_code, 201, fits.content)
        self.assertIsNone(fits.json()["front"])
        self.assertEqual(fits.json()["back"]["page_index"], 4)
        clash = self.assign(source, {"back": 1, "front_id": front["id"]})
        self.assertEqual(clash.json()["errors"][0]["code"], "back_size_differs")

    def test_a_back_alone_may_repeat_the_fronts_page(self):
        # "Use the same artwork for the back" sends Front's own page as Back.
        source = self.open_picker()
        front = self.assign(source, {"front": 3}).json()["front"]
        res = self.assign(source, {"back": 3, "front_id": front["id"]})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["back"]["page_index"], 3)

    def test_a_page_outside_the_file_is_refused(self):
        source = self.open_picker()
        for body in ({"front": 0}, {"front": 6}, {"front": "x"}, {"back": 7}):
            res = self.assign(source, body)
            self.assertEqual(res.status_code, 400, body)
            self.assertEqual(res.json()["errors"][0]["code"], "invalid_page")
        self.assertEqual(self.assign(source, {}).status_code, 400)
        self.assertEqual(Artwork.objects.count(), 0)

    def test_only_assigned_pages_are_analysed_or_stored(self):
        source = self.open_picker()
        with patch("orders.views.preflight.run_preflight_bounded", wraps=preflight.run_preflight_bounded) as run, patch(
            "orders.views.render_artwork_images_bounded", wraps=rendering.render_artwork_images_bounded
        ) as render:
            self.assign(source, {"front": 3, "back": 4})
        self.assertEqual(run.call_count, 2)
        self.assertEqual(render.call_count, 2)
        self.assertEqual(sorted(Artwork.objects.values_list("page_index", flat=True)), [3, 4])

    def test_an_expired_source_cannot_be_used(self):
        source = self.open_picker()
        SourceFile.objects.filter(pk=source["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
        for res in (self.assign(source, {"front": 3}), self.client.get(f"/api/sources/{source['id']}/"), self.client.get(source["pages"][0]["thumbnail_url"])):
            self.assertEqual(res.status_code, 410)
        self.assertEqual(self.assign(source, {"front": 3}).json()["errors"][0]["code"], "source_expired")
        self.assertEqual(Artwork.objects.count(), 0)

    def test_an_unknown_source_is_404(self):
        self.assertEqual(self.client.post("/api/sources/999/assign/", {"front": 1}, format="json").status_code, 404)

    def test_resending_an_assignment_with_the_same_key_makes_one_set_of_artwork(self):
        source = self.open_picker()
        first = self.assign(source, {"front": 3, "back": 4, "upload_key": "assign-1"})
        second = self.assign(source, {"front": 3, "back": 4, "upload_key": "assign-1"})
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["front"]["id"], second.json()["front"]["id"])
        self.assertEqual(Artwork.objects.count(), 2)

    def test_abandoning_the_picker_leaves_nothing_ordered(self):
        from .models import Order

        self.open_picker()
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Artwork.objects.count(), 0)

    def test_no_money_in_the_page_list(self):
        body = str(self.upload(build_five_page_mixed()).json()).lower()
        for word in ("price", "vat", "total", "aed"):
            self.assertNotIn(word, body)

    # ---- reopening the picker (ticket 10) ----------------------------------

    def two_page_upload(self, key=None):
        res = self.upload(build_pdf({"media": (148, 210)}, {"media": (148, 210)}), key=key)
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def test_a_two_page_upload_keeps_its_source_so_pages_can_be_swapped(self):
        data = self.two_page_upload()
        self.assertNotIn("source", data)  # still one-shot: no picker opens by itself
        source_id = data["front"]["source_id"]
        self.assertIsNotNone(source_id)
        self.assertEqual(data["back"]["source_id"], source_id)
        self.assertEqual(SourceFile.objects.count(), 1)
        swapped = self.assign({"id": source_id}, {"front": 2, "back": 1})
        self.assertEqual(swapped.status_code, 201, swapped.content)
        self.assertEqual((swapped.json()["front"]["page_index"], swapped.json()["back"]["page_index"]), (2, 1))

    def test_cancelling_a_two_page_upload_by_key_leaves_no_source(self):
        self.two_page_upload(key="k2")
        self.assertEqual(self.client.delete("/api/artworks/?upload_key=k2").status_code, 204)
        self.assertEqual(Artwork.objects.count(), 0)
        self.assertEqual(SourceFile.objects.count(), 0)

    def test_resending_a_two_page_upload_still_makes_one_set(self):
        self.two_page_upload(key="k3")
        self.two_page_upload(key="k3")
        self.assertEqual(Artwork.objects.count(), 2)
        self.assertEqual(SourceFile.objects.count(), 1)

    def test_a_source_with_artwork_stays_usable_after_its_expiry(self):
        source = self.open_picker()
        self.assign(source, {"front": 3})
        SourceFile.objects.filter(pk=source["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.client.get(f"/api/sources/{source['id']}/").status_code, 200)
        self.assertEqual(self.assign(source, {"front": 4}).status_code, 201)

    def test_a_front_alone_is_checked_against_an_existing_back(self):
        source = self.open_picker()
        back = self.assign(source, {"back": 3}).json()["back"]
        fits = self.assign(source, {"front": 4, "back_id": back["id"]})
        self.assertEqual(fits.status_code, 201, fits.content)
        self.assertEqual(fits.json()["front"]["page_index"], 4)
        clash = self.assign(source, {"front": 1, "back_id": back["id"]})
        self.assertEqual(clash.json()["errors"][0]["code"], "back_size_differs")
        self.assertEqual(clash.json()["errors"][0]["slot"], "front")

    def test_a_large_thumbnail_can_be_asked_for_and_is_cached_apart(self):
        source = self.open_picker()
        url = source["pages"][2]["thumbnail_url"]
        small = Image.open(io.BytesIO(b"".join(self.client.get(url).streaming_content)))
        large_res = self.client.get(url + "?size=large")
        self.assertEqual(large_res.status_code, 200)
        large = Image.open(io.BytesIO(b"".join(large_res.streaming_content)))
        self.assertLessEqual(max(small.size), 400)
        self.assertGreater(max(large.size), 400)
        self.assertLessEqual(max(large.size), 1000)
