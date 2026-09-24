"""Tests for orders/preflight.py: the Preflight report attached to an Artwork
slot on upload (bleed, ppi, fonts, colour, file readability) and its Severity.
"""

import io
import shutil
import tempfile
from unittest.mock import patch

import pikepdf
from django.test import TestCase, override_settings
from pikepdf import Array, Dictionary, Name, Page
from rest_framework.test import APIClient

from . import preflight
from .fixtures_pdf import build_f1, build_f2, build_f3, build_f4, build_live_text, build_pdf, mm, _rgb_image_xobject
from .models import Artwork, Option, OptionValue, Product
from .pdf_utils import analyze_pdf_bytes

PT_PER_MM = 72.0 / 25.4


def make_product():
    product = Product.objects.create(name="Flyers", slug="flyers-preflight-test", active=True)
    size = Option.objects.create(product=product, code="size", name_en="Size", pricing_role="base")
    for code, label, w, h in [("a6", "A6", 105, 148), ("a5", "A5", 148, 210), ("a4", "A4", 210, 297)]:
        OptionValue.objects.create(option=size, code=code, label_en=label, width_mm=w, height_mm=h)
    return product


def as_upload(buf, name="flyer.pdf"):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, buf.read(), content_type="application/pdf")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PreflightEndpointTests(TestCase):
    """API-level: every code and Severity the endpoint can produce."""

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

    def upload(self, buf, slot="front", name="flyer.pdf"):
        body = {"file": as_upload(buf, name), "slot": slot, "product": self.product.id}
        return self.client.post("/api/artworks/", body, format="multipart")

    def test_f1_warnings_and_note_fonts_ok(self):
        res = self.upload(build_f1())
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        front = data["front"]
        self.assertTrue(front["is_valid"])
        report = front["preflight_report"]
        self.assertEqual(report["headline_severity"], "warning")

        by_code = {}
        for f in report["findings"]:
            by_code.setdefault(f["code"], []).append(f)

        self.assertEqual(by_code["bleed_missing"][0]["severity"], "warning")
        low_ppi = by_code["low_ppi"][0]
        self.assertEqual(low_ppi["severity"], "warning")
        self.assertEqual(low_ppi["value"], 200)
        self.assertTrue(all(f["severity"] == "note" for f in by_code["rgb_colour"]))
        self.assertNotIn("font_not_embedded", by_code)

    def test_f2_all_ok(self):
        res = self.upload(build_f2())
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        for slot in ("front", "back"):
            report = data[slot]["preflight_report"]
            self.assertEqual(report["findings"], [])
            self.assertEqual(report["headline_severity"], "ok")
            self.assertTrue(data[slot]["is_valid"])

    def test_live_text_is_refused_even_with_an_embedded_font(self):
        # Owner policy (2026-09): live/selectable text always needs outlining,
        # even when its font is properly embedded — text_not_outlined blocks
        # regardless (unlike low_ppi/etc., which only warn).
        res = self.upload(build_live_text())
        self.assertEqual(res.status_code, 201, res.content)
        front = res.json()["front"]
        self.assertFalse(front["is_valid"])
        self.assertEqual(front["error_code"], "text_not_outlined")
        self.assertIn('"STAY FIT"', front["error_message"])
        self.assertIn("Create Outlines", front["error_message"])
        report = front["preflight_report"]
        self.assertEqual(report["headline_severity"], "error")
        [finding] = [f for f in report["findings"] if f["code"] == "text_not_outlined"]
        self.assertEqual(finding["severity"], "error")
        self.assertEqual(finding["value"], "STAY FIT")

    def test_f3_file_unreadable(self):
        res = self.upload(build_f3())
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "file_unreadable")
        self.assertEqual(Artwork.objects.count(), 0)

    def test_no_artwork_saved_when_unreadable(self):
        # An owner-password-only file (no user password) opens fine and isn't
        # touched by Preflight's encryption check at all.
        buf = build_pdf({"media": (148, 210)})
        pdf = pikepdf.open(buf)
        encrypted = io.BytesIO()
        pdf.save(encrypted, encryption=pikepdf.Encryption(user="", owner="owner-secret"))
        pdf.close()
        encrypted.seek(0)
        res = self.upload(encrypted)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["front"]["matched_size_code"], "a5")


    def test_bleed_short_warns_when_bleed_is_between_1mm_and_the_product_bleed(self):
        # A5 with a uniform 2mm bleed inferred from the page size; Product bleed is 3mm.
        res = self.upload(build_pdf({"media": (152, 214)}))
        self.assertEqual(res.status_code, 201, res.content)
        front = res.json()["front"]
        self.assertEqual(front["matched_size_code"], "a5")
        self.assertEqual(front["bleed_mm"], 2.0)
        short = [f for f in front["preflight_report"]["findings"] if f["code"] == "bleed_short"]
        self.assertEqual(len(short), 1)
        self.assertEqual(short[0]["severity"], "warning")
        self.assertEqual(short[0]["value"], 2.0)
        self.assertEqual(front["preflight_report"]["headline_severity"], "warning")
        self.assertTrue(front["is_valid"])

    def test_repaired_file_warns_file_repaired(self):
        res = self.upload(_damaged_but_repairable(build_pdf({"media": (148, 210)})))
        self.assertEqual(res.status_code, 201, res.content)
        front = res.json()["front"]
        repaired = [f for f in front["preflight_report"]["findings"] if f["code"] == "file_repaired"]
        self.assertEqual(len(repaired), 1)
        self.assertEqual(repaired[0]["severity"], "warning")
        self.assertEqual(front["preflight_report"]["headline_severity"], "warning")
        self.assertTrue(front["is_valid"])

    def test_demo_damaged_fixture_is_repaired_with_only_that_warning(self):
        res = self.upload(build_f4())
        self.assertEqual(res.status_code, 201, res.content)
        front = res.json()["front"]
        self.assertEqual(front["matched_size_code"], "a5")
        report = front["preflight_report"]
        self.assertEqual([(f["code"], f["severity"]) for f in report["findings"] if f["severity"] != "ok"], [("file_repaired", "warning")])
        self.assertEqual(report["headline_severity"], "warning")
        self.assertTrue(front["is_valid"])

    def test_intact_file_is_not_marked_repaired(self):
        res = self.upload(build_pdf({"media": (148, 210)}))
        codes = [f["code"] for f in res.json()["front"]["preflight_report"]["findings"]]
        self.assertNotIn("file_repaired", codes)

    def test_file_over_the_size_limit_is_refused_with_file_too_large(self):
        with patch.object(preflight, "MAX_UPLOAD_MB", 0):
            res = self.upload(build_pdf({"media": (148, 210)}))
        self.assertEqual(res.status_code, 400)
        error = res.json()["errors"][0]
        self.assertEqual(error["code"], "file_too_large")
        self.assertEqual(error["message"], preflight.MESSAGES_EN[("file_too_large", preflight.ERROR)])
        self.assertEqual(Artwork.objects.count(), 0)


