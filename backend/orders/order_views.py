"""Submit & confirmation (ticket 10): the server re-check on Submit that turns
an approved draft into an Order, and the token confirmation page's read.

The client sends back everything it showed the customer (resolved
Configuration, expected Quote total, expected promised date/Turnaround, the
warning codes it showed a tick for) and the server recomputes all of it with
the same clock-aware rules/pricing modules the Configuration endpoint uses. A
difference means the proof on screen is stale, so nothing is created — the
caller gets 409 plus fresh values instead (spec story 87).
"""

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import preflight
from .catalogue import load_catalogue, option_by_code, value_by_code
from .catalogue_views import (
    _serialize_blocked,
    _serialize_clock,
    _serialize_notices,
    _serialize_quote,
    _serialize_turnarounds,
    commerce_enabled,
)
from .clock import promised_delivery
from .demo_clock import current_time
from .models import (
    ORDER_STATUS_IN_PRODUCTION,
    ORDER_STATUS_STAFF_CHECK,
    Artwork,
    Order,
    OrderLine,
    OrderStatusChange,
    Product,
    SLOT_BACK,
    SLOT_FRONT,
)
from .numbering import allocate_order_number
from .rules import blocked_map, resolve_selection
from .pricing import compute_quote
from .serializers import OrderSerializer

# With the Commerce switch off only contact details are collected; the
# delivery address comes back with the switch.
REQUIRED_CONTACT_FIELDS = ["name", "mobile"]
REQUIRED_DELIVERY_FIELDS = ["name", "mobile", "area", "address_line"]


def _text(entry, field, locale):
    if locale == "ar" and entry.get(f"{field}_ar"):
        return entry[f"{field}_ar"]
    return entry[f"{field}_en"]


def _warning_codes(report):
    """Distinct Finding codes at Warning severity in a stored Preflight report
    (`headline_severity`'s inputs), sorted for a stable comparison/display.
    Includes `check_incomplete` ("Not fully checked" — spec story 101)."""
    if not report:
        return set()
    return {f["code"] for f in report.get("findings", []) if f["severity"] == preflight.WARNING}


def _has_error(report):
    return bool(report) and report.get("headline_severity") == preflight.ERROR


def _configuration_snapshot(catalogue, resolved):
    snapshot = []
    for option in catalogue["options"]:
        value = value_by_code(option, resolved[option["code"]])
        snapshot.append({
            "option": option["code"],
            "name_en": option["name_en"],
            "name_ar": option["name_ar"],
            "value": value["code"],
            "label_en": value["label_en"],
            "label_ar": value["label_ar"],
        })
    return snapshot


def _uplifts_snapshot(quote):
    return [
        {"label_en": u["label_en"], "label_ar": u["label_ar"], "percent": u["percent"], "fils": u["amount_fils"]}
        for u in quote["uplifts"]
    ]


