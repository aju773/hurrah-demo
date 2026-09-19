"""API tests for the Front/Back artwork upload endpoint (orders/views.ArtworkUploadView)."""

import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .fixtures_pdf import build_f2, build_pdf
from .models import Artwork, Option, OptionValue, Product


def make_product():
    product = Product.objects.create(name="Flyers", slug="flyers-test", active=True)
    size = Option.objects.create(product=product, code="size", name_en="Size", pricing_role="base")
    sizes = [
        ("a6", "A6", 105, 148),
        ("a5", "A5", 148, 210),
        ("a4", "A4", 210, 297),
        ("a3", "A3", 297, 420),
        ("dl", "DL", 99, 210),
    ]
    for code, label, w, h in sizes:
        OptionValue.objects.create(option=size, code=code, label_en=label, width_mm=w, height_mm=h)
    return product


def as_upload(buf, name="flyer.pdf"):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, buf.read(), content_type="application/pdf")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ArtworkUploadEndpointTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.override = override_settings(MEDIA_ROOT=self._media_root)
        self.override.enable()
        self.client = APIClient()
        self.product = make_product()

    def tearDown(self):
        self.override.disable()

    def upload(self, buf, slot="front", front_id=None, name="flyer.pdf"):
        body = {"file": as_upload(buf, name), "slot": slot, "product": self.product.id}
        if front_id is not None:
            body["front_id"] = front_id
        return self.client.post("/api/artworks/", body, format="multipart")

    def test_exact_a5_front(self):
        res = self.upload(build_pdf({"media": (148, 210)}))
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["page_count"], 1)
        self.assertEqual(data["front"]["matched_size_code"], "a5")
        self.assertIsNone(data["back"])
        self.assertEqual(data["errors"], [])

    def test_two_page_front_auto_fills_back(self):
        res = self.upload(build_pdf({"media": (148, 210)}, {"media": (154, 216)}))
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["page_count"], 2)
        self.assertEqual(data["front"]["matched_size_code"], "a5")
        self.assertEqual(data["back"]["matched_size_code"], "a5")
        self.assertEqual(Artwork.objects.count(), 2)

    def test_two_pages_in_back_is_error(self):
        res = self.upload(build_pdf({"media": (148, 210)}, {"media": (148, 210)}), slot="back")
        self.assertEqual(res.status_code, 400)
        codes = [e["code"] for e in res.json()["errors"]]
        self.assertIn("back_one_page", codes)
        self.assertEqual(Artwork.objects.count(), 0)

    def test_three_pages_is_error(self):
        res = self.upload(build_pdf(*[{"media": (148, 210)}] * 3))
        self.assertEqual(res.status_code, 400)
        codes = [e["code"] for e in res.json()["errors"]]
        self.assertIn("too_many_pages", codes)
        self.assertEqual(res.json()["page_count"], 3)

    def test_back_size_differs_from_front(self):
        front_res = self.upload(build_pdf({"media": (148, 210)}), slot="front")
        front_id = front_res.json()["front"]["id"]

        back_res = self.upload(build_pdf({"media": (210, 297)}), slot="back", front_id=front_id)
        self.assertEqual(back_res.status_code, 201, back_res.content)
        back_data = back_res.json()["back"]
        self.assertFalse(back_data["is_valid"])
        self.assertEqual(back_data["error_code"], "back_size_differs")
        # still reports what was detected, not a silent drop
        self.assertEqual(back_data["matched_size_code"], "a4")

    def test_not_a_pdf(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        body = {
            "file": SimpleUploadedFile("flyer.pdf", b"not a real pdf", content_type="application/pdf"),
            "slot": "front",
            "product": self.product.id,
        }
        res = self.client.post("/api/artworks/", body, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "not_a_pdf")

    def test_non_matching_trimbox_returns_null_match(self):
        res = self.upload(build_pdf({
            "media": (250, 350),
            "trim": (10, 10, 240, 340),
        }))
        self.assertEqual(res.status_code, 201)
        front = res.json()["front"]
        self.assertIsNone(front["matched_size_code"])
        self.assertTrue(front["is_valid"])  # no match isn't itself a blocking error

    def test_f2_fixture_is_a5_double_sided_3mm_bleed(self):
        res = self.upload(build_f2())
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["page_count"], 2)
        for slot in ("front", "back"):
            self.assertEqual(data[slot]["matched_size_code"], "a5")
            self.assertEqual(data[slot]["bleed_mm"], 3.0)
            self.assertEqual(data[slot]["trim_source"], "trimbox")

    def test_invalid_slot_rejected(self):
        res = self.upload(build_pdf({"media": (148, 210)}), slot="middle")
        self.assertEqual(res.status_code, 400)

    def test_no_price_fields_in_response(self):
        res = self.upload(build_pdf({"media": (148, 210)}))
        body = res.json()
        serialized = str(body)
        for forbidden in ("price", "quote", "quantity"):
            self.assertNotIn(forbidden, serialized.lower())
