"""Order lifecycle (ticket 11): the single place that decides which status moves
are allowed, and the only code that writes an Order's status after creation.

Staff check -> In production | On hold (note required)
On hold -> In production | Cancelled (reason required)
In production -> Out for delivery -> Delivered

Everything else is refused. Every move is logged as an OrderStatusChange (from,
to, staff user, time, note). "Mark paid" only sets `payment_status`.
"""

from dataclasses import dataclass

from django.db import transaction

from .models import (
    ORDER_STATUS_CANCELLED,
    ORDER_STATUS_DELIVERED,
    ORDER_STATUS_IN_PRODUCTION,
    ORDER_STATUS_ON_HOLD,
    ORDER_STATUS_OUT_FOR_DELIVERY,
    ORDER_STATUS_STAFF_CHECK,
    Order,
    OrderStatusChange,
)


class TransitionError(Exception):
    """`code` is one of unknown_transition, not_allowed, note_required, already_paid."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Transition:
    key: str
    label: str
    from_status: str
    to_status: str
    note_label: str = ""  # non-empty: a note is required, and this is what to call it

    @property
    def note_required(self):
        return bool(self.note_label)


TRANSITIONS = (
    Transition("pass", "Pass", ORDER_STATUS_STAFF_CHECK, ORDER_STATUS_IN_PRODUCTION),
    Transition("hold", "Put on hold", ORDER_STATUS_STAFF_CHECK, ORDER_STATUS_ON_HOLD, note_label="note"),
    Transition("resume", "Resume", ORDER_STATUS_ON_HOLD, ORDER_STATUS_IN_PRODUCTION),
    Transition("cancel", "Cancel", ORDER_STATUS_ON_HOLD, ORDER_STATUS_CANCELLED, note_label="reason"),
    Transition("out_for_delivery", "Out for delivery", ORDER_STATUS_IN_PRODUCTION, ORDER_STATUS_OUT_FOR_DELIVERY),
    Transition("delivered", "Delivered", ORDER_STATUS_OUT_FOR_DELIVERY, ORDER_STATUS_DELIVERED),
)

_BY_KEY = {t.key: t for t in TRANSITIONS}


def available_transitions(status):
    return [t for t in TRANSITIONS if t.from_status == status]


def transition_order(order, key, staff_user, note=""):
    """Move `order` by the transition `key` and log it; returns the OrderStatusChange.

    Re-reads the Order under a row lock, so a stale page (or two staff clicking at
    once) can't apply a move that no longer fits the Order's current status."""
    transition = _BY_KEY.get(key)
    if transition is None:
        raise TransitionError("unknown_transition", f"Unknown move “{key}”.")
    note = (note or "").strip()

    with transaction.atomic():
        current = Order.objects.select_for_update().get(pk=order.pk)
        if current.status != transition.from_status:
            raise TransitionError(
                "not_allowed",
                f"“{transition.label}” is not allowed while the order is {current.get_status_display().lower()}.",
            )
        if transition.note_required and not note:
            raise TransitionError("note_required", f"A {transition.note_label} is required to {transition.label.lower()}.")

        from_status = current.status
        current.status = transition.to_status
        current.save(update_fields=["status"])
        change = OrderStatusChange.objects.create(
            order=current, from_status=from_status, to_status=transition.to_status,
            staff_user=staff_user, note=note,
        )

    order.status = transition.to_status
    return change


def mark_paid(order, staff_user):
    """Set `payment_status` to paid. Independent of the Order status."""
    with transaction.atomic():
        current = Order.objects.select_for_update().get(pk=order.pk)
        if current.payment_status == "paid":
            raise TransitionError("already_paid", "This order is already marked paid.")
        current.payment_status = "paid"
        current.save(update_fields=["payment_status"])
    order.payment_status = "paid"
