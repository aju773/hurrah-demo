"""Configuration rules: is a value blocked given the rest of a selection, and what
does the Configuration fall back to when a pick knocks out its current value?

Pure functions over the plain catalogue produced by `catalogue.load_catalogue` and
a selection dict of {option_code: value_code}. No ORM access here.
"""

from .catalogue import option_by_code, value_by_code
from .clock import approval_day

NOT_AVAILABLE_REASON_EN = "Not available"
NOT_AVAILABLE_REASON_AR = "غير متاح"


def _sameday_cutoff_reason(value, now):
    """Blocked reason for a Turnaround value whose Cut-off has passed, or which falls
    on a non-Working day, at `now`. Driven by the value's own Cut-off data — any
    Turnaround with a same-day Working-day offset (0) is subject to it, not just the
    one literally coded "same-day". `now` is None outside of request handling (e.g.
    plain pure-module tests), in which case the time rule is skipped entirely.

    Delegates the "is now still on time" check to `clock.approval_day` (the same
    function that drives promised delivery) rather than re-deriving it, so the two
    can never silently diverge."""
    if now is None:
        return None
    cutoff_time = value.get("cutoff_time")
    if cutoff_time is None or value.get("working_day_offset") != 0:
        return None
    if approval_day(now, cutoff_time) == now.date():
        return None
    label = value.get("label_ar") or value["label_en"]
    return {
        "code": "sameday_cutoff",
        "reason_en": f"{value['label_en']}: approve by {cutoff_time.strftime('%H:%M')} on Working days",
        "reason_ar": f"{label}: الموافقة بحلول {cutoff_time.strftime('%H:%M')} في أيام العمل",
    }


def default_selection(catalogue):
    return {
        option["code"]: next(v["code"] for v in option["values"] if v["is_default"])
        for option in catalogue["options"]
    }


def blocked_reason(catalogue, selection, option_code, value_code, now=None):
    """None if `option_code=value_code` is allowed alongside the rest of `selection`,
    else a dict with a reason code and English/Arabic text. `now` is a Dubai-aware
    datetime (see `orders.demo_clock`); pass None to skip the Same-day time rule."""
    option = option_by_code(catalogue, option_code)
    value = value_by_code(option, value_code)
    trial = {**selection, option_code: value_code}

    # Permanent blocks (Restrictions, missing prices) take priority over the
    # Same-day time rule: a value that's both restricted and past its Cut-off should
    # report the permanent reason, not a transient one that implies it'll be
    # available again once the clock moves on.
    for other in catalogue["options"]:
        if other["code"] == option_code:
            continue
        other_value_code = trial[other["code"]]
        here = (option_code, value_code)
        there = (other["code"], other_value_code)
        for restriction in catalogue["restrictions"]:
            pair = {restriction["x"], restriction["y"]}
            if here in pair and there in pair and option["yield_order"] <= other["yield_order"]:
                return {
                    "code": "restricted",
                    "reason_en": restriction["reason_en"],
                    "reason_ar": restriction["reason_ar"],
                }

    if option["pricing_role"] == "base":
        base_role_codes = {o["code"] for o in catalogue["options"] if o["pricing_role"] == "base"}
        combo = {code: trial[code] for code in base_role_codes}
        if not any(bp["combo"] == combo for bp in catalogue["base_prices"]):
            return {"code": "not_available", "reason_en": NOT_AVAILABLE_REASON_EN, "reason_ar": NOT_AVAILABLE_REASON_AR}

    sameday_reason = _sameday_cutoff_reason(value, now)
    if sameday_reason is not None:
        return sameday_reason

    return None


def blocked_map(catalogue, selection, now=None):
    """{option_code: {value_code: reason}} for every currently-blocked value."""
    result = {}
    for option in catalogue["options"]:
        blocked_values = {}
        for value in option["values"]:
            reason = blocked_reason(catalogue, selection, option["code"], value["code"], now=now)
            if reason is not None:
                blocked_values[value["code"]] = reason
        result[option["code"]] = blocked_values
    return result


def _fallback_value(catalogue, selection, option, now=None):
    """Nearest allowed value earlier in sort order, else nearest later one."""
    values = option["values"]
    current_code = selection[option["code"]]
    current_index = next(i for i, v in enumerate(values) if v["code"] == current_code)

    for i in range(current_index - 1, -1, -1):
        if blocked_reason(catalogue, selection, option["code"], values[i]["code"], now=now) is None:
            return values[i]["code"]
    for i in range(current_index + 1, len(values)):
        if blocked_reason(catalogue, selection, option["code"], values[i]["code"], now=now) is None:
            return values[i]["code"]
    return None


def resolve_selection(catalogue, selection, now=None):
    """Apply fallback to every option whose current value is blocked by the rest of
    the selection. Returns (resolved_selection, notices)."""
    selection = dict(selection)
    notices = []

    changed = True
    while changed:
        changed = False
        for option in catalogue["options"]:
            current_code = selection[option["code"]]
            reason = blocked_reason(catalogue, selection, option["code"], current_code, now=now)
            if reason is None:
                continue
            fallback_code = _fallback_value(catalogue, selection, option, now=now)
            if fallback_code is not None and fallback_code != current_code:
                new_label_en = next(v["label_en"] for v in option["values"] if v["code"] == fallback_code)
                new_label_ar = next(v["label_ar"] for v in option["values"] if v["code"] == fallback_code)
                selection[option["code"]] = fallback_code
                notices.append({
                    "code": "fallback",
                    "option": option["code"],
                    "from": current_code,
                    "to": fallback_code,
                    "reason_en": f"{reason['reason_en']} — changed to {new_label_en}",
                    "reason_ar": f"{reason['reason_ar']} — {new_label_ar}" if reason["reason_ar"] else "",
                })
                changed = True

    return selection, notices
