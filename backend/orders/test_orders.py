"""API tests for Submit (ticket 10): orders/order_views.py.

Uses the real seeded Flyers product (migration 0006/0008) so the script
totals match the spec byte-for-byte, the same way test_catalogue.py's
FlyerScriptTotalsTests and test_clock_api.py do.
"""

import shutil
import tempfile
from datetime import datetime

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .clock import DUBAI_TZ
from .fixtures_pdf import build_f2, build_f1
from .models import Artwork, DemoClock, Order, OrderLine, OrderStatusChange, Product

CONFIG_URL = "/api/products/flyers/configuration/"
SUBMIT_URL = "/api/products/flyers/orders/"


def dubai(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=DUBAI_TZ)


def as_upload(buf, name="flyer.pdf"):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, buf.read(), content_type="application/pdf")


VALID_DELIVERY = {
    "name": "Layla",
    "mobile": "+971501234567",
    "area": "Downtown Dubai",
    "address_line": "12 Sheikh Zayed Rd",
    "email": "layla@example.com",
}


# The money path: these run with the Commerce switch on (test_order_money_free.py covers it off).
@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), COMMERCE_ENABLED=True)
class OrderSubmitApiTests(TestCase):
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
        self.product = Product.objects.get(slug="flyers")

    def tearDown(self):
        self.override.disable()

    def set_now(self, when):
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": when})

    def upload(self, buf, slot="front", front_id=None):
        body = {"file": as_upload(buf), "slot": slot, "product": self.product.id}
        if front_id is not None:
            body["front_id"] = front_id
        res = self.client.post("/api/artworks/", body, format="multipart")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def get_config(self, **selection):
        res = self.client.get(CONFIG_URL, selection)
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def warning_codes(self, *reports):
        codes = set()
        for report in reports:
            for f in report.get("findings", []):
                if f["severity"] == "warning":
                    codes.add(f["code"])
        return sorted(codes)

    def submit_payload(self, config, front, back, key, *, delivery=None, warnings_tick=None):
        codes = self.warning_codes(front["preflight_report"], back["preflight_report"] if back else {})
        return {
            "configuration": config["selection"],
            "front_artwork": front["id"],
            "back_artwork": back["id"] if back else None,
            "same_as_front": False,
            "size_choice": None,
            "expected_total_fils": round(float(config["quote"]["total_aed"]) * 100),
            "expected_turnaround": config["selection"]["turnaround"],
            "expected_promised_date": config["clock"]["promised_date"],
            "accepted_warning_codes": codes,
            "approval_tick": True,
            "warnings_tick": (bool(codes) if warnings_tick is None else warnings_tick),
            "delivery": delivery or VALID_DELIVERY,
            "browsing_language": "en",
            "idempotency_key": key,
        }

    # ---- F1 (Layla, warnings accepted) -> Staff check, 685.44 ------------

    def test_f1_with_accepted_warnings_creates_staff_check_order_at_685_44(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))  # Wednesday morning
        upload_data = self.upload(build_f1())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(size="a4", paper="170gsm-gloss", sides="double", quantity="1000", turnaround="standard")
        payload = self.submit_payload(config, front, back, "f1-key")

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["status"], "staff_check")
        self.assertEqual(data["line"]["total_aed"], "685.44")
        self.assertEqual(data["number"], "HUR-10001")
        self.assertTrue(data["token"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(OrderStatusChange.objects.get(order__number="HUR-10001").to_status, "staff_check")

    def test_rotate_is_recorded_on_the_order_line_artwork(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "rotate-key")
        payload["size_choice"] = {"rotate": {"front": True, "back": False}}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["line"]["size_choice"], {"rotate": {"front": True, "back": False}})
        self.assertEqual(Order.objects.get().line.size_choice, {"rotate": {"front": True, "back": False}})

    def test_rotate_is_kept_beside_a_fit_choice(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "rotate-fit-key")
        payload["size_choice"] = {"choice": "keep_size_scale", "mode": "fit", "scale_pct": 70.5, "rotate": {"front": True, "back": True}}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        line = Order.objects.get().line
        self.assertEqual(line.size_choice["mode"], "fit")
        self.assertEqual(line.size_choice["rotate"], {"front": True, "back": True})

    def test_no_rotate_leaves_the_size_choice_empty(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "no-rotate-key")
        payload["size_choice"] = {"rotate": {"front": False, "back": False}}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Order.objects.get().line.size_choice, {})

    def test_swap_is_recorded_on_the_order_line_artwork(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "swap-key")
        payload["size_choice"] = {"swap": True}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["line"]["size_choice"], {"swap": True})
        line = Order.objects.get().line
        self.assertEqual(line.size_choice, {"swap": True})
        # The uploaded files stay where they were uploaded.
        self.assertEqual(line.front_artwork_id, front["id"])
        self.assertEqual(line.back_artwork_id, back["id"])

    def test_swap_is_kept_beside_fit_and_rotate(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "swap-fit-key")
        payload["size_choice"] = {"choice": "keep_size_scale", "mode": "fit", "swap": True, "rotate": {"front": True, "back": False}}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        line = Order.objects.get().line
        self.assertEqual(line.size_choice["mode"], "fit")
        self.assertIs(line.size_choice["swap"], True)
        self.assertEqual(line.size_choice["rotate"], {"front": True, "back": False})

    def test_swap_without_a_back_is_not_recorded(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front = upload_data["front"]
        config = self.get_config(paper="350gsm-matt", sides="single", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, None, "swap-no-back-key")
        payload["size_choice"] = {"swap": True}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Order.objects.get().line.size_choice, {})

    def test_no_swap_leaves_the_size_choice_empty(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "no-swap-key")
        payload["size_choice"] = {"swap": False}

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Order.objects.get().line.size_choice, {})

    # ---- F2 (Omar, all green, Same-day) -> In production, 838.95 --------

    def test_f2_all_green_same_day_creates_in_production_order_at_838_95(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))  # Wednesday, before 11:00 Same-day cut-off
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "f2-key")

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["status"], "in_production")
        self.assertEqual(data["line"]["total_aed"], "838.95")
        self.assertEqual(data["number"], "HUR-10001")

    def test_with_the_switch_on_address_payment_and_quote_are_still_filled(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        res = self.client.post(SUBMIT_URL, self.submit_payload(config, front, back, "on-key"), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        order = Order.objects.get()
        self.assertEqual((order.payment_method, order.payment_status), ("cod", "unpaid"))
        self.assertEqual((order.area, order.address_line), ("Downtown Dubai", "12 Sheikh Zayed Rd"))
        self.assertEqual(order.line.total_fils, 83895)
        self.assertIn("Delivery", self.client.get(f"/api/orders/{order.token}/").json()["status_message"])

    # ---- Arabic browsing language ---------------------------------------

    def test_arabic_order_stores_language_and_confirmation_resolves_labels_at_display_time(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = {**self.submit_payload(config, front, back, "ar-key"), "browsing_language": "ar"}

        created = self.client.post(SUBMIT_URL, payload, format="json").json()
        self.assertEqual(created["browsing_language"], "ar")
        self.assertEqual(Order.objects.get().browsing_language, "ar")

        arabic = self.client.get(f"/api/orders/{created['token']}/", {"locale": "ar"}).json()
        self.assertEqual(arabic["status_message"], "قيد الإنتاج. التسليم الأربعاء 16 سبتمبر، 15:00–20:00.")
        labels = {c["name"]: c["label"] for c in arabic["line"]["configuration"]}
        self.assertEqual(labels["المقاس"], "A5")
        self.assertEqual(labels["الأوجه"], "وجهان")

        english = self.client.get(f"/api/orders/{created['token']}/", {"locale": "en"}).json()
        self.assertEqual({c["name"] for c in english["line"]["configuration"]} >= {"Size", "Sides"}, True)

    # ---- freshness (409) ---------------------------------------------------

    def test_changed_price_returns_409(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "stale-price-key")
        payload["expected_total_fils"] = payload["expected_total_fils"] + 100

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(res.json()["code"], "stale")
        self.assertIn("quote", res.json())
        self.assertEqual(Order.objects.count(), 0)

    def test_clock_past_cutoff_returns_409(self):
        # Approve as-if Same-day were still available, but "now" has already
        # passed its Cut-off: the server re-resolves to Express and 409s.
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        self.set_now(dubai(2026, 9, 16, 11, 1))  # now past 11:00 Same-day cut-off
        payload = self.submit_payload(config, front, back, "stale-cutoff-key")

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(res.json()["code"], "stale")
        self.assertEqual(Order.objects.count(), 0)

    # ---- validation (400) --------------------------------------------------

    def test_artwork_with_error_is_refused(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        front_artwork = Artwork.objects.get(pk=front["id"])
        front_artwork.preflight_report = {
            "findings": [{"code": "font_not_embedded", "severity": "error", "value": "Foo", "slot": "front", "page": 1, "bbox": None, "message": "x"}],
            "thresholds": front_artwork.preflight_report.get("thresholds", {}),
            "headline_severity": "error",
        }
        front_artwork.is_valid = False
        front_artwork.save()

        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "error-key")

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "artwork_has_errors")
        self.assertEqual(Order.objects.count(), 0)

    def test_missing_warning_tick_is_refused(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f1())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(size="a4", paper="170gsm-gloss", sides="double", quantity="1000", turnaround="standard")
        payload = self.submit_payload(config, front, back, "missing-tick-key", warnings_tick=False)

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "missing_tick")
        self.assertEqual(Order.objects.count(), 0)

    def test_missing_approval_tick_is_refused(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "no-approval-key")
        payload["approval_tick"] = False

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "missing_tick")

    def test_invalid_delivery_fields_are_refused(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "bad-delivery-key", delivery={"name": "", "mobile": "0501234567", "area": "", "address_line": ""})

        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "invalid_delivery")
        self.assertIn("name", res.json()["errors"])
        self.assertIn("mobile", res.json()["errors"])

    # ---- idempotency and locking -------------------------------------------

    def test_repeat_submit_with_same_idempotency_key_returns_existing_order(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "repeat-key")

        first = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(first.status_code, 201, first.content)
        second = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json()["number"], second.json()["number"])
        self.assertEqual(Order.objects.count(), 1)

    def test_artwork_already_on_an_order_is_locked(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "lock-key-1")
        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        # A different idempotency key reusing the same (now-locked) Artwork.
        payload["idempotency_key"] = "lock-key-2"
        res2 = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res2.status_code, 400, res2.content)
        self.assertEqual(res2.json()["code"], "artwork_locked")

        # Deleting a locked Artwork is refused too.
        delete_res = self.client.delete(f"/api/artworks/{front['id']}/")
        self.assertEqual(delete_res.status_code, 400)
        self.assertTrue(Artwork.objects.filter(pk=front["id"]).exists())

    def test_orderline_front_and_back_artwork_are_unique_at_the_db_level(self):
        # The view's own pre-check (test above) is a plain SELECT before the
        # INSERT, so it can't stop two concurrent Submits both racing for the
        # same Artwork — only a DB constraint can. This locks in that the
        # model actually has one (OrderSubmitView's IntegrityError handling
        # depends on it).
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "unique-key-1")
        res = self.client.post(SUBMIT_URL, payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        second_upload = self.upload(build_f2())
        front2 = Artwork.objects.get(pk=second_upload["front"]["id"])
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OrderLine.objects.create(
                    order=Order.objects.create(
                        number="HUR-99999", name="X", mobile="+971500000000", area="X", address_line="X",
                        status="in_production", idempotency_key="unique-key-2",
                    ),
                    product=self.product,
                    configuration_snapshot=[],
                    base_fils=1, subtotal_fils=1, vat_fils=1, total_fils=1,
                    front_artwork=Artwork.objects.get(pk=front["id"]),  # already used above
                    back_artwork=front2,
                    approved_at=dubai(2026, 9, 16, 9, 0),
                    promised_date=dubai(2026, 9, 16, 9, 0).date(),
                )

    # ---- confirmation by token ---------------------------------------------

    def test_order_read_by_token_shows_live_status_and_snapshot(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))
        upload_data = self.upload(build_f2())
        front, back = upload_data["front"], upload_data["back"]
        config = self.get_config(paper="350gsm-matt", sides="double", quantity="500", turnaround="same-day")
        payload = self.submit_payload(config, front, back, "token-key")
        created = self.client.post(SUBMIT_URL, payload, format="json").json()

        res = self.client.get(f"/api/orders/{created['token']}/")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(data["number"], "HUR-10001")
        self.assertEqual(data["status"], "in_production")
        self.assertIn("In production", data["status_message"])
        self.assertEqual(data["line"]["total_aed"], "838.95")
        self.assertTrue(data["line"]["front_thumbnail_url"])

        # Staff moves it along; the token page reflects it live.
        order = Order.objects.get(token=created["token"])
        order.status = "out_for_delivery"
        order.save(update_fields=["status"])
        res2 = self.client.get(f"/api/orders/{created['token']}/")
        self.assertEqual(res2.json()["status"], "out_for_delivery")

    def test_unknown_token_returns_404(self):
        res = self.client.get("/api/orders/does-not-exist/")
        self.assertEqual(res.status_code, 404)
