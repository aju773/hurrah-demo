"""Quote calculation: Base price + additive Uplifts + VAT, in integer fils.

Pure functions over the plain catalogue produced by `catalogue.load_catalogue`. No
ORM access here. 100 fils = 1 AED.
"""

from decimal import ROUND_HALF_UP, Decimal

from .catalogue import option_by_code, value_by_code
from .rules import blocked_reason

VAT_PERCENT = Decimal("5")


def _round_half_up_fils(amount):
    return int(Decimal(amount).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def base_price_fils(catalogue, selection):
    base_role_codes = {o["code"] for o in catalogue["options"] if o["pricing_role"] == "base"}
    combo = {code: selection[code] for code in base_role_codes}
    for base_price in catalogue["base_prices"]:
        if base_price["combo"] == combo:
            return base_price["amount_fils"]
    return None


def compute_quote(catalogue, selection):
    """None if the base-role combination has no stored price."""
    base_fils = base_price_fils(catalogue, selection)
    if base_fils is None:
        return None

    uplifts = []
    for option in catalogue["options"]:
        if option["pricing_role"] != "uplift":
            continue
        value = value_by_code(option, selection[option["code"]])
        percent = value["uplift_percent"] or 0
        if not percent:
            continue
        amount_fils = _round_half_up_fils(Decimal(base_fils) * Decimal(str(percent)) / Decimal(100))
        uplifts.append({
            "option": option["code"],
            "value": value["code"],
            "label_en": value["label_en"],
            "label_ar": value["label_ar"],
            "percent": percent,
            "amount_fils": amount_fils,
        })

    subtotal_fils = base_fils + sum(u["amount_fils"] for u in uplifts)
    vat_fils = _round_half_up_fils(Decimal(subtotal_fils) * VAT_PERCENT / Decimal(100))
    total_fils = subtotal_fils + vat_fils

    quantity_option = option_by_code(catalogue, "quantity")
    quantity = value_by_code(quantity_option, selection["quantity"])["integer_value"]

    return {
        "base_fils": base_fils,
        "uplifts": uplifts,
        "subtotal_fils": subtotal_fils,
        "vat_fils": vat_fils,
        "total_fils": total_fils,
        "quantity": quantity,
    }


def price_grid(catalogue, selection, now=None):
    """A Quote for every Quantity x Turnaround cell at the current Size/Paper/Sides."""
    quantity_option = option_by_code(catalogue, "quantity")
    turnaround_option = option_by_code(catalogue, "turnaround")

    rows = []
    for quantity_value in quantity_option["values"]:
        cells = []
        for turnaround_value in turnaround_option["values"]:
            trial = {**selection, "quantity": quantity_value["code"], "turnaround": turnaround_value["code"]}
            reason = (
                blocked_reason(catalogue, trial, "quantity", quantity_value["code"], now=now)
                or blocked_reason(catalogue, trial, "turnaround", turnaround_value["code"], now=now)
            )
            if reason is not None:
                cells.append({
                    "quantity": quantity_value["code"],
                    "turnaround": turnaround_value["code"],
                    "blocked": True,
                    "reason_en": reason["reason_en"],
                    "reason_ar": reason["reason_ar"],
                    "quote": None,
                })
                continue

            quote = compute_quote(catalogue, trial)
            cells.append({
                "quantity": quantity_value["code"],
                "turnaround": turnaround_value["code"],
                "blocked": quote is None,
                "reason_en": None if quote is not None else "Not available",
                "reason_ar": None if quote is not None else "غير متاح",
                "quote": quote,
            })
        rows.append({"quantity": quantity_value["code"], "cells": cells})
    return rows
