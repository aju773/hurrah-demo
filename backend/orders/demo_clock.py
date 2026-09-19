"""Reads the demo clock setting and hands a Dubai-aware "now" to the pure clock
module. The only place in the Turnaround/Cut-off machinery that touches the ORM or
real wall-clock time."""

from django.utils import timezone

from .clock import DUBAI_TZ
from .models import DemoClock


def current_time():
    """Real "now" in Asia/Dubai, unless the demo clock is fixed to a configured
    instant (off, i.e. null, by default)."""
    fixed = DemoClock.objects.values_list("fixed_at", flat=True).first()
    if fixed is not None:
        return fixed.astimezone(DUBAI_TZ)
    return timezone.now().astimezone(DUBAI_TZ)
