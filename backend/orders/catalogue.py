"""Loads a Product's Options, Option values, Restrictions and Base prices into
plain data structures, so the rules and pricing modules stay pure (no ORM)."""


def option_by_code(catalogue, code):
    return next(o for o in catalogue["options"] if o["code"] == code)


def value_by_code(option, code):
    return next(v for v in option["values"] if v["code"] == code)


def load_catalogue(product):
    options = []
    value_pk_to_ref = {}

    for option in product.options.filter(active=True).order_by("sort_order"):
        values = []
        for value in option.values.filter(active=True).order_by("sort_order"):
            entry = {
                "code": value.code,
                "label_en": value.label_en,
                "label_ar": value.label_ar,
                "is_default": value.is_default,
                "integer_value": value.integer_value,
                "width_mm": value.width_mm,
                "height_mm": value.height_mm,
                "page_count": value.page_count,
                "uplift_percent": value.uplift_percent,
                "cutoff_time": value.cutoff_time,
                "working_day_offset": value.working_day_offset,
                "delivery_window_start": value.delivery_window_start,
                "delivery_window_end": value.delivery_window_end,
            }
            values.append(entry)
            value_pk_to_ref[value.pk] = (option.code, value.code)

        options.append({
            "code": option.code,
            "name_en": option.name_en,
            "name_ar": option.name_ar,
            "pricing_role": option.pricing_role,
            "yield_order": option.yield_order,
            "values": values,
        })

    restrictions = []
    known_pks = set(value_pk_to_ref)
    from .models import Restriction

    for restriction in Restriction.objects.filter(value_x_id__in=known_pks, value_y_id__in=known_pks):
        restrictions.append({
            "x": value_pk_to_ref[restriction.value_x_id],
            "y": value_pk_to_ref[restriction.value_y_id],
            "reason_en": restriction.reason_en,
            "reason_ar": restriction.reason_ar,
        })

    base_role_codes = {o["code"] for o in options if o["pricing_role"] == "base"}
    base_prices = []
    for base_price in product.base_prices.prefetch_related("values"):
        combo = {}
        for value in base_price.values.all():
            option_code, value_code = value_pk_to_ref[value.pk]
            combo[option_code] = value_code
        if set(combo) == base_role_codes:
            base_prices.append({"combo": combo, "amount_fils": base_price.amount_fils})

    return {"product": product, "options": options, "restrictions": restrictions, "base_prices": base_prices}
