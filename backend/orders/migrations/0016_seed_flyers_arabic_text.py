# Data migration: Arabic text for the Flyers catalogue (Option names, Option value
# labels, Restriction reasons). Machine translation for the demo, shown behind a
# "Draft translation" pill (spec: Arabic stories 113-119) — a native speaker should
# review before launch. Only fills blanks, so anything staff already edited in
# admin is kept.

from django.db import migrations

FLYERS_SLUG = "flyers"

OPTION_NAMES = {
    "size": "المقاس",
    "paper": "الورق",
    "sides": "الأوجه",
    "quantity": "الكمية",
    "turnaround": "مدة التنفيذ",
}

VALUE_LABELS = {
    "size": {"a6": "A6", "a5": "A5", "a4": "A4", "a3": "A3", "dl": "DL"},
    "paper": {
        "130gsm-gloss": "لامع 130 جم",
        "170gsm-gloss": "لامع 170 جم",
        "350gsm-gloss": "لامع 350 جم",
        "350gsm-matt": "مطفي 350 جم",
    },
    "sides": {"single": "وجه واحد", "double": "وجهان"},
    "quantity": {"100": "100", "250": "250", "500": "500", "1000": "1,000", "2500": "2,500", "5000": "5,000"},
    "turnaround": {"standard": "عادي", "express": "سريع", "same-day": "في اليوم نفسه (دبي)"},
}

RESTRICTION_REASONS = {
    "Same-day not available for A3": "التسليم في اليوم نفسه غير متاح لمقاس A3",
    "Same-day up to 1,000 copies": "التسليم في اليوم نفسه حتى 1,000 نسخة",
    "Express up to 2,500 copies": "التسليم السريع حتى 2,500 نسخة",
}


def seed_arabic(apps, schema_editor):
    Option = apps.get_model("orders", "Option")
    OptionValue = apps.get_model("orders", "OptionValue")
    Restriction = apps.get_model("orders", "Restriction")

    for option in Option.objects.filter(product__slug=FLYERS_SLUG):
        if not option.name_ar and option.code in OPTION_NAMES:
            option.name_ar = OPTION_NAMES[option.code]
            option.save(update_fields=["name_ar"])
        for value in OptionValue.objects.filter(option=option):
            label = VALUE_LABELS.get(option.code, {}).get(value.code)
            if label and not value.label_ar:
                value.label_ar = label
                value.save(update_fields=["label_ar"])

    for restriction in Restriction.objects.filter(value_x__option__product__slug=FLYERS_SLUG):
        reason = RESTRICTION_REASONS.get(restriction.reason_en)
        if reason and not restriction.reason_ar:
            restriction.reason_ar = reason
            restriction.save(update_fields=["reason_ar"])


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0015_orderline_turnaround"),
    ]

    operations = [
        migrations.RunPython(seed_arabic, migrations.RunPython.noop),
    ]
