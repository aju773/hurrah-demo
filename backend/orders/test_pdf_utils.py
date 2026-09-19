"""TDD tests for the artwork-detection module (orders/pdf_utils.py), against
the rules in docs/.scratch/flyer-demo/issues/08-size-detection-rules.md.

Pure over plain data: no Django ORM, no process pool (analyze_pdf_bytes runs
inline so failures are easy to debug; the process-pool wrapper itself is
exercised by the API tests in test_artwork.py).
"""

from django.test import SimpleTestCase

from .fixtures_pdf import build_f2, build_pdf
from .pdf_utils import ERROR_NOT_A_PDF, analyze_pdf_bytes

TOLERANCE_MM = 1.5
BLEED_MIN_MM = 1.0
BLEED_MAX_MM = 6.0

# code, width_mm, height_mm — the Flyers catalogue's Size values (ISO dims).
SIZE_VALUES = [
    {"id": 1, "code": "a6", "width_mm": 105, "height_mm": 148},
    {"id": 2, "code": "a5", "width_mm": 148, "height_mm": 210},
    {"id": 3, "code": "a4", "width_mm": 210, "height_mm": 297},
    {"id": 4, "code": "a3", "width_mm": 297, "height_mm": 420},
    {"id": 5, "code": "dl", "width_mm": 99, "height_mm": 210},
]


def analyze(*pages):
    data = build_pdf(*pages).read()
    return analyze_pdf_bytes(data, SIZE_VALUES, TOLERANCE_MM, BLEED_MIN_MM, BLEED_MAX_MM)


class ExactMatchTests(SimpleTestCase):
    def test_exact_a5(self):
        result = analyze({"media": (148, 210)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a5")
        self.assertEqual(page["trim_source"], "media")
        self.assertEqual(page["bleed_mm"], 0.0)
        self.assertEqual(page["orientation"], "portrait")

    def test_a4_595x842pt(self):
        # 595x842pt = 209.90 x 297.04mm: within tolerance of A4 by point rounding.
        result = analyze({"media": (595 * 25.4 / 72, 842 * 25.4 / 72)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a4")

    def test_landscape_orientation(self):
        result = analyze({"media": (297, 210)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a4")
        self.assertEqual(page["orientation"], "landscape")

    def test_dl_99_and_100_wide(self):
        for width in (99, 100):
            with self.subTest(width=width):
                result = analyze({"media": (width, 210)})
                page = result["pages"][0]
                self.assertEqual(page["matched_size_code"], "dl")

    def test_us_letter_null_match_reports_mm(self):
        result = analyze({"media": (215.9, 279.4)})
        page = result["pages"][0]
        self.assertIsNone(page["matched_size_code"])
        self.assertEqual(page["trim_width_mm"], 215.9)
        self.assertEqual(page["trim_height_mm"], 279.4)
        self.assertIsNone(page["bleed_mm"])


class InferredBleedTests(SimpleTestCase):
    def test_inferred_3mm_bleed(self):
        result = analyze({"media": (154, 216)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a5")
        self.assertEqual(page["trim_source"], "media_minus_bleed")
        self.assertEqual(page["bleed_mm"], 3.0)
        self.assertEqual((page["trim_width_mm"], page["trim_height_mm"]), (148, 210))

    def test_inferred_3_175mm_bleed_eighth_inch(self):
        bleed = 0.125 * 25.4  # 3.175mm
        result = analyze({"media": (148 + 2 * bleed, 210 + 2 * bleed)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a5")
        self.assertEqual(page["trim_source"], "media_minus_bleed")
        self.assertAlmostEqual(page["bleed_mm"], 3.175, places=1)

    def test_inferred_3_5mm_bleed(self):
        result = analyze({"media": (148 + 7, 210 + 7)})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a5")
        self.assertEqual(page["bleed_mm"], 3.5)


class TrimBoxTests(SimpleTestCase):
    def test_trimbox_with_slug(self):
        # 10mm slug on the MediaBox, 3mm BleedBox margin, A4 TrimBox.
        result = analyze({
            "media": (230, 317),
            "bleed": (7, 7, 223, 310),
            "trim": (10, 10, 220, 307),
        })
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a4")
        self.assertEqual(page["trim_source"], "trimbox")
        self.assertEqual(page["bleed_mm"], 3.0)

    def test_nonmatching_trimbox_is_null_not_ignored(self):
        # A real (smaller) TrimBox that matches no Size: trust it, report no match,
        # not fall through to bleed-guessing against the page box.
        result = analyze({
            "media": (250, 350),
            "trim": (10, 10, 240, 340),  # 230 x 330mm trim: no Size within tolerance
        })
        page = result["pages"][0]
        self.assertIsNone(page["matched_size_code"])
        self.assertEqual(page["trim_source"], "trimbox")
        self.assertEqual(page["trim_width_mm"], 230.0)
        self.assertEqual(page["trim_height_mm"], 330.0)

    def test_cropbox_only(self):
        result = analyze({"media": (160, 220), "crop": (6, 5, 154, 215)})
        page = result["pages"][0]
        self.assertEqual(page["trim_source"], "crop")
        self.assertEqual(page["matched_size_code"], "a5")


class RotationAndUserUnitTests(SimpleTestCase):
    def test_rotate_90_swaps_orientation(self):
        result = analyze({"media": (210, 297), "rotate": 90})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a4")
        self.assertEqual(page["orientation"], "landscape")
        self.assertEqual(page["rotation"], 90)

    def test_user_unit_scales_dimensions(self):
        # A5 at half the normal point size, with UserUnit=2 restoring true mm.
        result = analyze({"media": (74, 105), "user_unit": 2})
        page = result["pages"][0]
        self.assertEqual(page["matched_size_code"], "a5")


class PageCountAndSlotTests(SimpleTestCase):
    def test_two_page_front_back(self):
        result = analyze({"media": (148, 210)}, {"media": (154, 216)})
        self.assertEqual(result["page_count"], 2)
        self.assertEqual(len(result["pages"]), 2)
        self.assertEqual(result["pages"][0]["matched_size_code"], "a5")
        self.assertEqual(result["pages"][1]["matched_size_code"], "a5")
        self.assertEqual(result["pages"][1]["trim_source"], "media_minus_bleed")


class NotAPdfTests(SimpleTestCase):
    def test_garbage_bytes(self):
        result = analyze_pdf_bytes(b"not a pdf at all", SIZE_VALUES, TOLERANCE_MM, BLEED_MIN_MM, BLEED_MAX_MM)
        self.assertEqual(result["error"], ERROR_NOT_A_PDF)


class F2FixtureTests(SimpleTestCase):
    def test_f2_is_a5_double_sided_3mm_bleed(self):
        data = build_f2().read()
        result = analyze_pdf_bytes(data, SIZE_VALUES, TOLERANCE_MM, BLEED_MIN_MM, BLEED_MAX_MM)
        self.assertEqual(result["page_count"], 2)
        for page in result["pages"]:
            self.assertEqual(page["matched_size_code"], "a5")
            self.assertEqual(page["trim_source"], "trimbox")
            self.assertEqual(page["bleed_mm"], 3.0)
            self.assertEqual((page["trim_width_mm"], page["trim_height_mm"]), (148.0, 210.0))
