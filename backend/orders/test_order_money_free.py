"""Submit and the Order confirmation read with the Commerce switch off (the
default): contact details only, no total sent or checked, and no money,
delivery address or payment in any response."""

import shutil
import tempfile
from datetime import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .clock import DUBAI_TZ
from .fixtures_pdf import build_f1, build_f2
from .models import DemoClock, Order, OrderLine, OrderStatusChange, Product
from .test_commerce_switch import money_found

CONFIG_URL = "/api/products/flyers/configuration/"
SUBMIT_URL = "/api/products/flyers/orders/"

CONTACT = {"name": "Layla", "mobile": "+971501234567"}


def dubai(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=DUBAI_TZ)


class MoneyFreeSubmitTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_root = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.client = APIClient()
        self.product = Product.objects.get(slug="flyers")
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": dubai(2026, 9, 16, 9, 0)})

    def tearDown(self):
        self.override.disable()

    def upload(self, buf):
        upload = SimpleUploadedFile("flyer.pdf", buf.read(), content_type="application/pdf")
        res = self.client.post("/api/artworks/", {"file": upload, "slot": "front", "product": self.product.id}, format="multipart")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def payload(self, key="key-1", *, warnings_ok=True, **overrides):
        art = self.upload(build_f2())
        config = self.client.get(CONFIG_URL, {"paper": "350gsm-matt", "sides": "double", "quantity": "500", "turnaround": "same-day"}).json()
        body = {
            "configuration": config["selection"],
            "front_artwork": art["front"]["id"],
            "back_artwork": art["back"]["id"],
            "same_as_front": False,
            "size_choice": None,
            "expected_turnaround": config["selection"]["turnaround"],
            "expected_promised_date": config["clock"]["promised_date"],
            "accepted_warning_codes": [],
            "approval_tick": True,
            "warnings_tick": False,
            "contact": CONTACT,
            "browsing_language": "en",
            "idempotency_key": key,
        }
        body.update(overrides)
        return body

    def test_contact_only_creates_an_order_and_repeat_returns_the_same_one(self):
        body = self.payload()
        first = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(first.status_code, 201, first.content)
        second = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json()["number"], second.json()["number"])
        self.assertEqual(Order.objects.count(), 1)

    def test_order_and_confirmation_carry_no_money_address_or_payment(self):
        created = self.client.post(SUBMIT_URL, self.payload(), format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(money_found(created.json()), [])
        for locale in ("en", "ar"):
            read = self.client.get(f"/api/orders/{created.json()['token']}/", {"locale": locale}).json()
            self.assertEqual(money_found(read), [], locale)
            self.assertNotIn("area", read)
            self.assertNotIn("address_line", read)
        self.assertEqual(created.json()["name"], "Layla")
        self.assertEqual(created.json()["mobile"], "+971501234567")

    def test_stored_order_has_no_payment_address_or_quote(self):
        self.client.post(SUBMIT_URL, self.payload(), format="json")
        order = Order.objects.get()
        self.assertEqual((order.payment_method, order.payment_status, order.area, order.address_line), ("", "", "", ""))
        line = order.line
        self.assertIsNone(line.total_fils)
        self.assertIsNone(line.base_fils)
        self.assertEqual(line.uplifts_snapshot, [])

    def test_line_snapshots_are_unchanged(self):
        self.client.post(SUBMIT_URL, self.payload(), format="json")
        line = OrderLine.objects.get()
        self.assertEqual({c["option"] for c in line.configuration_snapshot}, {"size", "paper", "sides", "quantity", "turnaround"})
        self.assertIn("front", line.preflight_report_snapshot)
        self.assertEqual(line.accepted_warning_codes, [])
        self.assertTrue(line.front_artwork_id)
        self.assertEqual(line.turnaround, "same-day")
        self.assertEqual(OrderStatusChange.objects.get().to_status, "in_production")

    def test_optional_contact_fields_are_kept(self):
        body = self.payload(contact={**CONTACT, "email": "l@example.com", "company": "Bakery", "note": "Call me"})
        self.client.post(SUBMIT_URL, body, format="json")
        order = Order.objects.get()
        self.assertEqual((order.email, order.company, order.note), ("l@example.com", "Bakery", "Call me"))

    def test_invalid_contact_is_refused(self):
        body = self.payload(contact={"name": "", "mobile": "0501234567"})
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "invalid_contact")
        self.assertEqual(set(res.json()["errors"]), {"name", "mobile"})
        self.assertEqual(Order.objects.count(), 0)

    def test_area_and_address_are_not_required(self):
        res = self.client.post(SUBMIT_URL, self.payload(contact=CONTACT), format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_missing_ticks_are_refused(self):
        res = self.client.post(SUBMIT_URL, self.payload(approval_tick=False), format="json")
        self.assertEqual((res.status_code, res.json()["code"]), (400, "missing_tick"))
        self.assertEqual(Order.objects.count(), 0)

    def test_warnings_tick_is_required_when_there_are_warnings(self):
        art = self.upload(build_f1())
        config = self.client.get(CONFIG_URL, {"size": "a4", "paper": "170gsm-gloss", "sides": "double", "quantity": "1000", "turnaround": "standard"}).json()
        codes = sorted({f["code"] for r in (art["front"]["preflight_report"], art["back"]["preflight_report"]) for f in r["findings"] if f["severity"] == "warning"})
        self.assertTrue(codes)
        body = {
            "configuration": config["selection"], "front_artwork": art["front"]["id"], "back_artwork": art["back"]["id"],
            "expected_turnaround": "standard", "expected_promised_date": config["clock"]["promised_date"],
            "accepted_warning_codes": codes, "approval_tick": True, "warnings_tick": False,
            "contact": CONTACT, "idempotency_key": "w-key",
        }
        self.assertEqual(self.client.post(SUBMIT_URL, body, format="json").status_code, 400)
        body["warnings_tick"] = True
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["status"], "staff_check")

    def test_changed_promised_date_returns_409_with_fresh_values_and_no_money(self):
        body = self.payload(expected_promised_date="2026-01-01")
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(res.status_code, 409, res.content)
        data = res.json()
        self.assertEqual(data["code"], "stale")
        self.assertEqual(money_found(data), [])
        self.assertEqual(data["clock"]["promised_date"], "2026-09-16")
        self.assertIn("turnarounds", data)
        self.assertEqual(Order.objects.count(), 0)

    def test_clock_past_cutoff_returns_409_and_falls_back(self):
        body = self.payload(key="cutoff")
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": dubai(2026, 9, 16, 11, 1)})
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(res.json()["selection"]["turnaround"], "express")
        self.assertEqual(res.json()["notices"][0]["code"], "fallback")

    def test_changed_warnings_return_409(self):
        res = self.client.post(SUBMIT_URL, self.payload(accepted_warning_codes=["bleed_missing"]), format="json")
        self.assertEqual((res.status_code, res.json()["code"]), (409, "stale"))

    def test_an_error_on_the_artwork_is_refused(self):
        # Only a blocking code (font_not_embedded) refuses Submit now — everything
        # else is a caution the customer ticks past (owner instruction 2026-09).
        body = self.payload()
        from .models import Artwork
        front = Artwork.objects.get(pk=body["front_artwork"])
        front.preflight_report = {
            "findings": [{"code": "font_not_embedded", "severity": "error", "value": "Foo", "slot": "front", "page": 1, "bbox": None, "message": "x"}],
            "headline_severity": "error",
        }
        front.is_valid = False
        front.save()
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual((res.status_code, res.json()["code"]), (400, "artwork_has_errors"))

    def test_a_non_blocking_error_on_the_artwork_is_not_refused(self):
        # A low-ppi Error is still shown to the customer, but no longer blocks
        # Submit (owner instruction 2026-09: only font issues must be fixed first).
        body = self.payload()
        from .models import Artwork
        front = Artwork.objects.get(pk=body["front_artwork"])
        front.preflight_report = {
            "findings": [{"code": "low_ppi", "severity": "error", "value": 50, "slot": "front", "page": 1, "bbox": None, "message": "x"}],
            "headline_severity": "error",
        }
        front.save()
        body["warnings_tick"] = True
        body["accepted_warning_codes"] = ["low_ppi"]
        res = self.client.post(SUBMIT_URL, body, format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_sent_total_is_ignored(self):
        res = self.client.post(SUBMIT_URL, self.payload(expected_total_fils=1), format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_status_message_says_ready_not_delivery(self):
        created = self.client.post(SUBMIT_URL, self.payload(), format="json").json()
        en = self.client.get(f"/api/orders/{created['token']}/").json()["status_message"]
        self.assertIn("Ready", en)
        self.assertNotIn("elivery", en)
        Order.objects.filter(token=created["token"]).update(status="out_for_delivery")
        self.assertNotIn("elivery", self.client.get(f"/api/orders/{created['token']}/").json()["status_message"])
        Order.objects.filter(token=created["token"]).update(status="staff_check")
        self.assertEqual(self.client.get(f"/api/orders/{created['token']}/").json()["status"], "staff_check")
        ar = self.client.get(f"/api/orders/{created['token']}/", {"locale": "ar"}).json()["status_message"]
        self.assertNotIn("التسليم", ar)
