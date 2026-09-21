"""Tests for orders/size_choice.py: the Fit/Fill maths behind the "Keep
{Size} and resize my file" dialog (ticket 09,
.scratch/flyer-demo-build/issues/09-keep-size-and-resize-fit-fill.md)."""

from django.test import TestCase

from .size_choice import FILL, FIT, clean_rotate, clean_swap, compute_size_choice, rotate_bbox_mm, rotated_mm


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


class RotateTests(TestCase):
    """Rotate: a clockwise quarter turn stored beside the size choice (ticket
    05 of .scratch/flyer-two-page-journey). Geometry only; the file is never
    rewritten."""

    def test_rotated_mm_swaps_width_and_height(self):
        self.assertEqual(rotated_mm([210.0, 148.0], True), [148.0, 210.0])

    def test_rotated_mm_is_unchanged_when_not_rotated(self):
        self.assertEqual(rotated_mm([210.0, 148.0], False), [210.0, 148.0])

    def test_rotated_mm_passes_an_unknown_size_through(self):
        self.assertEqual(rotated_mm([None, None], True), [None, None])

    def test_rotate_bbox_turns_a_box_clockwise_within_the_trim(self):
        # Trim 100 wide x 200 tall. A box in the top-left corner lands in the
        # top-right corner of the 200 x 100 turned page.
        self.assertEqual(rotate_bbox_mm([0.0, 0.0, 10.0, 20.0], [100.0, 200.0]), [180.0, 0.0, 200.0, 10.0])

    def test_rotate_bbox_leaves_no_bbox_alone(self):
        self.assertIsNone(rotate_bbox_mm(None, [100.0, 200.0]))

    def test_clean_rotate_keeps_two_booleans(self):
        self.assertEqual(clean_rotate({"front": 1, "back": 0}, same_as_front=False, has_back=True), {"front": True, "back": False})

    def test_clean_rotate_makes_a_same_as_front_back_follow_the_front(self):
        self.assertEqual(clean_rotate({"front": True, "back": False}, same_as_front=True, has_back=False), {"front": True, "back": True})

    def test_clean_rotate_cannot_rotate_a_missing_back(self):
        self.assertEqual(clean_rotate({"front": False, "back": True}, same_as_front=False, has_back=False), None)

    def test_clean_rotate_is_none_when_nothing_is_rotated_or_it_is_junk(self):
        self.assertIsNone(clean_rotate({"front": False, "back": False}, same_as_front=False, has_back=True))
        self.assertIsNone(clean_rotate("sideways", same_as_front=False, has_back=True))
        self.assertIsNone(clean_rotate(None, same_as_front=False, has_back=True))


class SwapTests(TestCase):
    """Swap: which uploaded page is Front and which is Back, stored beside the
    size choice (ticket 06 of .scratch/flyer-two-page-journey)."""

    def test_clean_swap_is_true_only_for_true_with_two_different_sides(self):
        self.assertTrue(clean_swap(True, same_as_front=False, has_back=True))

    def test_clean_swap_needs_a_back_that_is_not_the_front_again(self):
        self.assertFalse(clean_swap(True, same_as_front=False, has_back=False))
        self.assertFalse(clean_swap(True, same_as_front=True, has_back=False))

    def test_clean_swap_is_false_for_anything_but_true(self):
        self.assertFalse(clean_swap(False, same_as_front=False, has_back=True))
        self.assertFalse(clean_swap("yes", same_as_front=False, has_back=True))
        self.assertFalse(clean_swap(None, same_as_front=False, has_back=True))
