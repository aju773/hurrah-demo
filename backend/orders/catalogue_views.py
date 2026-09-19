from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .catalogue import load_catalogue, option_by_code, value_by_code
from .clock import promised_delivery, seconds_to_cutoff
from .demo_clock import current_time
from .models import Product
from .pricing import compute_quote, price_grid
from .rules import blocked_map, default_selection, resolve_selection


def _text(entry, field, locale):
    """The requested locale's text, falling back to English."""
    if locale == "ar" and entry.get(f"{field}_ar"):
        return entry[f"{field}_ar"]
    return entry[f"{field}_en"]


def _fils_to_aed(fils):
    return str((Decimal(fils) / 100).quantize(Decimal("0.01")))


def _serialize_catalogue(catalogue, locale):
    return {
        "product_id": catalogue["product"].id,
        "options": [
            {
                "code": option["code"],
                "name": _text(option, "name", locale),
                "pricing_role": option["pricing_role"],
                "values": [
                    {
                        "code": value["code"],
                        "label": _text(value, "label", locale),
                        "is_default": value["is_default"],
                        # Only Size values carry these (ticket 09: the Fit/Fill
                        # dialog needs the ordered Size's trim mm to compute
                        # scale/border/crop without a round trip).
                        **({"width_mm": value["width_mm"], "height_mm": value["height_mm"]} if value["width_mm"] is not None else {}),
                    }
                    for value in option["values"]
                ],
            }
            for option in catalogue["options"]
        ],
    }


def _serialize_quote(quote, locale):
    if quote is None:
        return None
    return {
        "base_aed": _fils_to_aed(quote["base_fils"]),
        "uplifts": [
            {
                "option": uplift["option"],
                "label": _text(uplift, "label", locale),
                "percent": uplift["percent"],
                "amount_aed": _fils_to_aed(uplift["amount_fils"]),
            }
            for uplift in quote["uplifts"]
        ],
        "subtotal_aed": _fils_to_aed(quote["subtotal_fils"]),
        "vat_aed": _fils_to_aed(quote["vat_fils"]),
        "total_aed": _fils_to_aed(quote["total_fils"]),
        "per_piece_aed": str((Decimal(quote["total_fils"]) / 100 / quote["quantity"]).quantize(Decimal("0.001"))),
        "quantity": quote["quantity"],
    }


def _serialize_notices(notices, locale):
    return [
        {"code": n["code"], "option": n["option"], "from": n["from"], "to": n["to"], "reason": _text(n, "reason", locale)}
        for n in notices
    ]


def _serialize_blocked(blocked, locale):
    return {
        option_code: {
            value_code: {"code": reason["code"], "reason": _text(reason, "reason", locale)}
            for value_code, reason in values.items()
        }
        for option_code, values in blocked.items()
    }


def _serialize_grid(rows, locale):
    return [
        {
            "quantity": row["quantity"],
            "cells": [
                {
                    "quantity": cell["quantity"],
                    "turnaround": cell["turnaround"],
                    "blocked": cell["blocked"],
                    "reason": cell["reason_ar"] if locale == "ar" and cell.get("reason_ar") else cell["reason_en"],
                    "quote": _serialize_quote(cell["quote"], locale),
                }
                for cell in row["cells"]
            ],
        }
        for row in rows
    ]


def _serialize_clock(catalogue, resolved, now):
    """seconds to Cut-off plus the promised date/window for the resolved Turnaround."""
    turnaround_option = option_by_code(catalogue, "turnaround")
    value = value_by_code(turnaround_option, resolved["turnaround"])
    delivery = promised_delivery(
        now,
        cutoff_time=value["cutoff_time"],
        working_day_offset=value["working_day_offset"],
        window_start=value["delivery_window_start"],
        window_end=value["delivery_window_end"],
    )
    return {
        "now": now.isoformat(),
        "seconds_to_cutoff": seconds_to_cutoff(now, value["cutoff_time"]),
        "promised_date": delivery["date"].isoformat(),
        "window_start": delivery["window_start"].strftime("%H:%M") if delivery["window_start"] else None,
        "window_end": delivery["window_end"].strftime("%H:%M") if delivery["window_end"] else None,
    }


class ProductCatalogueView(APIView):
    """GET the Options, values and defaults for a Product."""

    def get(self, request, slug):
        product = get_object_or_404(Product, slug=slug, active=True)
        locale = request.query_params.get("locale", "en")
        catalogue = load_catalogue(product)
        data = _serialize_catalogue(catalogue, locale)
        data["defaults"] = default_selection(catalogue)
        # The Fit/Fill dialog (ticket 09) computes its previews client-side
        # (lib/sizeChoice.js) and needs the Product's bleed/safe mm for the
        # Fill scale and the preview's guide lines.
        data["bleed_mm"] = product.bleed_mm
        data["safe_mm"] = product.safe_mm
        return Response(data)


class ProductConfigurationView(APIView):
    """GET the Configuration state for a Product: resolved selection, blocked
    reasons, the price grid and the selected Quote."""

    def get(self, request, slug):
        product = get_object_or_404(Product, slug=slug, active=True)
        locale = request.query_params.get("locale", "en")
        catalogue = load_catalogue(product)
        defaults = default_selection(catalogue)

        selection = {}
        for option in catalogue["options"]:
            requested = request.query_params.get(option["code"])
            valid_codes = {value["code"] for value in option["values"]}
            selection[option["code"]] = requested if requested in valid_codes else defaults[option["code"]]

        now = current_time()
        resolved, notices = resolve_selection(catalogue, selection, now=now)
        quote = compute_quote(catalogue, resolved)

        return Response({
            "selection": resolved,
            "notices": _serialize_notices(notices, locale),
            "blocked": _serialize_blocked(blocked_map(catalogue, resolved, now=now), locale),
            "quote": _serialize_quote(quote, locale),
            "price_grid": _serialize_grid(price_grid(catalogue, resolved, now=now), locale),
            "clock": _serialize_clock(catalogue, resolved, now),
        })
