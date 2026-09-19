# Data migration: delivery windows for the Flyers Turnaround values, per
# docs/.scratch/flyer-demo/issues/16-flyer-demo-spec.md, Clock and turnaround module.
# Same-day and Express: 15:00-20:00. Standard: by 20:00 (no window start). ASSUMPTION (demo).

from datetime import time

from django.db import migrations

# code -> (window_start, window_end)
WINDOWS = {
    "same-day": (time(15, 0), time(20, 0)),
    "express": (time(15, 0), time(20, 0)),
    "standard": (None, time(20, 0)),
}


def set_windows(apps, schema_editor):
    OptionValue = apps.get_model("orders", "OptionValue")
    for code, (window_start, window_end) in WINDOWS.items():
        OptionValue.objects.filter(option__code="turnaround", code=code).update(
            delivery_window_start=window_start, delivery_window_end=window_end,
        )


def clear_windows(apps, schema_editor):
    OptionValue = apps.get_model("orders", "OptionValue")
    OptionValue.objects.filter(option__code="turnaround", code__in=WINDOWS).update(
        delivery_window_start=None, delivery_window_end=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0007_democlock_optionvalue_delivery_window_end_and_more"),
    ]

    operations = [
        migrations.RunPython(set_windows, clear_windows),
    ]
