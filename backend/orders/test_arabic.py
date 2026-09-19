"""Arabic support on the server (ticket 13): catalogue text, Restriction reasons,
Order status messages with Arabic dates, and message codes the frontend translates."""

from datetime import date, time

from django.test import TestCase
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
