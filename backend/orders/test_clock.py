from datetime import date, datetime, time

from django.test import SimpleTestCase

from .clock import (
    DUBAI_TZ,
    add_working_days,
    approval_day,
    is_working_day,
    promised_delivery,
    seconds_to_cutoff,
)


def dubai(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=DUBAI_TZ)


class WorkingDayTests(SimpleTestCase):
    def test_monday_to_friday_are_working_days(self):
        # 2026-09-14 is a Monday.
        for offset in range(5):
            self.assertTrue(is_working_day(date(2026, 9, 14) .replace(day=14 + offset)))

    def test_saturday_and_sunday_are_not_working_days(self):
        self.assertFalse(is_working_day(date(2026, 9, 19)))  # Saturday
        self.assertFalse(is_working_day(date(2026, 9, 20)))  # Sunday


class AddWorkingDaysTests(SimpleTestCase):
    def test_zero_offset_returns_same_day(self):
        self.assertEqual(add_working_days(date(2026, 9, 14), 0), date(2026, 9, 14))

    def test_skips_the_weekend(self):
        # Friday 2026-09-18 + 1 working day = Monday 2026-09-21.
        self.assertEqual(add_working_days(date(2026, 9, 18), 1), date(2026, 9, 21))

    def test_three_working_days_from_friday(self):
        # Friday 2026-09-18 + 3 working days = Mon, Tue, Wed = 2026-09-23.
        self.assertEqual(add_working_days(date(2026, 9, 18), 3), date(2026, 9, 23))


class ApprovalDayTests(SimpleTestCase):
    def test_before_cutoff_on_a_working_day_counts_as_that_day(self):
        now = dubai(2026, 9, 16, 10, 59)  # Wednesday, before 11:00
        self.assertEqual(approval_day(now, time(11, 0)), date(2026, 9, 16))

    def test_after_cutoff_rolls_to_next_working_day(self):
        now = dubai(2026, 9, 16, 11, 1)  # Wednesday, after 11:00
        self.assertEqual(approval_day(now, time(11, 0)), date(2026, 9, 17))

    def test_friday_after_cutoff_rolls_to_monday(self):
        now = dubai(2026, 9, 18, 14, 1)  # Friday, after 14:00
        self.assertEqual(approval_day(now, time(14, 0)), date(2026, 9, 21))

    def test_weekend_approval_rolls_to_monday(self):
        now = dubai(2026, 9, 19, 9, 0)  # Saturday
        self.assertEqual(approval_day(now, time(14, 0)), date(2026, 9, 21))


class PromisedDeliveryTests(SimpleTestCase):
    def test_same_day_is_the_approval_day(self):
        now = dubai(2026, 9, 16, 10, 0)  # Wednesday, before 11:00
        result = promised_delivery(now, cutoff_time=time(11, 0), working_day_offset=0,
                                    window_start=time(15, 0), window_end=time(20, 0))
        self.assertEqual(result, {
            "date": date(2026, 9, 16), "window_start": time(15, 0), "window_end": time(20, 0),
        })

    def test_express_is_the_next_working_day(self):
        now = dubai(2026, 9, 16, 10, 0)  # Wednesday, before 14:00
        result = promised_delivery(now, cutoff_time=time(14, 0), working_day_offset=1,
                                    window_start=time(15, 0), window_end=time(20, 0))
        self.assertEqual(result["date"], date(2026, 9, 17))

    def test_standard_from_friday_before_cutoff_is_wednesday(self):
        now = dubai(2026, 9, 18, 9, 0)  # Friday, before 14:00
        result = promised_delivery(now, cutoff_time=time(14, 0), working_day_offset=3,
                                    window_start=None, window_end=time(20, 0))
        self.assertEqual(result["date"], date(2026, 9, 23))  # Mon, Tue, Wed
        self.assertIsNone(result["window_start"])

    def test_standard_from_friday_after_cutoff_rolls_to_monday_approval(self):
        now = dubai(2026, 9, 18, 14, 1)  # Friday, after 14:00
        result = promised_delivery(now, cutoff_time=time(14, 0), working_day_offset=3,
                                    window_start=None, window_end=time(20, 0))
        # approval rolls to Monday 09-21, +3 working days = Thursday 09-24.
        self.assertEqual(result["date"], date(2026, 9, 24))


class SecondsToCutoffTests(SimpleTestCase):
    def test_before_cutoff_counts_down_to_todays_cutoff(self):
        now = dubai(2026, 9, 16, 10, 0)  # Wednesday, 1 hour before 11:00
        self.assertEqual(seconds_to_cutoff(now, time(11, 0)), 3600)

    def test_after_cutoff_counts_down_to_next_working_days_cutoff(self):
        now = dubai(2026, 9, 18, 14, 1)  # Friday, just after 14:00
        expected = dubai(2026, 9, 21, 14, 0)  # Monday 14:00
        self.assertEqual(seconds_to_cutoff(now, time(14, 0)), int((expected - now).total_seconds()))

    def test_on_weekend_counts_down_to_mondays_cutoff(self):
        now = dubai(2026, 9, 19, 9, 0)  # Saturday
        expected = dubai(2026, 9, 21, 11, 0)  # Monday 11:00
        self.assertEqual(seconds_to_cutoff(now, time(11, 0)), int((expected - now).total_seconds()))
