from datetime import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from .clock import DUBAI_TZ
from .models import DemoClock

CONFIG_URL = "/api/products/flyers/configuration/"


def dubai(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=DUBAI_TZ)


class DemoClockApiTests(TestCase):
    """Same-day Cut-off behaviour via the Configuration API, driven by the demo
    clock so scenarios are reproducible whatever time the suite actually runs."""

    def setUp(self):
        self.client = APIClient()

    def set_now(self, when):
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": when})

    def test_before_cutoff_on_a_working_day_same_day_is_allowed(self):
        self.set_now(dubai(2026, 9, 16, 10, 0))  # Wednesday, before 11:00
        res = self.client.get(CONFIG_URL, {"turnaround": "same-day"})
        data = res.json()
        self.assertEqual(data["selection"]["turnaround"], "same-day")
        self.assertNotIn("same-day", data["blocked"]["turnaround"])
        self.assertEqual(data["clock"]["promised_date"], "2026-09-16")
        self.assertGreater(data["clock"]["seconds_to_cutoff"], 0)

    def test_after_cutoff_same_day_is_blocked_and_falls_back(self):
        self.set_now(dubai(2026, 9, 16, 11, 1))  # Wednesday, after 11:00
        res = self.client.get(CONFIG_URL, {"turnaround": "same-day"})
        data = res.json()
        self.assertEqual(data["selection"]["turnaround"], "express")
        self.assertEqual(data["notices"], [{
            "code": "fallback", "option": "turnaround", "from": "same-day", "to": "express",
            "reason": "Same-day Dubai: approve by 11:00 on Working days — changed to Express",
        }])
        self.assertEqual(data["blocked"]["turnaround"]["same-day"]["code"], "sameday_cutoff")

    def test_weekend_same_day_is_blocked(self):
        self.set_now(dubai(2026, 9, 19, 9, 0))  # Saturday
        res = self.client.get(CONFIG_URL, {"turnaround": "same-day"})
        data = res.json()
        self.assertEqual(data["selection"]["turnaround"], "express")
        self.assertEqual(data["blocked"]["turnaround"]["same-day"]["code"], "sameday_cutoff")

    def test_friday_after_standard_cutoff_rolls_to_monday_approval_and_thursday_delivery(self):
        self.set_now(dubai(2026, 9, 18, 14, 1))  # Friday, after 14:00
        res = self.client.get(CONFIG_URL, {"turnaround": "standard"})
        data = res.json()
        # approval rolls to Monday 09-21; Standard (+3 working days) delivers Thursday 09-24.
        self.assertEqual(data["clock"]["promised_date"], "2026-09-24")
        self.assertEqual(data["clock"]["window_start"], None)
        self.assertEqual(data["clock"]["window_end"], "20:00")

    def test_friday_before_standard_cutoff_delivers_wednesday(self):
        self.set_now(dubai(2026, 9, 18, 9, 0))  # Friday, before 14:00
        res = self.client.get(CONFIG_URL, {"turnaround": "standard"})
        data = res.json()
        self.assertEqual(data["clock"]["promised_date"], "2026-09-23")

    def test_express_promised_window_is_15_to_20(self):
        self.set_now(dubai(2026, 9, 16, 9, 0))  # Wednesday, before 14:00
        res = self.client.get(CONFIG_URL, {"turnaround": "express"})
        data = res.json()
        self.assertEqual(data["clock"]["promised_date"], "2026-09-17")
        self.assertEqual(data["clock"]["window_start"], "15:00")
        self.assertEqual(data["clock"]["window_end"], "20:00")

    def test_restriction_wins_over_sameday_cutoff_for_a3(self):
        # A3 permanently blocks Same-day (a Restriction, not time-dependent); this must
        # be reported even when Same-day's Cut-off also happens to be blocking right now.
        self.set_now(dubai(2026, 9, 16, 11, 1))  # Wednesday, after 11:00
        res = self.client.get(CONFIG_URL, {"size": "a3", "turnaround": "same-day"})
        data = res.json()
        self.assertEqual(data["blocked"]["turnaround"]["same-day"]["code"], "restricted")

    def test_demo_clock_off_by_default_uses_real_time(self):
        # No DemoClock row at all: the endpoint must still respond using real "now".
        self.assertFalse(DemoClock.objects.exists())
        res = self.client.get(CONFIG_URL, {"turnaround": "standard"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("seconds_to_cutoff", res.json()["clock"])