def _damaged_but_repairable(buf):
    """The same PDF with a wrong startxref offset: pikepdf reconstructs the cross-
    reference table and records a warning, but every page survives."""
    data = buf.read()
    index = data.rindex(b"startxref")
    tail = data[index:].split(b"\n")
    tail[1] = b"9"
    return io.BytesIO(data[:index] + b"\n".join(tail))


class CheckFileTests(TestCase):
    def test_too_large(self):
        result = preflight.check_file(b"x" * 10, max_mb=0)
        self.assertEqual(result["status"], "too_large")

    def test_user_password_is_unreadable(self):
        f3 = build_f3().read()
        self.assertEqual(preflight.check_file(f3)["status"], "unreadable")

    def test_owner_password_only_is_ok(self):
        buf = build_pdf({"media": (148, 210)})
        pdf = pikepdf.open(buf)
        encrypted = io.BytesIO()
        pdf.save(encrypted, encryption=pikepdf.Encryption(user="", owner="owner-secret"))
        pdf.close()
        encrypted.seek(0)
        self.assertEqual(preflight.check_file(encrypted.read())["status"], "ok")

    def test_garbage_bytes_pass_through_as_ok(self):
        # Not preflight's job: pdf_utils' existing not_a_pdf handling owns this.
        self.assertEqual(preflight.check_file(b"not a pdf")["status"], "ok")