class OrderSubmitView(APIView):
    """POST the approved draft. 201 (created) / 200 (idempotent repeat) / 409
    (fresh values, nothing changed) / 400 (validation)."""

    def post(self, request, slug):
        product = get_object_or_404(Product, slug=slug, active=True)
        data = request.data

        idempotency_key = (data.get("idempotency_key") or "").strip()
        if not idempotency_key:
            return Response({"detail": "idempotency_key is required.", "code": "missing_idempotency_key"}, status=status.HTTP_400_BAD_REQUEST)

        existing = Order.objects.filter(idempotency_key=idempotency_key).select_related("line").first()
        if existing is not None:
            return Response(OrderSerializer(existing, context={"request": request}).data, status=status.HTTP_200_OK)

        commerce = commerce_enabled()
        locale = data.get("locale", "en")
        configuration = data.get("configuration")
        if not isinstance(configuration, dict):
            return Response({"detail": "configuration is required.", "code": "invalid_configuration"}, status=status.HTTP_400_BAD_REQUEST)

        catalogue = load_catalogue(product)
        valid_codes = {o["code"]: {v["code"] for v in o["values"]} for o in catalogue["options"]}
        for option in catalogue["options"]:
            if configuration.get(option["code"]) not in valid_codes[option["code"]]:
                return Response({"detail": "Invalid configuration.", "code": "invalid_configuration"}, status=status.HTTP_400_BAD_REQUEST)

        now = current_time()
        resolved, notices = resolve_selection(catalogue, configuration, now=now)
        # A combination with no Base price row is "Not available" whatever the
        # switch says; with it off the Quote is used for that check and dropped.
        quote = compute_quote(catalogue, resolved)
        if quote is None:
            return Response({"detail": "Not available.", "code": "not_available"}, status=status.HTTP_400_BAD_REQUEST)

        turnaround_value = value_by_code(option_by_code(catalogue, "turnaround"), resolved["turnaround"])
        delivery_estimate = promised_delivery(
            now,
            cutoff_time=turnaround_value["cutoff_time"],
            working_day_offset=turnaround_value["working_day_offset"],
            window_start=turnaround_value["delivery_window_start"],
            window_end=turnaround_value["delivery_window_end"],
        )

        # ---- Artwork: must belong to this Product, be the right slot, be
        # unlocked (not already on an Order), and carry no Preflight Error.
        front_id = data.get("front_artwork")
        front = Artwork.objects.filter(pk=front_id, product=product, slot=SLOT_FRONT).first() if front_id else None
        if front is None:
            return Response({"detail": "front_artwork is required.", "code": "invalid_artwork"}, status=status.HTTP_400_BAD_REQUEST)
        if OrderLine.objects.filter(front_artwork_id=front.id).exists() or OrderLine.objects.filter(back_artwork_id=front.id).exists():
            return Response({"detail": "This artwork is already on an order.", "code": "artwork_locked"}, status=status.HTTP_400_BAD_REQUEST)

        same_as_front = bool(data.get("same_as_front"))
        back = None
        back_id = data.get("back_artwork")
        if back_id and not same_as_front:
            back = Artwork.objects.filter(pk=back_id, product=product, slot=SLOT_BACK).first()
            if back is None:
                return Response({"detail": "back_artwork not found.", "code": "invalid_artwork"}, status=status.HTTP_400_BAD_REQUEST)
            if OrderLine.objects.filter(front_artwork_id=back.id).exists() or OrderLine.objects.filter(back_artwork_id=back.id).exists():
                return Response({"detail": "This artwork is already on an order.", "code": "artwork_locked"}, status=status.HTTP_400_BAD_REQUEST)

        if resolved.get("sides") == "double" and not same_as_front and back is None:
            return Response({"detail": "Back artwork is required for double-sided orders.", "code": "invalid_artwork"}, status=status.HTTP_400_BAD_REQUEST)

        if _has_error(front.preflight_report) or (back is not None and _has_error(back.preflight_report)):
            return Response({"detail": "Fix the Errors on your artwork before ordering.", "code": "artwork_has_errors"}, status=status.HTTP_400_BAD_REQUEST)

        warning_codes = _warning_codes(front.preflight_report)
        if back is not None:
            warning_codes |= _warning_codes(back.preflight_report)
        warning_codes = sorted(warning_codes)

        # ---- Ticks
        if not data.get("approval_tick"):
            return Response({"detail": "The approval tick is required.", "code": "missing_tick"}, status=status.HTTP_400_BAD_REQUEST)
        if warning_codes and not data.get("warnings_tick"):
            return Response({"detail": "The warnings tick is required.", "code": "missing_tick"}, status=status.HTTP_400_BAD_REQUEST)

        # ---- Contact (switch off) or delivery (switch on) details
        details = (data.get("delivery") if commerce else data.get("contact") or data.get("delivery")) or {}
        required = REQUIRED_DELIVERY_FIELDS if commerce else REQUIRED_CONTACT_FIELDS
        errors = {}
        for field in required:
            if not str(details.get(field) or "").strip():
                errors[field] = "Required."
        mobile = str(details.get("mobile") or "").strip()
        if mobile and not mobile.replace(" ", "").startswith("+971"):
            errors["mobile"] = "Must be a UAE mobile number (+971…)."
        if errors:
            code = "invalid_delivery" if commerce else "invalid_contact"
            return Response({"detail": "Please check your details.", "code": code, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        # ---- Freshness: everything the customer approved must still hold.
        # No total is sent or checked with the switch off.
        expected_turnaround = data.get("expected_turnaround")
        expected_promised_date = data.get("expected_promised_date")
        accepted_warning_codes = sorted(set(data.get("accepted_warning_codes") or []))

        stale = (
            resolved != configuration
            or (commerce and quote["total_fils"] != data.get("expected_total_fils"))
            or resolved.get("turnaround") != expected_turnaround
            or delivery_estimate["date"].isoformat() != expected_promised_date
            or warning_codes != accepted_warning_codes
        )
        if stale:
            fresh = {
                "detail": "Your order details changed — please review and approve again.",
                "code": "stale",
                "selection": resolved,
                "notices": _serialize_notices(notices, locale),
                "blocked": _serialize_blocked(blocked_map(catalogue, resolved, now=now), locale),
                "clock": _serialize_clock(catalogue, resolved, now),
                "warning_codes": warning_codes,
            }
            if commerce:
                fresh["quote"] = _serialize_quote(quote, locale)
            else:
                fresh["turnarounds"] = _serialize_turnarounds(catalogue, now)
            return Response(fresh, status=status.HTTP_409_CONFLICT)

        browsing_language = data.get("browsing_language") if data.get("browsing_language") in ("en", "ar") else "en"
        order_status = ORDER_STATUS_STAFF_CHECK if warning_codes else ORDER_STATUS_IN_PRODUCTION

        order = None
        for attempt in range(5):
            try:
                with transaction.atomic():
                    number = allocate_order_number()
                    order = Order.objects.create(
                        number=number,
                        name=details["name"].strip(),
                        mobile=mobile,
                        area=(details.get("area") or "").strip() if commerce else "",
                        address_line=(details.get("address_line") or "").strip() if commerce else "",
                        email=(details.get("email") or "").strip(),
                        company=(details.get("company") or "").strip(),
                        note=(details.get("note") or "").strip(),
                        payment_method="cod" if commerce else "",
                        payment_status="unpaid" if commerce else "",
                        status=order_status,
                        browsing_language=browsing_language,
                        idempotency_key=idempotency_key,
                    )
                    OrderLine.objects.create(
                        order=order,
                        product=product,
                        configuration_snapshot=_configuration_snapshot(catalogue, resolved),
                        turnaround=resolved.get("turnaround", ""),
                        base_fils=quote["base_fils"] if commerce else None,
                        subtotal_fils=quote["subtotal_fils"] if commerce else None,
                        vat_fils=quote["vat_fils"] if commerce else None,
                        total_fils=quote["total_fils"] if commerce else None,
                        uplifts_snapshot=_uplifts_snapshot(quote) if commerce else [],
                        front_artwork=front,
                        back_artwork=back,
                        same_as_front=same_as_front,
                        size_choice=data.get("size_choice") or {},
                        preflight_report_snapshot={
                            "front": front.preflight_report,
                            "back": None if (same_as_front or back is None) else back.preflight_report,
                        },
                        accepted_warning_codes=warning_codes,
                        approved_at=now,
                        promised_date=delivery_estimate["date"],
                        promised_window_start=delivery_estimate["window_start"],
                        promised_window_end=delivery_estimate["window_end"],
                    )
                    OrderStatusChange.objects.create(order=order, from_status="", to_status=order_status)
                break
            except IntegrityError:
                order = None
                # A concurrent request can win any of three unique
                # constraints first: the idempotency key (a genuine duplicate
                # Submit — return its Order, not an error), one of the two
                # Artwork locks (this Artwork was just claimed by another
                # Order — 400, not a retry), or the Order number (a real
                # allocate_order_number() collision — the only case worth
                # retrying).
                winner = Order.objects.filter(idempotency_key=idempotency_key).select_related("line").first()
                if winner is not None:
                    return Response(OrderSerializer(winner, context={"request": request}).data, status=status.HTTP_200_OK)
                if OrderLine.objects.filter(front_artwork_id=front.id).exists() or (
                    back is not None and OrderLine.objects.filter(back_artwork_id=back.id).exists()
                ):
                    return Response({"detail": "This artwork is already on an order.", "code": "artwork_locked"}, status=status.HTTP_400_BAD_REQUEST)
                if attempt == 4:
                    raise

        return Response(OrderSerializer(order, context={"request": request}).data, status=status.HTTP_201_CREATED)


STATUS_MESSAGE_EN = {
    ORDER_STATUS_STAFF_CHECK: "Our team is checking your file. Still on track for {date}.",
    ORDER_STATUS_IN_PRODUCTION: "In production. Delivery {date}, {window}.",
    "on_hold": "On hold — our team will be in touch.",
    "cancelled": "Cancelled.",
    "out_for_delivery": "Out for delivery {date}, {window}.",
    "delivered": "Delivered.",
}
STATUS_MESSAGE_AR = {
    ORDER_STATUS_STAFF_CHECK: "فريقنا يتحقق من ملفك. لا يزال التسليم في موعده {date}.",
    ORDER_STATUS_IN_PRODUCTION: "قيد الإنتاج. التسليم {date}، {window}.",
    "on_hold": "قيد الانتظار — سيتواصل معك فريقنا.",
    "cancelled": "ملغى.",
    "out_for_delivery": "في طريقه للتسليم {date}، {window}.",
    "delivered": "تم التسليم.",
}


# With the Commerce switch off nothing is delivered: the Order is "Ready".
STATUS_MESSAGE_READY_EN = {
    ORDER_STATUS_STAFF_CHECK: "Our team is checking your file. Still on track to be ready {date}.",
    ORDER_STATUS_IN_PRODUCTION: "In production. Ready {date}, {window}.",
    "on_hold": "On hold — our team will be in touch.",
    "cancelled": "Cancelled.",
    "out_for_delivery": "Ready {date}, {window}.",
    "delivered": "Ready.",
}
STATUS_MESSAGE_READY_AR = {
    ORDER_STATUS_STAFF_CHECK: "فريقنا يتحقق من ملفك. لا يزال الطلب سيكون جاهزًا {date}.",
    ORDER_STATUS_IN_PRODUCTION: "قيد الإنتاج. جاهز {date}، {window}.",
    "on_hold": "قيد الانتظار — سيتواصل معك فريقنا.",
    "cancelled": "ملغى.",
    "out_for_delivery": "جاهز {date}، {window}.",
    "delivered": "جاهز.",
}


AR_WEEKDAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]  # Monday first
AR_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]


