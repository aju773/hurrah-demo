# Data migration: the Flyers product catalogue (Options, Option values, Restrictions,
# Base prices) per docs/.scratch/flyer-demo/issues/02-flyer-option-set.md and 03-pricing-model.md.
# All values are ASSUMPTION (demo).

from datetime import time

from django.db import migrations

FLYERS_SLUG = "flyers"

SIZES = [
    # code, label, width_mm, height_mm, sort_order, is_default
    ("a6", "A6", 105, 148, 0, False),
    ("a5", "A5", 148, 210, 1, True),
    ("a4", "A4", 210, 297, 2, False),
    ("a3", "A3", 297, 420, 3, False),
    ("dl", "DL", 99, 210, 4, False),
]

PAPERS = [
    # code, label, sort_order, is_default
    ("130gsm-gloss", "130gsm gloss", 0, False),
    ("170gsm-gloss", "170gsm gloss", 1, True),
    ("350gsm-gloss", "350gsm gloss", 2, False),
    ("350gsm-matt", "350gsm matt", 3, False),
]

SIDES = [
    # code, label, sort_order, is_default, page_count, uplift_percent
    ("single", "Single-sided", 0, True, 1, 0),
    ("double", "Double-sided", 1, False, 2, 20),
]

QUANTITIES = [
    # code, label, sort_order, is_default, integer_value
    ("100", "100", 0, False, 100),
    ("250", "250", 1, False, 250),
    ("500", "500", 2, True, 500),
    ("1000", "1,000", 3, False, 1000),
    ("2500", "2,500", 4, False, 2500),
    ("5000", "5,000", 5, False, 5000),
]

TURNAROUNDS = [
    # code, label, sort_order, is_default, uplift_percent, cutoff_time, working_day_offset
    ("standard", "Standard", 0, True, 0, time(14, 0), 3),
    ("express", "Express", 1, False, 30, time(14, 0), 1),
    ("same-day", "Same-day Dubai", 2, False, 50, time(11, 0), 0),
]

# Size x Paper x Quantity -> ex-VAT AED, from the pricing-model ticket's table.
BASE_PRICES_AED = {
    ("a6", "130gsm-gloss"): {100: 60, 250: 95, 500: 148, 1000: 202, 2500: 290, 5000: 428},
    ("a6", "170gsm-gloss"): {100: 67, 250: 105, 500: 165, 1000: 224, 2500: 322, 5000: 476},
    ("a6", "350gsm-gloss"): {100: 133, 250: 210, 500: 329, 1000: 448, 2500: 644, 5000: 952},
    ("a6", "350gsm-matt"): {100: 133, 250: 210, 500: 329, 1000: 448, 2500: 644, 5000: 952},
    ("a5", "130gsm-gloss"): {100: 86, 250: 135, 500: 212, 1000: 288, 2500: 414, 5000: 612},
    ("a5", "170gsm-gloss"): {100: 95, 250: 150, 500: 235, 1000: 320, 2500: 460, 5000: 680},
    ("a5", "350gsm-gloss"): {100: 190, 250: 300, 500: 470, 1000: 640, 2500: 920, 5000: 1360},
    ("a5", "350gsm-matt"): {100: 190, 250: 300, 500: 470, 1000: 640, 2500: 920, 5000: 1360},
    ("a4", "130gsm-gloss"): {100: 145, 250: 230, 500: 360, 1000: 490, 2500: 704, 5000: 1040},
    ("a4", "170gsm-gloss"): {100: 162, 250: 255, 500: 400, 1000: 544, 2500: 782, 5000: 1156},
    ("a4", "350gsm-gloss"): {100: 323, 250: 510, 500: 799, 1000: 1088, 2500: 1564, 5000: 2312},
    ("a4", "350gsm-matt"): {100: 323, 250: 510, 500: 799, 1000: 1088, 2500: 1564, 5000: 2312},
    ("a3", "130gsm-gloss"): {100: 282, 250: 446, 500: 698, 1000: 950, 2500: 1366, 5000: 2020},
    ("a3", "170gsm-gloss"): {100: 314, 250: 495, 500: 776, 1000: 1056, 2500: 1518, 5000: 2244},
    ("a3", "350gsm-gloss"): {100: 627, 250: 990, 500: 1551, 1000: 2112, 2500: 3036, 5000: 4488},
    ("a3", "350gsm-matt"): {100: 627, 250: 990, 500: 1551, 1000: 2112, 2500: 3036, 5000: 4488},
    ("dl", "130gsm-gloss"): {100: 68, 250: 108, 500: 169, 1000: 230, 2500: 331, 5000: 490},
    ("dl", "170gsm-gloss"): {100: 76, 250: 120, 500: 188, 1000: 256, 2500: 368, 5000: 544},
    ("dl", "350gsm-gloss"): {100: 152, 250: 240, 500: 376, 1000: 512, 2500: 736, 5000: 1088},
    ("dl", "350gsm-matt"): {100: 152, 250: 240, 500: 376, 1000: 512, 2500: 736, 5000: 1088},
}

