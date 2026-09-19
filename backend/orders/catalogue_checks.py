"""Catalogue integrity checks over the plain catalogue from `catalogue.load_catalogue`:
the defaults must form a valid Configuration (spec: "checked when the catalogue is
saved"), and the Base price list should have no gaps (admin completeness report).
Pure functions, no ORM.
"""

from itertools import product as cartesian_product

from .catalogue import option_by_code
from .rules import blocked_reason


def defaults_problems(catalogue):
    """[{code, option, message}] for everything wrong with the catalogue's defaults.

    Exactly one default per Option, and the defaults together must not hit a
    Restriction or a missing Base price. Empty when the starting Configuration is
    valid."""
    problems = []
    selection = {}

    for option in catalogue["options"]:
        defaults = [v for v in option["values"] if v["is_default"]]
        if not defaults:
            problems.append({
                "code": "no_default", "option": option["code"],
                "message": f"{option['name_en']} has no default value.",
            })
        elif len(defaults) > 1:
            problems.append({
                "code": "multiple_defaults", "option": option["code"],
                "message": f"{option['name_en']} has more than one default value.",
            })
        else:
            selection[option["code"]] = defaults[0]["code"]

    if problems:
        return problems

    for option in catalogue["options"]:
        reason = blocked_reason(catalogue, selection, option["code"], selection[option["code"]])
        if reason is None:
            continue
        code = "defaults_restricted" if reason["code"] == "restricted" else "defaults_not_available"
        if code == "defaults_not_available" and any(p["code"] == code for p in problems):
            continue  # every base-role Option reports the same missing price
        problems.append({
            "code": code, "option": option["code"],
            "message": f"The defaults are not a valid Configuration: {reason['reason_en']} ({option['name_en']}).",
        })
    return problems


def missing_base_prices(catalogue):
    """[{option_code: value_code}] for each combination of active base-role Option
    values that has no Base price row, in catalogue order."""
    base_options = [o for o in catalogue["options"] if o["pricing_role"] == "base"]
    if not base_options:
        return []

    priced = [bp["combo"] for bp in catalogue["base_prices"]]
    missing = []
    for values in cartesian_product(*[o["values"] for o in base_options]):
        combo = {o["code"]: v["code"] for o, v in zip(base_options, values)}
        if combo not in priced:
            missing.append(combo)
    return missing


def describe_combo(catalogue, combo):
    """Human label for a base-role combination, e.g. "A6 · 130gsm gloss · 100"."""
    parts = []
    for option_code, value_code in combo.items():
        option = option_by_code(catalogue, option_code)
        parts.append(next(v["label_en"] for v in option["values"] if v["code"] == value_code))
    return " · ".join(parts)
