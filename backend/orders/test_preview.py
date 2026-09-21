"""API tests for the step 2 preview payload (orders/views.ArtworkPreviewView)."""

import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .fixtures_pdf import build_f1
from .models import Option, OptionValue, Product


def make_product():
    product = Product.objects.create(name="Flyers", slug="flyers-preview-test", active=True)
    size = Option.objects.create(product=product, code="size", name_en="Size", pricing_role="base")
    for code, label, w, h in [("a5", "A5", 148, 210), ("a4", "A4", 210, 297)]:
        OptionValue.objects.create(option=size, code=code, label_en=label, width_mm=w, height_mm=h)
    return product


def as_upload(buf, name="flyer.pdf"):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, buf.read(), content_type="application/pdf")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ArtworkPreviewEndpointTests(TestCase):
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
        res = self.client.post(
            "/api/artworks/",
            {"file": as_upload(build_f1()), "slot": "front", "product": self.product.id},
            format="multipart",
        )
        assert res.status_code == 201, res.content
        self.upload = res.json()

    def tearDown(self):
        self.override.disable()

    def preview(self, **params):
        params.setdefault("front", self.upload["front"]["id"])
        return self.client.get(f"/api/products/{self.product.slug}/preview/", params)

    def test_f1_preview_payload_has_image_urls_and_findings_with_bbox(self):
        res = self.preview(back=self.upload["back"]["id"], size="a5")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()

        self.assertEqual(data["ordered_trim_mm"], [148, 210])
        self.assertGreater(data["product_bleed_mm"], 0)
        self.assertGreater(data["product_safe_mm"], 0)

        for slot in (data["front"], data["back"]):
            self.assertTrue(slot["image_url"].startswith("http"))
            self.assertTrue(slot["thumbnail_url"].startswith("http"))
            self.assertIsNone(slot["transform"])
            self.assertEqual(slot["page_box_mm"], [210.0, 297.0])

        front_findings = data["front"]["findings"]
        self.assertTrue(front_findings, "F1 front should have Findings (bleed_missing, low_ppi, rgb_colour)")
        codes = {f["code"] for f in front_findings}
        self.assertIn("low_ppi", codes)
        low_ppi = next(f for f in front_findings if f["code"] == "low_ppi")
        self.assertIsNotNone(low_ppi["bbox"])
        self.assertEqual(len(low_ppi["bbox"]), 4)

    def test_same_as_front_back_has_no_findings_of_its_own(self):
        res = self.preview(same_as_front="true")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(data["back"], {"same_as_front": True})

    def test_missing_front_is_a_400(self):
        res = self.client.get(f"/api/products/{self.product.slug}/preview/")
        self.assertEqual(res.status_code, 400)

    def test_non_numeric_front_is_a_400_not_a_500(self):
        res = self.client.get(f"/api/products/{self.product.slug}/preview/?front=not-a-number")
        self.assertEqual(res.status_code, 400)

    def test_non_numeric_back_is_a_400_not_a_500(self):
        res = self.preview(back="not-a-number")
        self.assertEqual(res.status_code, 400)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ResizeFitFillPreviewTests(TestCase):
    """The "Keep {Size} and resize my file" instruction (ticket 09,
    .scratch/flyer-demo-build/issues/09-keep-size-and-resize-fit-fill.md):
    resize_mode/resize_applies_to on the preview endpoint apply a Fit/Fill
    transform and re-run Preflight on the scaled result, without touching the
    uploaded file."""

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
        size = self.product.options.get(code="size")
        OptionValue.objects.create(option=size, code="a3", label_en="A3", width_mm=297, height_mm=420)
        res = self.client.post(
            "/api/artworks/",
            {"file": as_upload(build_f1()), "slot": "front", "product": self.product.id},
            format="multipart",
        )
        assert res.status_code == 201, res.content
        self.upload = res.json()  # F1: A4 (210x297), no bleed, 200ppi image -> bleed_missing + low_ppi Warnings, rgb_colour Note

    def tearDown(self):
        self.override.disable()

    def preview(self, **params):
        params.setdefault("front", self.upload["front"]["id"])
        return self.client.get(f"/api/products/{self.product.slug}/preview/", params)

    def test_no_resize_mode_leaves_transform_and_findings_untouched(self):
        res = self.preview(size="a5")
        data = res.json()
        self.assertIsNone(data["front"]["transform"])
        codes = {f["code"] for f in data["front"]["findings"]}
        self.assertIn("bleed_missing", codes)

    def test_fit_a4_file_to_a5_order_scale_matches_layla_scenario(self):
        res = self.preview(size="a5", resize_mode="fit")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()

        transform = data["front"]["transform"]
        self.assertEqual(transform["mode"], "fit")
        self.assertAlmostEqual(transform["scale"] * 100, 70.5, delta=0.1)

        findings = data["front"]["findings"]
        codes = {f["code"] for f in findings}
        # Bleed is skipped after a resize, and the scaled-up effective ppi
        # (200 / 0.7048 ~= 284) clears ppi_warn_below (250).
        self.assertNotIn("bleed_missing", codes)
        self.assertNotIn("low_ppi", codes)
        self.assertNotIn("fit_border", codes)  # ~0.34mm border, under the 1mm floor
        self.assertIn("rgb_colour", codes)  # untouched by the resize

    def test_fill_a4_file_to_a3_order_scale_up_can_cross_ppi_into_error(self):
        res = self.preview(size="a3", resize_mode="fill")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()

        transform = data["front"]["transform"]
        self.assertEqual(transform["mode"], "fill")
        self.assertAlmostEqual(transform["scale"] * 100, 144.3, delta=0.1)

        findings = data["front"]["findings"]
        by_code = {f["code"]: f for f in findings}
        self.assertNotIn("bleed_missing", by_code)
        # 200 / 1.4429 ~= 139ppi, below ppi_error_below (150): a Warning became an Error.
        self.assertEqual(by_code["low_ppi"]["value"], 139)
        self.assertEqual(by_code["low_ppi"]["severity"], "error")
        self.assertEqual(by_code["fill_crop"]["severity"], "warning")

    def test_resize_applies_to_can_be_scoped_to_one_slot(self):
        res = self.preview(back=self.upload["back"]["id"], size="a5", resize_mode="fit", resize_applies_to="front")
        data = res.json()
        self.assertIsNotNone(data["front"]["transform"])
        self.assertIsNone(data["back"]["transform"])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class RotatePreviewTests(TestCase):
    """Rotate (ticket 05 of .scratch/flyer-two-page-journey): `rotate` on the
    preview endpoint turns a side a quarter turn: geometry, the page image's
    rotation and the Findings' boxes all follow, and the file is untouched."""

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
        res = self.client.post(
            "/api/artworks/",
            {"file": as_upload(build_f1()), "slot": "front", "product": self.product.id},
            format="multipart",
        )
        assert res.status_code == 201, res.content
        self.upload = res.json()  # F1: A4 portrait, two pages

    def tearDown(self):
        self.override.disable()

    def preview(self, **params):
        params.setdefault("front", self.upload["front"]["id"])
        return self.client.get(f"/api/products/{self.product.slug}/preview/", params)

    def test_without_rotate_nothing_is_turned(self):
        data = self.preview(size="a4").json()
        self.assertEqual(data["front"]["rotation"], 0)
        self.assertEqual(data["front"]["file_trim_mm"], [210.0, 297.0])

    def test_rotate_front_swaps_the_geometry_and_flags_the_rotation(self):
        data = self.preview(size="a4", rotate="front").json()
        self.assertEqual(data["front"]["rotation"], 90)
        self.assertEqual(data["front"]["file_trim_mm"], [297.0, 210.0])
        self.assertEqual(data["front"]["page_box_mm"], [297.0, 210.0])

    def test_rotate_turns_each_finding_box_clockwise(self):
        plain = self.preview(size="a4").json()["front"]["findings"]
        turned = self.preview(size="a4", rotate="front").json()["front"]["findings"]
        before = next(f for f in plain if f["code"] == "low_ppi")["bbox"]
        after = next(f for f in turned if f["code"] == "low_ppi")["bbox"]
        x0, y0, x1, y1 = before
        self.assertEqual(after, [round(297.0 - y1, 2), x0, round(297.0 - y0, 2), x1])

    def test_rotate_keeps_the_other_findings(self):
        plain = self.preview(size="a4").json()["front"]["findings"]
        turned = self.preview(size="a4", rotate="front").json()["front"]["findings"]
        self.assertEqual([f["code"] for f in turned], [f["code"] for f in plain])

    def test_rotate_scopes_to_one_side(self):
        data = self.preview(back=self.upload["back"]["id"], size="a4", rotate="back").json()
        self.assertEqual(data["front"]["rotation"], 0)
        self.assertEqual(data["back"]["rotation"], 90)
        self.assertEqual(data["back"]["file_trim_mm"], [297.0, 210.0])

    def test_rotate_leaves_the_stored_artwork_and_report_unchanged(self):
        artwork_url = f"/api/artworks/{self.upload['front']['id']}/"
        before = self.client.get(artwork_url).json()
        self.preview(size="a4", rotate="front")
        self.assertEqual(self.client.get(artwork_url).json(), before)

    def test_rotate_combines_with_fit(self):
        data = self.preview(size="a5", resize_mode="fit", rotate="front").json()
        self.assertEqual(data["front"]["rotation"], 90)
        self.assertEqual(data["front"]["transform"]["mode"], "fit")
        self.assertAlmostEqual(data["front"]["transform"]["scale"] * 100, 70.5, delta=0.1)
        self.assertNotIn("bleed_missing", {f["code"] for f in data["front"]["findings"]})

    def test_rotate_ignores_unknown_values(self):
        data = self.preview(size="a4", rotate="sideways,").json()
        self.assertEqual(data["front"]["rotation"], 0)

    def test_same_as_front_back_has_no_rotation_of_its_own(self):
        data = self.preview(same_as_front="true", rotate="front,back").json()
        self.assertEqual(data["back"], {"same_as_front": True})
