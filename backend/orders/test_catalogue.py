from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .catalogue import load_catalogue
from .models import Product
from .pricing import compute_quote, price_grid
from .rules import blocked_reason, default_selection, resolve_selection

# A minimal synthetic catalogue for pure rules/pricing tests: two Options (X base,
# Y uplift), a Restriction between one pair of values, and one priced combination.
FAKE_CATALOGUE = {
    "options": [
        {
            "code": "x",
            "name_en": "X",
            "name_ar": "",
            "pricing_role": "base",
            "yield_order": 10,
            "values": [
                {"code": "x1", "label_en": "X1", "label_ar": "", "is_default": True, "integer_value": None,
                 "width_mm": None, "height_mm": None, "page_count": None, "uplift_percent": None,
                 "cutoff_time": None, "working_day_offset": None},
                {"code": "x2", "label_en": "X2", "label_ar": "", "is_default": False, "integer_value": None,
                 "width_mm": None, "height_mm": None, "page_count": None, "uplift_percent": None,
                 "cutoff_time": None, "working_day_offset": None},
            ],
        },
        {
            "code": "y",
            "name_en": "Y",
            "name_ar": "",
            "pricing_role": "uplift",
            "yield_order": 0,
            "values": [
                {"code": "y1", "label_en": "Y1", "label_ar": "", "is_default": True, "integer_value": None,
                 "width_mm": None, "height_mm": None, "page_count": None, "uplift_percent": 0,
                 "cutoff_time": None, "working_day_offset": None},
                {"code": "y2", "label_en": "Y2", "label_ar": "", "is_default": False, "integer_value": None,
                 "width_mm": None, "height_mm": None, "page_count": None, "uplift_percent": 50,
                 "cutoff_time": None, "working_day_offset": None},
            ],
        },
        {
            "code": "quantity",
            "name_en": "Quantity",
            "name_ar": "",
            "pricing_role": "base",
            "yield_order": 20,
            "values": [
                {"code": "q1", "label_en": "1", "label_ar": "", "is_default": True, "integer_value": 1,
                 "width_mm": None, "height_mm": None, "page_count": None, "uplift_percent": None,
                 "cutoff_time": None, "working_day_offset": None},
            ],
        },
    ],
    "restrictions": [
        {"x": ("x", "x2"), "y": ("y", "y2"), "reason_en": "X2 blocks Y2", "reason_ar": ""},
    ],
    "base_prices": [
        {"combo": {"x": "x1", "quantity": "q1"}, "amount_fils": 10000},
        {"combo": {"x": "x2", "quantity": "q1"}, "amount_fils": 20000},
    ],
}


class RulesTests(TestCase):
    def test_default_selection(self):
        self.assertEqual(default_selection(FAKE_CATALOGUE), {"x": "x1", "y": "y1", "quantity": "q1"})

    def test_unrestricted_value_is_not_blocked(self):
        selection = {"x": "x1", "y": "y1", "quantity": "q1"}
        self.assertIsNone(blocked_reason(FAKE_CATALOGUE, selection, "y", "y1"))

    def test_restriction_blocks_the_weaker_yield_order_value(self):
        # y has the weaker yield order (0 < 10), so y2 is blocked when x=x2, not x2 itself.
        selection = {"x": "x2", "y": "y1", "quantity": "q1"}
        reason = blocked_reason(FAKE_CATALOGUE, selection, "y", "y2")
        self.assertEqual(reason["reason_en"], "X2 blocks Y2")
        self.assertIsNone(blocked_reason(FAKE_CATALOGUE, {"x": "x1", "y": "y2", "quantity": "q1"}, "x", "x2"))

    def test_missing_base_price_blocks_with_not_available(self):
        catalogue_with_gap = {**FAKE_CATALOGUE, "base_prices": []}
        reason = blocked_reason(catalogue_with_gap, {"x": "x1", "y": "y1", "quantity": "q1"}, "x", "x1")
        self.assertEqual(reason["code"], "not_available")

    def test_resolve_selection_falls_back_when_pick_blocks_current_value(self):
        # Start with y2 chosen, then pick x2 which blocks y2; expect fallback to y1.
        selection = {"x": "x2", "y": "y2", "quantity": "q1"}
        resolved, notices = resolve_selection(FAKE_CATALOGUE, selection)
        self.assertEqual(resolved["y"], "y1")
        self.assertEqual(notices, [{
            "code": "fallback", "option": "y", "from": "y2", "to": "y1",
            "reason_en": "X2 blocks Y2 — changed to Y1", "reason_ar": "",
        }])

    def test_resolve_selection_is_stable_when_nothing_is_blocked(self):
        selection = {"x": "x1", "y": "y2", "quantity": "q1"}
        resolved, notices = resolve_selection(FAKE_CATALOGUE, selection)
        self.assertEqual(resolved, selection)
        self.assertEqual(notices, [])


class PricingTests(TestCase):
    def test_compute_quote_with_uplift(self):
        selection = {"x": "x1", "y": "y2", "quantity": "q1"}
        quote = compute_quote(FAKE_CATALOGUE, selection)
        self.assertEqual(quote["base_fils"], 10000)
        self.assertEqual(quote["uplifts"], [{
            "option": "y", "value": "y2", "label_en": "Y2", "label_ar": "", "percent": 50, "amount_fils": 5000,
        }])
        self.assertEqual(quote["subtotal_fils"], 15000)
        self.assertEqual(quote["vat_fils"], 750)  # 5% of 15000
        self.assertEqual(quote["total_fils"], 15750)

    def test_compute_quote_returns_none_when_base_price_missing(self):
        catalogue = {**FAKE_CATALOGUE, "base_prices": []}
        selection = {"x": "x1", "y": "y1", "quantity": "q1"}
        self.assertIsNone(compute_quote(catalogue, selection))


