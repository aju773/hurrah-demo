"""API tests for Artwork templates: the list and download endpoints, the PDF's
geometry and guides, caching, and the self-consistency rule (a template uploaded
unchanged is a perfect match)."""

import io
import shutil
import tempfile
from unittest.mock import patch

import pikepdf
import pypdfium2 as pdfium
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import artwork_templates
from .models import OptionValue, Product
from .test_artwork import as_upload, make_product

MM = 72.0 / 25.4


def _mm(box):
    return [round(float(v) / MM, 2) for v in box]


class ArtworkTemplateTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.product = make_product()
        self.list_url = f"/api/products/{self.product.slug}/templates/"

    def download(self, size_code):
        return self.client.get(f"{self.list_url}{size_code}/")

    def open_pdf(self, size_code):
        res = self.download(size_code)
        self.assertEqual(res.status_code, 200, res.content)
        pdf = pikepdf.open(io.BytesIO(res.content))
        self.addCleanup(pdf.close)  # pages are only valid while their PDF is open
        return pdf

    def size_value(self, code):
        return OptionValue.objects.get(option__product=self.product, option__code="size", code=code)


class TemplateListTests(ArtworkTemplateTestCase):
    def test_lists_one_template_per_active_size_in_order(self):
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, 200)
        codes = [t["size_code"] for t in res.json()["templates"]]
        self.assertEqual(codes, ["a6", "a5", "a4", "a3", "dl"])

    def test_list_follows_the_products_active_sizes(self):
        OptionValue.objects.filter(option__product=self.product, code="a3").update(active=False)
        OptionValue.objects.create(option=self.size_value("a5").option, code="a2", label_en="A2", width_mm=420, height_mm=594)
        codes = [t["size_code"] for t in self.client.get(self.list_url).json()["templates"]]
        self.assertNotIn("a3", codes)
        self.assertIn("a2", codes)

    def test_each_entry_carries_its_size_and_a_download_link(self):
        entry = next(t for t in self.client.get(self.list_url).json()["templates"] if t["size_code"] == "a5")
        self.assertEqual(entry["label"], "A5")
        self.assertEqual((entry["width_mm"], entry["height_mm"]), (148, 210))
        self.assertEqual(self.client.get(entry["url"]).status_code, 200)

    def test_labels_follow_the_requested_locale(self):
        OptionValue.objects.filter(option__product=self.product, code="a5").update(label_ar="أ٥")
        entry = lambda locale: next(
            t for t in self.client.get(self.list_url, {"locale": locale}).json()["templates"] if t["size_code"] == "a5"
        )
        self.assertEqual(entry("ar")["label"], "أ٥")
        self.assertEqual(entry("en")["label"], "A5")

    def test_guide_thresholds_come_from_the_product(self):
        Product.objects.filter(pk=self.product.pk).update(bleed_mm=4.0, safe_mm=6.5, ppi_error_below=120.0, ppi_warn_below=200.0)
        guide = self.client.get(self.list_url).json()["guide"]
        self.assertEqual(guide, {"bleed_mm": 4.0, "safe_mm": 6.5, "ppi_error_below": 120.0, "ppi_warn_below": 200.0})

    def test_unknown_product_is_a_404(self):
        self.assertEqual(self.client.get("/api/products/nope/templates/").status_code, 404)


class TemplateDownloadTests(ArtworkTemplateTestCase):
    def test_a_download_is_a_pdf_named_for_the_size(self):
        res = self.download("a5")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertIn("attachment", res["Content-Disposition"])
        self.assertIn("a5", res["Content-Disposition"])
        self.assertTrue(res.content.startswith(b"%PDF-"))

    def test_unknown_or_inactive_size_is_a_404(self):
        self.assertEqual(self.download("a9").status_code, 404)
        OptionValue.objects.filter(option__product=self.product, code="a3").update(active=False)
        self.assertEqual(self.download("a3").status_code, 404)

    def test_two_pages_with_media_to_bleed_and_trim_at_the_cut_line(self):
        for code, (w, h) in {"a6": (105, 148), "a5": (148, 210), "dl": (99, 210)}.items():
            with self.subTest(size=code):
                pdf = self.open_pdf(code)
                self.assertEqual(len(pdf.pages), 2)
                for page in pdf.pages:
                    self.assertEqual(_mm(page.mediabox), [0, 0, w + 6, h + 6])
                    self.assertEqual(_mm(page.bleedbox), [0, 0, w + 6, h + 6])
                    self.assertEqual(_mm(page.trimbox), [3, 3, w + 3, h + 3])

    def test_page_follows_the_products_bleed(self):
        Product.objects.filter(pk=self.product.pk).update(bleed_mm=5.0)
        pdf = self.open_pdf("a5")
        page = pdf.pages[0]
        self.assertEqual(_mm(page.mediabox), [0, 0, 158, 220])
        self.assertEqual(_mm(page.trimbox), [5, 5, 153, 215])

    def test_text_is_never_a_font(self):
        """A template must not trip Preflight's font check itself: no font resources at all."""
        pdf = self.open_pdf("a5")
        for page in pdf.pages:
            self.assertNotIn("/Font", page.obj.Resources)
            self.assertNotIn(b" Tf", page.Contents.read_bytes())

    def _render(self, size_code, page_number=0, scale=4):
        res = self.download(size_code)
        doc = pdfium.PdfDocument(res.content)
        try:
            bitmap = doc[page_number].render(scale=scale)
            return bitmap.to_pil().convert("RGB")
        finally:
            doc.close()

    def _has_ink(self, image, x0_mm, y0_mm, x1_mm, y1_mm, scale=4):
        box = (round(x0_mm * MM * scale), round(y0_mm * MM * scale), round(x1_mm * MM * scale), round(y1_mm * MM * scale))
        return image.crop(box).convert("L").point(lambda v: 255 if v < 250 else 0).getbbox() is not None

    def test_guides_are_drawn_at_the_cut_line_the_bleed_edge_and_the_safe_area(self):
        image = self._render("a5")
        y = 3 + 60  # well above the labels, which sit around the middle of the page
        # The Bleed area is tinted, never white paper, and the Bleed edge is marked.
        self.assertTrue(self._has_ink(image, 0.2, y, 2.8, y + 20))
        self.assertTrue(self._has_ink(image, 0, y, 0.6, y + 20))
        # A line sits on the cut line, and another at the Safe area, 5mm inside it.
        self.assertTrue(self._has_ink(image, 2.8, y, 3.3, y + 20))
        self.assertTrue(self._has_ink(image, 7.7, y, 8.3, y + 20))
        # Between the cut line and the Safe area the design area is clear.
        self.assertFalse(self._has_ink(image, 3.6, y, 7.4, y + 20))

    def test_size_name_and_measurements_are_written_on_each_page(self):
        for page_number in (0, 1):
            image = self._render("a5", page_number)
            centre = (3 + 74, 3 + 105)
            self.assertTrue(self._has_ink(image, centre[0] - 40, centre[1] - 20, centre[0] + 40, centre[1] + 20), page_number)

    def test_english_and_arabic_label_lines_are_on_each_page(self):
        pdf = self.open_pdf("a5")
        for page in pdf.pages:
            self.assertGreaterEqual(len(page.obj.Resources.XObject.keys()), 6)  # three English and three Arabic lines

    def test_front_and_back_pages_are_labelled_differently(self):
        front = self._render("a5", 0)
        back = self._render("a5", 1)
        self.assertNotEqual(front.tobytes(), back.tobytes())


