"""API tests for the Front/Back artwork upload endpoint (orders/views.ArtworkUploadView)."""

import io
import shutil
import tempfile
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import preflight
from .fixtures_pdf import build_f2, build_f3, build_pdf
from .models import Artwork, Option, OptionValue, Product
from .pdf_utils import ERROR_MESSAGES_EN
from .test_preflight import _damaged_but_repairable
from .views import PREFLIGHT_ERROR_MESSAGES_EN


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

    def test_three_pages_asks_for_a_two_page_file_until_the_picker_exists(self):
        res = self.upload(build_pdf(*[{"media": (148, 210)}] * 3))
        self.assertEqual(res.status_code, 400)
        codes = [e["code"] for e in res.json()["errors"]]
        self.assertEqual(codes, ["page_choice_needed"])
        self.assertEqual(res.json()["page_count"], 3)
        self.assertEqual(Artwork.objects.count(), 0)

    def test_fifty_pages_is_not_over_the_cap(self):
        res = self.upload(build_pdf(*[{"media": (148, 210)}] * 50))
        self.assertEqual(res.json()["errors"][0]["code"], "page_choice_needed")

    def test_fifty_one_pages_is_too_many_pages(self):
        res = self.upload(build_pdf(*[{"media": (148, 210)}] * 51))
        self.assertEqual(res.status_code, 400)
        error = res.json()["errors"][0]
        self.assertEqual(error["code"], "too_many_pages")
        self.assertIn("50", error["message"])
        self.assertNotIn("1 or 2", error["message"])
        self.assertEqual(res.json()["page_count"], 51)

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


