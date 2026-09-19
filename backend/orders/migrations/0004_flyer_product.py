# Data migration: the real flyer product (design/7.png) for the upload/confirm flow.

from decimal import Decimal

from django.db import migrations

FLYER_SLUG = "flyer-glossy-170gsm"


def create_flyer_product(apps, schema_editor):
    Product = apps.get_model("orders", "Product")
    Product.objects.update_or_create(
        slug=FLYER_SLUG,
        defaults={
            "name": "Flyer Real Size (Glossy paper 170gsm)",
            "sku": "HRH-FLY-170G",
            "spec_line": "4 Color • Glossy 170gsm • Standard sizes A6–B3 & DL",
            "base_price_aed": Decimal("84.00"),
        },
    )


def remove_flyer_product(apps, schema_editor):
    Product = apps.get_model("orders", "Product")
    Product.objects.filter(slug=FLYER_SLUG).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_artwork_sides_bleed_pages'),
    ]

    operations = [
        migrations.RunPython(create_flyer_product, remove_flyer_product),
    ]