def _geometry_for(page_result):
    return {
        "trim_rect_pt": page_result["trim_rect_pt"],
        "media_rect_pt": page_result["media_rect_pt"],
        "bleed_outer_rect_pt": page_result["bleed_outer_rect_pt"],
        "bleed_mm": page_result["bleed_mm"],
    }


THRESHOLDS = {"bleed_mm": 3.0, "ppi_error_below": 150, "ppi_warn_below": 250}
A5_SIZES = [{"id": 1, "code": "a5", "width_mm": 148.0, "height_mm": 210.0}]


def _build_image_pdf(trim_w_mm, trim_h_mm, placed_w_mm, placed_h_mm, px_w, px_h, ctm=None, at=(0, 0)):
    """A single-page PDF, TrimBox == MediaBox (no bleed), one RGB image placed
    at `at` (mm) with footprint `placed_w_mm` x `placed_h_mm`, using pixel
    size `px_w` x `px_h`. `ctm` overrides the placement matrix outright
    (for a rotated placement) if given."""
    pdf = pikepdf.new()
    page_dict = pdf.make_indirect(Dictionary(
        Type=Name.Page,
        MediaBox=Array([0, 0, mm(trim_w_mm), mm(trim_h_mm)]),
        Resources=Dictionary(XObject=Dictionary()),
    ))
    page = Page(page_dict)
    pdf.pages.append(page)
    image = _rgb_image_xobject(pdf, px_w, px_h)
    page.obj.Resources.XObject.Im0 = image

    if ctm is None:
        a, b, c, d, e, f = mm(placed_w_mm), 0, 0, mm(placed_h_mm), mm(at[0]), mm(at[1])
    else:
        a, b, c, d, e, f = ctm
    content = f"q {a:.4f} {b:.4f} {c:.4f} {d:.4f} {e:.4f} {f:.4f} cm /Im0 Do Q".encode()
    page.obj.Contents = pdf.make_stream(content)

    buf = io.BytesIO()
    pdf.save(buf)
    buf.seek(0)
    return buf.read()


class PpiGeometryTests(TestCase):
    """Direct preflight.run_preflight tests for scenarios not covered by the
    named F1/F2/F3 fixtures: rotated placement, tiny/ignored images, and the
    time budget."""

    def test_rotated_image_ppi_uses_transform_not_pixel_metadata(self):
        # A 40x60mm footprint at 100ppi (below ppi_warn_below), placed via a
        # 90-degree rotation matrix: pdfium's own page-level metadata would
        # get this wrong (it doesn't know the placement is rotated); the
        # vector-length method used here is rotation-invariant.
        placed_w_mm, placed_h_mm, ppi = 40.0, 60.0, 200
        px_w = round(placed_w_mm / 25.4 * ppi)
        px_h = round(placed_h_mm / 25.4 * ppi)
        # Rotate 90 degrees: width maps onto the y-axis, height onto -x-axis.
        ctm = (0, mm(placed_w_mm), -mm(placed_h_mm), 0, mm(80), mm(50))
        file_bytes = _build_image_pdf(148.0, 210.0, placed_w_mm, placed_h_mm, px_w, px_h, ctm=ctm)

        result = analyze_pdf_bytes(file_bytes, A5_SIZES, 1.5, 1.0, 6.0)
        geometry = _geometry_for(result["pages"][0])
        report = preflight.run_preflight(file_bytes, 1, geometry, THRESHOLDS, "front")

        low_ppi = [f for f in report["findings"] if f["code"] == "low_ppi"]
        self.assertEqual(len(low_ppi), 1)
        self.assertEqual(low_ppi[0]["value"], ppi)
        self.assertEqual(low_ppi[0]["severity"], "warning")

    def test_tiny_image_below_two_percent_of_trim_is_ignored(self):
        # A tiny, terrible-ppi image covering well under 2% of the A5 trim
        # area (148x210mm = 31080mm^2): 3x3mm = 9mm^2, ~0.03%.
        file_bytes = _build_image_pdf(148.0, 210.0, 3.0, 3.0, px_w=5, px_h=5, at=(10, 10))
        result = analyze_pdf_bytes(file_bytes, A5_SIZES, 1.5, 1.0, 6.0)
        geometry = _geometry_for(result["pages"][0])
        report = preflight.run_preflight(file_bytes, 1, geometry, THRESHOLDS, "front")

        self.assertEqual([f for f in report["findings"] if f["code"] == "low_ppi"], [])

    def test_tiny_budget_yields_check_incomplete(self):
        file_bytes = build_f1().read()
        result = analyze_pdf_bytes(file_bytes, [{"id": 1, "code": "a4", "width_mm": 210.0, "height_mm": 297.0}], 1.5, 1.0, 6.0)
        geometry = _geometry_for(result["pages"][0])

        report = preflight.run_preflight(file_bytes, 1, geometry, THRESHOLDS, "front", budget_s=0.0)

        codes = [f["code"] for f in report["findings"]]
        self.assertIn("check_incomplete", codes)
        self.assertEqual(report["headline_severity"], "warning")