def _upload_bytes(client, product, data, name, slot="front"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    body = {"file": SimpleUploadedFile(name, data), "slot": slot, "product": product.id}
    return client.post("/api/artworks/", body, format="multipart")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ArtworkContentValidationTests(TestCase):
    """A file is accepted or refused by what it is, not what it is called."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.product = make_product()

    def refused(self, data, name, code):
        res = _upload_bytes(self.client, self.product, data, name)
        self.assertEqual(res.status_code, 400, res.content)
        error = res.json()["errors"][0]
        self.assertEqual(error["code"], code)
        self.assertEqual(error["message"], {**ERROR_MESSAGES_EN, **PREFLIGHT_ERROR_MESSAGES_EN}[code])
        self.assertEqual(Artwork.objects.count(), 0)

    def test_jpg_saved_as_pdf_is_not_a_pdf(self):
        self.refused(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200, "flyer.pdf", "not_a_pdf")

    def test_png_named_pdf_is_not_a_pdf(self):
        self.refused(b"\x89PNG\r\n\x1a\n" + b"\x00" * 200, "flyer.PDF", "not_a_pdf")

    def test_real_pdf_with_a_wrong_extension_is_accepted(self):
        res = _upload_bytes(self.client, self.product, build_pdf({"media": (148, 210)}).read(), "flyer.jpg")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["front"]["matched_size_code"], "a5")

    def test_pdf_with_no_extension_is_accepted(self):
        res = _upload_bytes(self.client, self.product, build_pdf({"media": (148, 210)}).read(), "flyer")
        self.assertEqual(res.status_code, 201, res.content)

    def test_pdf_header_after_a_short_preamble_is_accepted(self):
        data = b"\n\n" + build_pdf({"media": (148, 210)}).read()
        res = _upload_bytes(self.client, self.product, data, "flyer.pdf")
        self.assertEqual(res.status_code, 201, res.content)

    def test_pdf_header_but_unrepairable_is_file_unreadable(self):
        self.refused(b"%PDF-1.4\n" + b"garbage " * 50, "flyer.pdf", "file_unreadable")

    def test_password_protected_is_file_unreadable(self):
        self.refused(build_f3().read(), "flyer.pdf", "file_unreadable")

    def test_oversize_is_file_too_large_even_when_not_a_pdf(self):
        with patch.object(preflight, "MAX_UPLOAD_MB", 0):
            self.refused(b"\xff\xd8\xff" + b"\x00" * 50, "flyer.pdf", "file_too_large")

    def test_repairable_damage_is_accepted_with_a_warning(self):
        res = _upload_bytes(self.client, self.product, _damaged_but_repairable(build_pdf({"media": (148, 210)})).read(), "flyer.pdf")
        self.assertEqual(res.status_code, 201, res.content)
        codes = [f["code"] for f in res.json()["front"]["preflight_report"]["findings"]]
        self.assertIn("file_repaired", codes)

    def test_every_refusal_message_says_what_to_do_next(self):
        for code in ("not_a_pdf", "file_too_large", "file_unreadable", "too_many_pages", "back_size_differs", "network_failed", "server_busy"):
            self.assertIn(code, {**ERROR_MESSAGES_EN, **PREFLIGHT_ERROR_MESSAGES_EN}, code)
            message = ({**ERROR_MESSAGES_EN, **PREFLIGHT_ERROR_MESSAGES_EN})[code]
            self.assertGreater(len(message.split(".")), 2, message)  # a reason plus a next step


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ArtworkFilenameTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.product = make_product()

    def upload_named(self, name):
        res = _upload_bytes(self.client, self.product, build_pdf({"media": (148, 210)}).read(), name)
        self.assertEqual(res.status_code, 201, res.content)
        return Artwork.objects.get(pk=res.json()["front"]["id"])

    def test_path_traversal_is_stripped(self):
        artwork = self.upload_named("../../etc/passwd.pdf")
        self.assertEqual(artwork.original_filename, "passwd.pdf")
        self.assertNotIn("..", artwork.file.name)

    def test_markup_and_control_characters_are_removed(self):
        artwork = self.upload_named('<img src=x onerror=alert(1)>\x00\x1f"flyer".pdf')
        self.assertNotRegex(artwork.original_filename, r'[<>"\x00-\x1f]')
        self.assertTrue(artwork.original_filename.endswith(".pdf"))

    def test_bidi_override_characters_are_removed(self):
        artwork = self.upload_named("flyer\u202efdp.exe.pdf")
        self.assertNotIn("\u202e", artwork.original_filename)

    def test_long_names_are_shortened_and_keep_the_extension(self):
        artwork = self.upload_named("a" * 400 + ".pdf")
        self.assertLessEqual(len(artwork.original_filename), 100)
        self.assertTrue(artwork.original_filename.endswith(".pdf"))

    def test_empty_name_gets_a_default(self):
        artwork = self.upload_named("...")
        self.assertEqual(artwork.original_filename, "artwork.pdf")

    def test_stored_file_is_always_a_pdf_extension(self):
        artwork = self.upload_named("flyer.jpg")
        self.assertEqual(artwork.original_filename, "flyer.pdf")
        self.assertTrue(artwork.file.name.endswith(".pdf"))

    def test_arabic_names_are_kept(self):
        artwork = self.upload_named("منشور.pdf")
        self.assertEqual(artwork.original_filename, "منشور.pdf")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ArtworkUploadKeyTests(TestCase):
    """An upload_key makes a resend of the same upload safe: a retry after a
    dropped connection returns the Artwork the first attempt made instead of a
    duplicate, and a cancelled upload can be cleaned up by its key."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.product = make_product()

    def upload(self, key, slot="front", pages=1):
        buf = build_pdf(*[{"media": (148, 210)}] * pages)
        body = {"file": as_upload(buf), "slot": slot, "product": self.product.id, "upload_key": key}
        return self.client.post("/api/artworks/", body, format="multipart")

    def test_resending_the_same_key_creates_one_artwork(self):
        first = self.upload("key-1")
        second = self.upload("key-1")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["front"]["id"], second.json()["front"]["id"])
        self.assertEqual(Artwork.objects.count(), 1)

    def test_a_two_page_replay_returns_both_slots(self):
        first = self.upload("key-2", pages=2)
        second = self.upload("key-2", pages=2)
        self.assertEqual(first.json()["back"]["id"], second.json()["back"]["id"])
        self.assertEqual(second.json()["page_count"], 2)
        self.assertEqual(Artwork.objects.count(), 2)

    def test_different_keys_are_different_uploads(self):
        self.upload("key-a")
        self.upload("key-b")
        self.assertEqual(Artwork.objects.count(), 2)

    def test_no_key_never_dedupes(self):
        self.upload("")
        self.upload("")
        self.assertEqual(Artwork.objects.count(), 2)

    def test_delete_by_key_removes_what_that_upload_stored(self):
        self.upload("key-x", pages=2)
        keep = self.upload("key-y")
        res = self.client.delete("/api/artworks/?upload_key=key-x")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(list(Artwork.objects.values_list("id", flat=True)), [keep.json()["front"]["id"]])

    def test_delete_by_key_with_nothing_stored_is_fine(self):
        self.assertEqual(self.client.delete("/api/artworks/?upload_key=nope").status_code, 204)

    def test_delete_without_a_key_is_refused(self):
        self.assertEqual(self.client.delete("/api/artworks/").status_code, 400)

    @override_settings(ARTWORK_UPLOAD_RATE="1/min")
    def test_cleanup_is_not_rate_limited(self):
        self.upload("key-z")
        self.assertEqual(self.client.delete("/api/artworks/?upload_key=key-z").status_code, 204)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), ARTWORK_UPLOAD_RATE="3/min")
class ArtworkUploadRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.product = make_product()

    def upload(self, **extra):
        return _upload_bytes_from(self.client, self.product, **extra)

    def test_requests_over_the_limit_are_refused_with_server_busy(self):
        for _ in range(3):
            self.assertEqual(self.upload().status_code, 201)
        res = self.upload()
        self.assertEqual(res.status_code, 429)
        error = res.json()["errors"][0]
        self.assertEqual(error["code"], "server_busy")
        self.assertEqual(error["message"], ERROR_MESSAGES_EN["server_busy"])
        self.assertEqual(Artwork.objects.count(), 3)
        self.assertIn("Retry-After", res)

    def test_a_different_visitor_is_not_limited(self):
        for _ in range(3):
            self.upload()
        res = self.client.post(
            "/api/artworks/",
            {"file": as_upload(build_pdf({"media": (148, 210)})), "slot": "front", "product": self.product.id},
            format="multipart",
            REMOTE_ADDR="10.9.9.9",
        )
        self.assertEqual(res.status_code, 201)

    @override_settings(ARTWORK_UPLOAD_RATE=None)
    def test_no_rate_means_no_limit(self):
        for _ in range(6):
            self.assertEqual(self.upload().status_code, 201)


def _upload_bytes_from(client, product, slot="front"):
    return _upload_bytes(client, product, build_pdf({"media": (148, 210)}).read(), "flyer.pdf", slot=slot)