def _date_text(day, locale):
    """"Tue 22 Sep" / "الثلاثاء 22 سبتمبر": Gregorian, Western digits in both."""
    if locale == "ar":
        return f"{AR_WEEKDAYS[day.weekday()]} {day.day} {AR_MONTHS[day.month - 1]}"
    return day.strftime("%a %d %b")


def _window_text(start, end, locale="en"):
    if start and end:
        return f"{start.strftime('%H:%M')}–{end.strftime('%H:%M')}"
    if end:
        return f"{'بحلول' if locale == 'ar' else 'by'} {end.strftime('%H:%M')}"
    return ""


def status_message(order_obj, locale):
    # OrderLine is created in the same transaction as Order and never
    # detached in this ticket, but `.line` (a reverse OneToOne accessor)
    # raises rather than returning None if that ever stops holding — guard
    # it the same defensive way the date/window lines below already do.
    line = getattr(order_obj, "line", None)
    if commerce_enabled():
        messages = STATUS_MESSAGE_AR if locale == "ar" else STATUS_MESSAGE_EN
    else:
        messages = STATUS_MESSAGE_READY_AR if locale == "ar" else STATUS_MESSAGE_READY_EN
    template = messages.get(order_obj.status, "")
    date_str = _date_text(line.promised_date, locale) if line else ""
    window = _window_text(line.promised_window_start, line.promised_window_end, locale) if line else ""
    return template.format(date=date_str, window=window)


class OrderByTokenView(APIView):
    """GET an Order's live status plus its approved snapshot, by its private
    token link (spec story 94) — no account, no number guessing."""

    def get(self, request, token):
        order = get_object_or_404(Order.objects.select_related("line", "line__front_artwork", "line__back_artwork"), token=token)
        locale = request.query_params.get("locale", "en")
        data = OrderSerializer(order, context={"request": request}).data
        data["status_message"] = status_message(order, locale)
        line = order.line
        if line:
            data["line"]["configuration"] = [
                {"name": _text(c, "name", locale), "label": _text(c, "label", locale)} for c in line.configuration_snapshot
            ]
        return Response(data)
