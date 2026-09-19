"""DR numbering: Design requests get their own DR-0001... series, separate from
any Order numbering. Pure allocation logic lives here so it can be unit-tested
without going through the create API.
"""

from django.db import transaction


def allocate_design_request_number():
    """Return the next DR-#### number.

    Uses select_for_update to lock the last row against concurrent creates.
    That lock is only effective on database backends that support SELECT ...
    FOR UPDATE (e.g. Postgres) — on SQLite (used in dev/tests here) it is a
    silent no-op, so callers on SQLite should still guard the actual create
    against a duplicate-number race (see DesignRequestCreateView)."""
    from .models import DesignRequest

    with transaction.atomic():
        last_number = (
            DesignRequest.objects.select_for_update()
            .order_by("-id")
            .values_list("number", flat=True)
            .first()
        )
        next_seq = 1
        if last_number:
            try:
                next_seq = int(last_number.split("-", 1)[1]) + 1
            except (IndexError, ValueError):
                next_seq = DesignRequest.objects.count() + 1
        return f"DR-{next_seq:04d}"


def allocate_order_number():
    """Return the next HUR-##### number, sequential from HUR-10001. Same
    select_for_update/no-op-on-SQLite caveat as `allocate_design_request_number`
    above — callers on SQLite should retry the create on a duplicate-number
    race (see OrderSubmitView)."""
    from .models import Order

    with transaction.atomic():
        last_number = (
            Order.objects.select_for_update().order_by("-id").values_list("number", flat=True).first()
        )
        next_seq = 10001
        if last_number:
            try:
                next_seq = int(last_number.split("-", 1)[1]) + 1
            except (IndexError, ValueError):
                next_seq = 10001 + Order.objects.count()
        return f"HUR-{next_seq}"
