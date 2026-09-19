"""Arabic support on the server (ticket 13): catalogue text, Restriction reasons,
Order status messages with Arabic dates, and message codes the frontend translates."""

from datetime import date, time

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Option, OptionValue, Product, Restriction
from .order_views import status_message
from .test_lifecycle import make_order


class FlyersArabicSeedTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = Product.objects.get(slug="flyers")

    def test_every_flyers_option_value_and_restriction_has_arabic_text(self):
        self.assertEqual(list(Option.objects.filter(product=self.product, name_ar="").values_list("code", flat=True)), [])
        self.assertEqual(
            list(OptionValue.objects.filter(option__product=self.product, label_ar="").values_list("code", flat=True)), []
        )
        self.assertEqual(
            Restriction.objects.filter(value_x__option__product=self.product, reason_ar="").count(), 0
        )

    def test_catalogue_in_arabic_returns_arabic_names_and_labels(self):
        data = self.client.get("/api/products/flyers/catalogue/", {"locale": "ar"}).json()
        options = {o["code"]: o for o in data["options"]}
        self.assertEqual(options["size"]["name"], "المقاس")
        self.assertEqual(options["sides"]["values"][1]["label"], "وجهان")

    def test_catalogue_in_english_is_unchanged(self):
        data = self.client.get("/api/products/flyers/catalogue/", {"locale": "en"}).json()
        self.assertEqual({o["code"]: o["name"] for o in data["options"]}["size"], "Size")

    def test_blank_arabic_label_falls_back_to_english(self):
        OptionValue.objects.filter(option__product=self.product, code="double").update(label_ar="")
        data = self.client.get("/api/products/flyers/catalogue/", {"locale": "ar"}).json()
        sides = next(o for o in data["options"] if o["code"] == "sides")
        self.assertEqual(sides["values"][1]["label"], "Double-sided")

    def test_blocked_reason_reads_in_arabic(self):
        data = self.client.get(
            "/api/products/flyers/configuration/", {"locale": "ar", "size": "a3", "turnaround": "standard"}
        ).json()
        self.assertEqual(data["blocked"]["turnaround"]["same-day"]["reason"], "التسليم في اليوم نفسه غير متاح لمقاس A3")

    def test_fallback_notice_reads_in_arabic(self):
        data = self.client.get(
            "/api/products/flyers/configuration/", {"locale": "ar", "size": "a3", "turnaround": "same-day"}
        ).json()
        notice = next(n for n in data["notices"] if n["code"] == "fallback")
        self.assertIn("التسليم في اليوم نفسه غير متاح لمقاس A3", notice["reason"])
        self.assertNotIn("Same-day", notice["reason"])


@override_settings(COMMERCE_ENABLED=True)
class ArabicStatusMessageTests(TestCase):
    def line_order(self, status, promised=date(2026, 9, 22), window_start=None, window_end=time(17, 0)):
        order = make_order(status, promised=promised)
        order.line.promised_window_start = window_start
        order.line.promised_window_end = window_end
        return order

    def test_english_message_is_unchanged(self):
        order = self.line_order("in_production", window_start=time(15, 0))
        self.assertEqual(status_message(order, "en"), "In production. Delivery Tue 22 Sep, 15:00–17:00.")

    def test_arabic_message_uses_arabic_weekday_and_month_with_western_digits(self):
        order = self.line_order("in_production", window_start=time(15, 0))
        self.assertEqual(status_message(order, "ar"), "قيد الإنتاج. التسليم الثلاثاء 22 سبتمبر، 15:00–17:00.")

    def test_arabic_by_window_when_no_start(self):
        order = self.line_order("out_for_delivery")
        self.assertEqual(status_message(order, "ar"), "في طريقه للتسليم الثلاثاء 22 سبتمبر، بحلول 17:00.")

    def test_every_weekday_and_month_has_an_arabic_name(self):
        seen = set()
        for day in range(1, 13):
            order = self.line_order("staff_check", promised=date(2026, day, 1 + day))
            text = status_message(order, "ar")
            self.assertNotRegex(text, r"[A-Za-z]")
            seen.add(text)
        self.assertEqual(len(seen), 12)


class ReadyStatusMessageTests(TestCase):
    """With the Commerce switch off the Order is "Ready", never delivered."""

    def test_ready_wording_in_both_languages(self):
        order = make_order("in_production", promised=date(2026, 9, 22))
        order.line.promised_window_start = time(15, 0)
        order.line.promised_window_end = time(17, 0)
        self.assertEqual(status_message(order, "en"), "In production. Ready Tue 22 Sep, 15:00–17:00.")
        self.assertEqual(status_message(order, "ar"), "قيد الإنتاج. جاهز الثلاثاء 22 سبتمبر، 15:00–17:00.")


class FrontendMessageCoverageTests(TestCase):
    """Every code the server can send has an Arabic sentence in the frontend message
    file (frontend/messages/ar.json). Skipped when the frontend isn't checked out
    next to the backend (e.g. a backend-only deploy)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import json
        from pathlib import Path

        path = Path(__file__).resolve().parents[2] / "frontend" / "messages" / "ar.json"
        if not path.exists():
            from unittest import SkipTest
            raise SkipTest("frontend messages not present")
        cls.messages = json.loads(path.read_text(encoding="utf-8"))

    def test_every_preflight_finding_has_an_arabic_message(self):
        from . import preflight

        for code, severity in preflight.MESSAGES_EN:
            self.assertIn(f"{code}_{severity}", self.messages["Findings"], (code, severity))

    def test_every_artwork_error_code_has_an_arabic_message(self):
        from .pdf_utils import ERROR_MESSAGES_EN

        for code in [*ERROR_MESSAGES_EN, "file_unreadable", "file_too_large"]:
            self.assertIn(code, self.messages["ArtworkErrors"], code)