# (size, quantity) or (turnaround-blocking) restrictions: reason text, and which value
# pairs are blocked. Turnaround always has the weakest yield order, so it is the one
# greyed out.
RESTRICTIONS = [
    ("turnaround", "same-day", "size", "a3", "Same-day not available for A3"),
    ("turnaround", "same-day", "quantity", "2500", "Same-day up to 1,000 copies"),
    ("turnaround", "same-day", "quantity", "5000", "Same-day up to 1,000 copies"),
    ("turnaround", "express", "quantity", "5000", "Express up to 2,500 copies"),
]


def seed_flyers(apps, schema_editor):
    Product = apps.get_model("orders", "Product")
    Option = apps.get_model("orders", "Option")
    OptionValue = apps.get_model("orders", "OptionValue")
    Restriction = apps.get_model("orders", "Restriction")
    BasePrice = apps.get_model("orders", "BasePrice")

    product, _ = Product.objects.update_or_create(
        slug=FLYERS_SLUG,
        defaults={"name": "Flyers", "active": True},
    )

    def make_option(code, name, sort_order, pricing_role, yield_order):
        return Option.objects.create(
            product=product,
            code=code,
            name_en=name,
            sort_order=sort_order,
            pricing_role=pricing_role,
            yield_order=yield_order,
        )

    size_option = make_option("size", "Size", 0, "base", 30)
    paper_option = make_option("paper", "Paper", 1, "base", 40)
    sides_option = make_option("sides", "Sides", 2, "uplift", 20)
    quantity_option = make_option("quantity", "Quantity", 3, "base", 10)
    turnaround_option = make_option("turnaround", "Turnaround", 4, "uplift", 0)

    size_values = {}
    for code, label, width_mm, height_mm, sort_order, is_default in SIZES:
        size_values[code] = OptionValue.objects.create(
            option=size_option, code=code, label_en=label, sort_order=sort_order,
            is_default=is_default, width_mm=width_mm, height_mm=height_mm,
        )

    paper_values = {}
    for code, label, sort_order, is_default in PAPERS:
        paper_values[code] = OptionValue.objects.create(
            option=paper_option, code=code, label_en=label, sort_order=sort_order, is_default=is_default,
        )

    for code, label, sort_order, is_default, page_count, uplift_percent in SIDES:
        OptionValue.objects.create(
            option=sides_option, code=code, label_en=label, sort_order=sort_order,
            is_default=is_default, page_count=page_count, uplift_percent=uplift_percent,
        )

    quantity_values = {}
    for code, label, sort_order, is_default, integer_value in QUANTITIES:
        quantity_values[code] = OptionValue.objects.create(
            option=quantity_option, code=code, label_en=label, sort_order=sort_order,
            is_default=is_default, integer_value=integer_value,
        )

    turnaround_values = {}
    for code, label, sort_order, is_default, uplift_percent, cutoff_time, working_day_offset in TURNAROUNDS:
        turnaround_values[code] = OptionValue.objects.create(
            option=turnaround_option, code=code, label_en=label, sort_order=sort_order,
            is_default=is_default, uplift_percent=uplift_percent,
            cutoff_time=cutoff_time, working_day_offset=working_day_offset,
        )

    for (size_code, paper_code), by_quantity in BASE_PRICES_AED.items():
        for quantity, amount_aed in by_quantity.items():
            quantity_code = str(quantity)
            base_price = BasePrice.objects.create(product=product, amount_fils=amount_aed * 100)
            base_price.values.set([size_values[size_code], paper_values[paper_code], quantity_values[quantity_code]])

    value_lookup = {
        "size": size_values,
        "quantity": quantity_values,
        "turnaround": turnaround_values,
    }
    for option_x, code_x, option_y, code_y, reason in RESTRICTIONS:
        Restriction.objects.create(
            value_x=value_lookup[option_x][code_x],
            value_y=value_lookup[option_y][code_y],
            reason_en=reason,
        )


def remove_flyers(apps, schema_editor):
    Product = apps.get_model("orders", "Product")
    Product.objects.filter(slug=FLYERS_SLUG).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0005_product_active_alter_product_base_price_aed_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_flyers, remove_flyers),
    ]