class RescaleReportTests(TestCase):
    """orders/preflight.rescale_report: the Fit/Fill re-check (ticket 09,
    "After Fit or Fill" in
    .scratch/flyer-demo/issues/09-preflight-checks-and-severity.md)."""

    def test_bleed_findings_are_dropped(self):
        base = preflight.build_report(
            [preflight.finding("bleed_missing", preflight.WARNING, value=0.0, slot="front", page=1)], THRESHOLDS
        )
        size_choice = {"mode": "fit", "scale": 0.9, "white_border_mm": 0.5, "crop_mm": None}
        report = preflight.rescale_report(base, size_choice, 3.0, "front", 1)
        self.assertEqual(report["findings"], [])
        self.assertEqual(report["headline_severity"], "ok")

    def test_low_ppi_divided_by_scale_can_cross_into_error(self):
        # 200ppi Warning (< 250, >= 150) shrunk to 60%: 200/0.6 = 333 -> OK; a
        # different scale can push the same base Finding the other way.
        base = preflight.build_report(
            [preflight.finding("low_ppi", preflight.WARNING, value=200, slot="front", page=1)], THRESHOLDS
        )
        shrunk = preflight.rescale_report(
            base, {"mode": "fit", "scale": 0.9, "white_border_mm": 0.0, "crop_mm": None}, 3.0, "front", 1
        )
        low_ppi = [f for f in shrunk["findings"] if f["code"] == "low_ppi"][0]
        self.assertEqual(low_ppi["value"], round(200 / 0.9))
        self.assertEqual(low_ppi["severity"], "warning")

        enlarged = preflight.rescale_report(
            base, {"mode": "fill", "scale": 2.0, "white_border_mm": None, "crop_mm": 0.0}, 3.0, "front", 1
        )
        low_ppi = [f for f in enlarged["findings"] if f["code"] == "low_ppi"][0]
        self.assertEqual(low_ppi["value"], 100)
        self.assertEqual(low_ppi["severity"], "error")

    def test_low_ppi_scaled_back_to_ok_is_dropped(self):
        base = preflight.build_report(
            [preflight.finding("low_ppi", preflight.WARNING, value=240, slot="front", page=1)], THRESHOLDS
        )
        report = preflight.rescale_report(
            base, {"mode": "fit", "scale": 0.5, "white_border_mm": 0.0, "crop_mm": None}, 3.0, "front", 1
        )
        self.assertEqual(report["findings"], [])

    def test_fit_border_under_1mm_is_ok(self):
        base = preflight.build_report([], THRESHOLDS)
        report = preflight.rescale_report(
            base, {"mode": "fit", "scale": 0.9, "white_border_mm": 0.4, "crop_mm": None}, 3.0, "front", 1
        )
        self.assertEqual(report["findings"], [])

    def test_fit_border_at_least_1mm_warns(self):
        base = preflight.build_report([], THRESHOLDS)
        report = preflight.rescale_report(
            base, {"mode": "fit", "scale": 0.74, "white_border_mm": 31.0, "crop_mm": None}, 3.0, "front", 1
        )
        codes = [f["code"] for f in report["findings"]]
        self.assertEqual(codes, ["fit_border"])
        self.assertEqual(report["findings"][0]["severity"], "warning")

    def test_fill_crop_within_product_bleed_is_ok(self):
        base = preflight.build_report([], THRESHOLDS)
        report = preflight.rescale_report(
            base, {"mode": "fill", "scale": 1.08, "white_border_mm": None, "crop_mm": 3.0}, 3.0, "front", 1
        )
        self.assertEqual(report["findings"], [])

    def test_fill_crop_past_bleed_by_1mm_or_more_warns(self):
        base = preflight.build_report([], THRESHOLDS)
        report = preflight.rescale_report(
            base, {"mode": "fill", "scale": 1.08, "white_border_mm": None, "crop_mm": 34.0}, 3.0, "front", 1
        )
        self.assertEqual([f["code"] for f in report["findings"]], ["fill_crop"])
        self.assertEqual(report["findings"][0]["value"], 31.0)

    def test_other_finding_codes_pass_through_unchanged(self):
        base = preflight.build_report(
            [
                preflight.finding("font_not_embedded", preflight.ERROR, value="Foo", slot="front", page=1),
                preflight.finding("rgb_colour", preflight.NOTE, value="vector", slot="front", page=1),
            ],
            THRESHOLDS,
        )
        report = preflight.rescale_report(
            base, {"mode": "fit", "scale": 0.9, "white_border_mm": 0.0, "crop_mm": None}, 3.0, "front", 1
        )
        self.assertEqual({f["code"] for f in report["findings"]}, {"font_not_embedded", "rgb_colour"})
        self.assertEqual(report["headline_severity"], "error")