class TemplateCachingTests(ArtworkTemplateTestCase):
    def test_second_download_is_served_from_the_cache(self):
        real = artwork_templates.build_template_pdf
        with patch.object(artwork_templates, "build_template_pdf", side_effect=real) as build:
            first = self.download("a5")
            second = self.download("a5")
        self.assertEqual(build.call_count, 1)
        self.assertEqual(first.content, second.content)

    def test_changing_the_bleed_regenerates(self):
        real = artwork_templates.build_template_pdf
        with patch.object(artwork_templates, "build_template_pdf", side_effect=real) as build:
            self.download("a5")
            Product.objects.filter(pk=self.product.pk).update(bleed_mm=4.0)
            res = self.download("a5")
        self.assertEqual(build.call_count, 2)
        with pikepdf.open(io.BytesIO(res.content)) as pdf:
            self.assertEqual(_mm(pdf.pages[0].mediabox), [0, 0, 156, 218])

    def test_changing_the_safe_area_regenerates(self):
        real = artwork_templates.build_template_pdf
        with patch.object(artwork_templates, "build_template_pdf", side_effect=real) as build:
            self.download("a5")
            Product.objects.filter(pk=self.product.pk).update(safe_mm=8.0)
            self.download("a5")
        self.assertEqual(build.call_count, 2)

    def test_changing_the_size_regenerates(self):
        real = artwork_templates.build_template_pdf
        with patch.object(artwork_templates, "build_template_pdf", side_effect=real) as build:
            self.download("a5")
            OptionValue.objects.filter(option__product=self.product, code="a5").update(width_mm=150, height_mm=212)
            res = self.download("a5")
        self.assertEqual(build.call_count, 2)
        with pikepdf.open(io.BytesIO(res.content)) as pdf:
            self.assertEqual(_mm(pdf.pages[0].trimbox), [3, 3, 153, 215])


class TemplateSelfConsistencyTests(ArtworkTemplateTestCase):
    """Uploading an unmodified template must give an exact Size match, Bleed at
    the Product's value and a "Ready to print" headline."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.override = override_settings(MEDIA_ROOT=self._media_root)
        self.override.enable()

    def tearDown(self):
        self.override.disable()

    def upload_template(self, code):
        res = self.download(code)
        self.assertEqual(res.status_code, 200)
        body = {"file": as_upload(io.BytesIO(res.content), f"{code}-template.pdf"), "slot": "front", "product": self.product.id}
        return self.client.post("/api/artworks/", body, format="multipart")

    def assert_every_active_size_round_trips(self):
        codes = [t["size_code"] for t in self.client.get(self.list_url).json()["templates"]]
        self.assertTrue(codes)
        for code in codes:
            with self.subTest(size=code, bleed=self.product.bleed_mm):
                res = self.upload_template(code)
                self.assertEqual(res.status_code, 201, res.content)
                data = res.json()
                self.assertEqual(data["errors"], [])
                for side in ("front", "back"):
                    artwork = data[side]
                    self.assertEqual(artwork["matched_size_code"], code)
                    self.assertEqual(artwork["bleed_mm"], self.product.bleed_mm)
                    self.assertEqual(artwork["preflight_report"]["headline_severity"], "ok")
                    self.assertEqual(artwork["preflight_report"]["findings"], [])

    def test_every_active_size_at_the_default_bleed(self):
        self.assert_every_active_size_round_trips()

    def test_every_active_size_at_a_different_bleed(self):
        Product.objects.filter(pk=self.product.pk).update(bleed_mm=5.0)
        self.product.refresh_from_db()
        self.assert_every_active_size_round_trips()

    def test_the_seeded_flyers_product_round_trips(self):
        self.product = Product.objects.get(slug="flyers")
        self.list_url = f"/api/products/{self.product.slug}/templates/"
        self.assert_every_active_size_round_trips()
