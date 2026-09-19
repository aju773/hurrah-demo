"""The Commerce switch: with it off (the default) the journey's API responses
carry no money at all; with it on the Price grid and Quote are back."""

import re
import shutil
import tempfile
from datetime import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .clock import DUBAI_TZ
from .fixtures_pdf import build_f1
from .models import DemoClock, Product

CATALOGUE_URL = "/api/products/flyers/catalogue/"
CONFIG_URL = "/api/products/flyers/configuration/"

MONEY_KEY = re.compile(r"aed|fils|price|pricing|vat|total|quote|uplift|amount|cart|payment", re.IGNORECASE)
MONEY_VALUE = re.compile(r"\bAED\b|\bVAT\b|\d\s?AED|AED\s?\d", re.IGNORECASE)


def money_found(node, path="$"):
    """Every path in a decoded JSON body whose key or string value looks like money."""
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if MONEY_KEY.search(key):
                found.append(f"{path}.{key}")
            found.extend(money_found(value, f"{path}.{key}"))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            found.extend(money_found(value, f"{path}[{i}]"))
    elif isinstance(node, str) and MONEY_VALUE.search(node):
        found.append(f"{path} = {node!r}")
    return found


def dubai(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=DUBAI_TZ)


class MoneyCheckerTests(TestCase):
    def test_flags_money_keys_and_values(self):
        self.assertTrue(money_found({"quote": None}))
        self.assertTrue(money_found({"a": [{"total_aed": "1.00"}]}))
        self.assertTrue(money_found({"label": "AED 10"}))
        self.assertEqual(money_found({"label": "Express", "code": "a5"}), [])


class CommerceSwitchOffTests(TestCase):
    """The default: nothing money-shaped leaves the server."""

    def setUp(self):
        self.client = APIClient()
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": dubai(2026, 9, 22, 9, 30)})  # Tuesday

    def test_switch_defaults_to_off(self):
        data = self.client.get(CATALOGUE_URL).json()
        self.assertIs(data["commerce_enabled"], False)
        self.assertIs(self.client.get(CONFIG_URL).json()["commerce_enabled"], False)

    def test_catalogue_has_no_money(self):
        for locale in ("en", "ar"):
            data = self.client.get(CATALOGUE_URL, {"locale": locale}).json()
            self.assertEqual(money_found(data), [], locale)

    def test_configuration_has_no_money(self):
        for params in ({}, {"quantity": "5000", "turnaround": "express"}, {"size": "a3", "turnaround": "same-day"}):
            for locale in ("en", "ar"):
                data = self.client.get(CONFIG_URL, {**params, "locale": locale}).json()
                self.assertEqual(money_found(data), [], (params, locale))
                self.assertNotIn("quote", data)
                self.assertNotIn("price_grid", data)

    def test_configuration_lists_every_turnaround_with_its_promised_date(self):
        data = self.client.get(CONFIG_URL).json()
        by_code = {t["code"]: t for t in data["turnarounds"]}
        self.assertEqual(list(by_code), ["standard", "express", "same-day"])
        # Demo clock: Tuesday 22 Sep 2026, 09:30 Dubai.
        self.assertEqual(by_code["same-day"]["promised_date"], "2026-09-22")
        self.assertEqual(by_code["same-day"]["seconds_to_cutoff"], 90 * 60)
        self.assertEqual(by_code["standard"]["window_start"], None)
        self.assertEqual(by_code["standard"]["window_end"], "20:00")
        self.assertIsNotNone(by_code["express"]["promised_date"])

    def test_selected_turnaround_card_matches_the_clock_block(self):
        data = self.client.get(CONFIG_URL, {"turnaround": "express"}).json()
        card = next(t for t in data["turnarounds"] if t["code"] == data["selection"]["turnaround"])
        self.assertEqual(card["promised_date"], data["clock"]["promised_date"])
        self.assertEqual(card["seconds_to_cutoff"], data["clock"]["seconds_to_cutoff"])

    def test_blocked_turnaround_keeps_its_reason(self):
        DemoClock.objects.update_or_create(pk=1, defaults={"fixed_at": dubai(2026, 9, 22, 11, 30)})
        data = self.client.get(CONFIG_URL, {"turnaround": "same-day"}).json()
        self.assertEqual(data["selection"]["turnaround"], "express")
        self.assertEqual(data["blocked"]["turnaround"]["same-day"]["code"], "sameday_cutoff")
        self.assertEqual(data["notices"][0]["to"], "express")

    def test_fallback_with_notice_still_works(self):
        data = self.client.get(CONFIG_URL, {"size": "a3", "turnaround": "same-day"}).json()
        self.assertEqual(data["selection"]["turnaround"], "express")
        self.assertEqual(data["notices"][0]["code"], "fallback")

    def test_a_combination_without_a_price_row_is_not_available(self):
        product = Product.objects.get(slug="flyers")
        row = product.base_prices.filter(values__code="a4").filter(values__code="170gsm-gloss").filter(values__code="500").first()
        self.assertIsNotNone(row)
        row.delete()
        # Picking the missing combination falls back, and its value is greyed as "Not available".
        data = self.client.get(CONFIG_URL, {"size": "a4", "quantity": "500"}).json()
        self.assertEqual(data["blocked"]["size"]["a4"]["code"], "not_available")
        self.assertEqual(data["notices"][0]["option"], "size")
        self.assertIs(data["available"], True)
        self.assertEqual(money_found(data), [])

    def test_available_is_false_when_nothing_is_priced(self):
        Product.objects.get(slug="flyers").base_prices.all().delete()
        data = self.client.get(CONFIG_URL).json()
        self.assertIs(data["available"], False)
        self.assertEqual(money_found(data), [])

    def test_design_help_settings_have_no_money(self):
        self.assertEqual(money_found(self.client.get("/api/design-requests/settings/").json()), [])