class FlyerScriptTotalsTests(TestCase):
    """The four demo script totals the spec requires byte-for-byte."""

    def setUp(self):
        self.catalogue = load_catalogue(Product.objects.get(slug="flyers"))

    def total_aed(self, **overrides):
        selection = {**default_selection(self.catalogue), **overrides}
        resolved, notices = resolve_selection(self.catalogue, selection)
        quote = compute_quote(self.catalogue, resolved)
        return Decimal(quote["total_fils"]) / 100, notices

    def test_layla_before_switch(self):
        total, _ = self.total_aed(paper="170gsm-gloss", sides="double", quantity="1000", turnaround="standard")
        self.assertEqual(total, Decimal("403.20"))

    def test_layla_after_switch(self):
        total, _ = self.total_aed(size="a4", paper="170gsm-gloss", sides="double", quantity="1000", turnaround="standard")
        self.assertEqual(total, Decimal("685.44"))

    def test_omar(self):
        total, _ = self.total_aed(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        self.assertEqual(total, Decimal("838.95"))

    def test_a3_same_day_falls_back_to_express(self):
        total, notices = self.total_aed(size="a3", paper="170gsm-gloss", quantity="500", turnaround="same-day")
        self.assertEqual(total, Decimal("1059.24"))
        self.assertEqual(notices, [{
            "code": "fallback", "option": "turnaround", "from": "same-day", "to": "express",
            "reason_en": "Same-day not available for A3 — changed to Express",
            "reason_ar": "التسليم في اليوم نفسه غير متاح لمقاس A3 — سريع",
        }])

    def test_same_day_blocked_above_1000_falls_back_to_express(self):
        total, notices = self.total_aed(quantity="2500", turnaround="same-day")
        self.assertEqual(notices, [{
            "code": "fallback", "option": "turnaround", "from": "same-day", "to": "express",
            "reason_en": "Same-day up to 1,000 copies — changed to Express",
            "reason_ar": "التسليم في اليوم نفسه حتى 1,000 نسخة — سريع",
        }])

    def test_express_blocked_at_5000_falls_back_to_standard(self):
        total, notices = self.total_aed(quantity="5000", turnaround="express")
        self.assertEqual(notices, [{
            "code": "fallback", "option": "turnaround", "from": "express", "to": "standard",
            "reason_en": "Express up to 2,500 copies — changed to Standard",
            "reason_ar": "التسليم السريع حتى 2,500 نسخة — عادي",
        }])

    def test_missing_base_price_combo_has_no_quote(self):
        # every seeded Size x Paper x Quantity combination is priced; sanity-check the grid
        # instead flags a genuinely blocked cell (Same-day at 5,000) as such.
        grid = price_grid(self.catalogue, default_selection(self.catalogue))
        row = next(r for r in grid if r["quantity"] == "5000")
        cell = next(c for c in row["cells"] if c["turnaround"] == "same-day")
        self.assertTrue(cell["blocked"])
        self.assertIsNone(cell["quote"])


@override_settings(COMMERCE_ENABLED=True)
class CatalogueApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_catalogue_endpoint_lists_options_and_defaults(self):
        res = self.client.get("/api/products/flyers/catalogue/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["product_id"], Product.objects.get(slug="flyers").id)
        codes = [o["code"] for o in data["options"]]
        self.assertEqual(codes, ["size", "paper", "sides", "quantity", "turnaround"])
        self.assertEqual(data["defaults"], {
            "size": "a5", "paper": "170gsm-gloss", "sides": "single", "quantity": "500", "turnaround": "standard",
        })
        self.assertGreater(data["bleed_mm"], 0)
        self.assertGreater(data["safe_mm"], 0)
        size_option = next(o for o in data["options"] if o["code"] == "size")
        a5 = next(v for v in size_option["values"] if v["code"] == "a5")
        self.assertEqual(a5["width_mm"], 148)
        self.assertEqual(a5["height_mm"], 210)
        quantity_option = next(o for o in data["options"] if o["code"] == "quantity")
        self.assertNotIn("width_mm", quantity_option["values"][0])

    def test_configuration_endpoint_returns_quote_and_grid(self):
        res = self.client.get("/api/products/flyers/configuration/", {
            "paper": "170gsm-gloss", "sides": "double", "quantity": "1000", "turnaround": "standard",
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["quote"]["total_aed"], "403.20")
        self.assertEqual(len(data["price_grid"]), 6)
        self.assertEqual(data["notices"], [])

    def test_configuration_endpoint_falls_back_and_reports_notice(self):
        res = self.client.get("/api/products/flyers/configuration/", {"size": "a3", "turnaround": "same-day"})
        data = res.json()
        self.assertEqual(data["selection"]["turnaround"], "express")
        self.assertEqual(data["notices"], [{
            "code": "fallback", "option": "turnaround", "from": "same-day", "to": "express",
            "reason": "Same-day not available for A3 — changed to Express",
        }])

    def test_configuration_endpoint_marks_blocked_values(self):
        res = self.client.get("/api/products/flyers/configuration/", {"size": "a3"})
        data = res.json()
        self.assertIn("same-day", data["blocked"]["turnaround"])

    def test_unknown_query_value_falls_back_to_default(self):
        res = self.client.get("/api/products/flyers/configuration/", {"size": "not-a-size"})
        self.assertEqual(res.json()["selection"]["size"], "a5")