class RotateReportTests(TestCase):
    """orders/preflight.rotate_report: Findings re-made for a quarter turn."""

    def test_bbox_is_turned_clockwise_within_the_trim(self):
        base = preflight.build_report(
            [preflight.finding("low_ppi", preflight.WARNING, value=200, slot="front", page=1, bbox=[0.0, 0.0, 10.0, 20.0])], THRESHOLDS
        )
        report = preflight.rotate_report(base, [100.0, 200.0])
        self.assertEqual(report["findings"][0]["bbox"], [180.0, 0.0, 200.0, 10.0])
        self.assertEqual(report["rotation"], 90)

    def test_findings_without_a_bbox_and_the_headline_are_kept(self):
        base = preflight.build_report([preflight.finding("bleed_missing", preflight.WARNING, value=0.0, slot="front", page=1)], THRESHOLDS)
        report = preflight.rotate_report(base, [100.0, 200.0])
        self.assertEqual(report["findings"], base["findings"])
        self.assertEqual(report["headline_severity"], "warning")

    def test_the_stored_report_is_not_changed(self):
        base = preflight.build_report(
            [preflight.finding("low_ppi", preflight.WARNING, value=200, slot="front", page=1, bbox=[0.0, 0.0, 10.0, 20.0])], THRESHOLDS
        )
        preflight.rotate_report(base, [100.0, 200.0])
        self.assertEqual(base["findings"][0]["bbox"], [0.0, 0.0, 10.0, 20.0])
        self.assertNotIn("rotation", base)


class HasBlockingErrorTests(TestCase):
    """orders/preflight.has_blocking_error: only BLOCKING_CODES (font_not_embedded,
    text_not_outlined) stop Continue/Submit — every other Error is a caution."""

    def test_true_for_a_blocking_code(self):
        findings = [preflight.finding("font_not_embedded", preflight.ERROR, value="Foo", slot="front", page=1)]
        self.assertTrue(preflight.has_blocking_error(findings))

    def test_true_for_text_not_outlined(self):
        findings = [{"code": "text_not_outlined", "severity": preflight.ERROR, "value": "x", "slot": "front", "page": 1, "bbox": None, "message": "x"}]
        self.assertTrue(preflight.has_blocking_error(findings))

    def test_false_for_a_non_blocking_error(self):
        findings = [preflight.finding("low_ppi", preflight.ERROR, value=50, slot="front", page=1)]
        self.assertFalse(preflight.has_blocking_error(findings))

    def test_false_with_no_findings(self):
        self.assertFalse(preflight.has_blocking_error([]))