@override_settings(COMMERCE_ENABLED=True)
class CommerceSwitchOnTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_flag_is_true_in_catalogue_and_configuration(self):
        self.assertIs(self.client.get(CATALOGUE_URL).json()["commerce_enabled"], True)
        self.assertIs(self.client.get(CONFIG_URL).json()["commerce_enabled"], True)

    def test_configuration_has_quote_and_grid(self):
        data = self.client.get(CONFIG_URL, {"sides": "double", "quantity": "1000"}).json()
        self.assertEqual(data["quote"]["total_aed"], "403.20")
        self.assertEqual(len(data["price_grid"]), 6)
        self.assertTrue(money_found(data))

    def test_catalogue_keeps_pricing_roles(self):
        data = self.client.get(CATALOGUE_URL).json()
        self.assertTrue(all("pricing_role" in option for option in data["options"]))


class JourneyEndpointsCarryNoMoneyTests(TestCase):
    """Artwork upload, detail, preview and design requests, with the switch off."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_root = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.client = APIClient()
        self.product = Product.objects.get(slug="flyers")

    def tearDown(self):
        self.override.disable()

    def test_artwork_upload_detail_and_preview(self):
        upload = SimpleUploadedFile("flyer.pdf", build_f1().read(), content_type="application/pdf")
        res = self.client.post(
            "/api/artworks/", {"file": upload, "slot": "front", "product": self.product.id}, format="multipart"
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(money_found(body), [])
        front_id = body["front"]["id"]
        self.assertEqual(money_found(self.client.get(f"/api/artworks/{front_id}/").json()), [])
        preview = self.client.get("/api/products/flyers/preview/", {"front": front_id, "size": "a5"})
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(money_found(preview.json()), [])

    def test_design_request_has_no_money(self):
        res = self.client.post(
            "/api/design-requests/",
            {"name": "Layla", "phone": "+971500000001", "brief": "A flyer for my bakery.", "flyer_language": "en"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(money_found(res.json()), [])
