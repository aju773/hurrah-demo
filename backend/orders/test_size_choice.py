"""Tests for orders/size_choice.py: the Fit/Fill maths behind the "Keep
{Size} and resize my file" dialog (ticket 09,
.scratch/flyer-demo-build/issues/09-keep-size-and-resize-fit-fill.md)."""

from django.test import TestCase

from .size_choice import FILL, FIT, compute_size_choice


class ComputeSizeChoiceTests(TestCase):
    def test_layla_a4_file_a5_order_fit(self):
        # A4 file (210x297) resized to fit inside an A5 order (148x210): the
        # width axis drives the scale (148/210 < 210/297), so only the height
        # axis carries a border.
        result = compute_size_choice(FIT, [148.0, 210.0], [210.0, 297.0], 0.0, 3.0)
        self.assertAlmostEqual(result["scale_pct"], 70.5, delta=0.1)
        self.assertLess(result["white_border_mm"], 1.0)
        self.assertEqual(result["edges"], ["top", "bottom"])

    def test_no_match_square_file_a5_order_fit(self):
        # A 200x200mm file against an A5 (148x210) order: both count as
        # portrait-ish (square doesn't flip the target), so target stays
        # 148x210 and the width axis drives the scale.
        result = compute_size_choice(FIT, [148.0, 210.0], [200.0, 200.0], 0.0, 3.0)
        self.assertAlmostEqual(result["scale_pct"], 74.0, delta=0.1)
        self.assertAlmostEqual(result["white_border_mm"], 31.0, delta=0.5)
        self.assertEqual(result["edges"], ["top", "bottom"])

    def test_no_match_square_file_a5_order_fill(self):
        result = compute_size_choice(FILL, [148.0, 210.0], [200.0, 200.0], 0.0, 3.0)
        self.assertAlmostEqual(result["scale_pct"], 108.0, delta=0.1)
        self.assertAlmostEqual(result["crop_mm"], 34.0, delta=0.5)
        self.assertEqual(result["edges"], ["left", "right"])

    def test_fit_scale_of_one_reports_no_border(self):
        result = compute_size_choice(FIT, [148.0, 210.0], [148.0, 210.0], 0.0, 3.0)
        self.assertEqual(result["scale_pct"], 100.0)
        self.assertEqual(result["white_border_mm"], 0.0)
        self.assertIsNone(result["edges"])

    def test_landscape_file_against_portrait_order_swaps_target(self):
        # A landscape A5 file (210x148) against a portrait-ordered A5
        # (148x210): same physical size, so Fit should be a no-op regardless
        # of which axis the order's mm are listed in.
        result = compute_size_choice(FIT, [148.0, 210.0], [210.0, 148.0], 0.0, 3.0)
        self.assertEqual(result["scale_pct"], 100.0)
        self.assertEqual(result["white_border_mm"], 0.0)

    def test_invalid_mode_raises(self):
        with self.assertRaises(ValueError):
            compute_size_choice("stretch", [148.0, 210.0], [148.0, 210.0], 0.0, 3.0)
