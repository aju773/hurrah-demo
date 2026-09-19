"""Clock and turnaround: "now" in Asia/Dubai, Working days and promised delivery.

Pure functions only — every function here takes "now" as a plain, already-Dubai-aware
datetime and does no I/O. The demo clock (which can fix "now" to a configured instant)
lives in `orders.demo_clock`, which reads it and hands a datetime in here.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DUBAI_TZ = ZoneInfo("Asia/Dubai")


def is_working_day(d: date) -> bool:
    """Working days are Mon-Fri, no holiday calendar."""
    return d.weekday() < 5


def _next_working_day(d: date) -> date:
    """The first Working day strictly after `d`."""
    d = d + timedelta(days=1)
    while not is_working_day(d):
        d = d + timedelta(days=1)
    return d


def add_working_days(d: date, n: int) -> date:
    """`d` advanced by `n` Working days (weekends skipped). n=0 returns `d` unchanged."""
    for _ in range(n):
        d = _next_working_day(d)
    return d


def approval_day(now: datetime, cutoff_time) -> date:
    """The Working day a Proof approval at `now` counts as for a Turnaround with this
    Cut-off: that day if `now` is before Cut-off on a Working day, else the next
    Working day."""
    today = now.date()
    if is_working_day(today) and now.time() < cutoff_time:
        return today
    return _next_working_day(today)


def promised_delivery(now: datetime, cutoff_time, working_day_offset, window_start, window_end):
    """The promised delivery date and window for a Turnaround approved at `now`."""
    day = approval_day(now, cutoff_time)
    promised_date = add_working_days(day, working_day_offset)
    return {"date": promised_date, "window_start": window_start, "window_end": window_end}


def seconds_to_cutoff(now: datetime, cutoff_time) -> int:
    """Seconds until this Turnaround's next Cut-off (today's, if `now` is still before
    it on a Working day, else the next Working day's)."""
    target_date = approval_day(now, cutoff_time)
    target = datetime.combine(target_date, cutoff_time, tzinfo=now.tzinfo)
    return max(0, int((target - now).total_seconds()))
