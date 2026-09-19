from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .catalogue import load_catalogue
from .catalogue_checks import defaults_problems, missing_base_prices
from .models import BasePrice, Option, OptionValue, Product
from .test_catalogue import FAKE_CATALOGUE


def _codes(problems):
    return [p["code"] for p in problems]


class DefaultsProblemsTests(SimpleTestCase):
    def test_valid_defaults_have_no_problems(self):
        self.assertEqual(defaults_problems(FAKE_CATALOGUE), [])

    def test_option_without_a_default_is_reported(self):
        catalogue = _with_default(FAKE_CATALOGUE, "y", None)
        problems = defaults_problems(catalogue)
        self.assertEqual(_codes(problems), ["no_default"])
        self.assertEqual(problems[0]["option"], "y")

    def test_option_with_two_defaults_is_reported(self):
        catalogue = _with_default(FAKE_CATALOGUE, "y", ["y1", "y2"])
        self.assertEqual(_codes(defaults_problems(catalogue)), ["multiple_defaults"])

    def test_defaults_that_hit_a_restriction_are_reported(self):
        catalogue = _with_default(_with_default(FAKE_CATALOGUE, "x", ["x2"]), "y", ["y2"])
        self.assertIn("defaults_restricted", _codes(defaults_problems(catalogue)))

    def test_defaults_without_a_base_price_are_reported(self):
        catalogue = _with_default(_without_x2_price(FAKE_CATALOGUE), "x", ["x2"])
        self.assertEqual(_codes(defaults_problems(catalogue)), ["defaults_not_available"])


class MissingBasePricesTests(SimpleTestCase):
    def test_lists_base_role_combinations_without_a_price(self):
        self.assertEqual(missing_base_prices(_without_x2_price(FAKE_CATALOGUE)), [{"x": "x2", "quantity": "q1"}])

    def test_complete_price_list_has_no_gaps(self):
        self.assertEqual(missing_base_prices(FAKE_CATALOGUE), [])


class SeededFlyersTests(TestCase):
    def test_seeded_flyers_catalogue_is_valid_and_complete(self):
        catalogue = load_catalogue(Product.objects.get(slug="flyers"))
        self.assertEqual(defaults_problems(catalogue), [])
        self.assertEqual(missing_base_prices(catalogue), [])

    def test_a_removed_price_row_shows_in_the_report(self):
        product = Product.objects.get(slug="flyers")
        BasePrice.objects.filter(
            product=product, values__code="a6"
        ).filter(values__code="130gsm-gloss").filter(values__code="100").delete()
        missing = missing_base_prices(load_catalogue(product))
        self.assertEqual(missing, [{"size": "a6", "paper": "130gsm-gloss", "quantity": "100"}])


class AdminCatalogueGuardTests(TestCase):
    """An active Product's catalogue is checked whenever staff save it in admin;
    a save that would leave the defaults invalid is refused and rolled back."""

    def setUp(self):
        self.admin_user = get_user_model().objects.create_superuser("staff", "s@example.com", "pw")
        self.client.force_login(self.admin_user)
        self.product = Product.objects.get(slug="flyers")
        self.a5 = OptionValue.objects.get(option__product=self.product, option__code="size", code="a5")

    def _value_form(self, value, **overrides):
        data = {
            "option": value.option_id,
            "code": value.code,
            "label_en": value.label_en,
            "label_ar": value.label_ar,
            "sort_order": value.sort_order,
            "active": "on" if value.active else "",
            "is_default": "on" if value.is_default else "",
            "integer_value": value.integer_value or "",
            "width_mm": value.width_mm or "",
            "height_mm": value.height_mm or "",
            "page_count": value.page_count or "",
            "uplift_percent": value.uplift_percent if value.uplift_percent is not None else "",
            "cutoff_time": value.cutoff_time or "",
            "working_day_offset": value.working_day_offset if value.working_day_offset is not None else "",
            "delivery_window_start": value.delivery_window_start or "",
            "delivery_window_end": value.delivery_window_end or "",
        }
        data.update(overrides)
        return {k: v for k, v in data.items() if v != ""}

    def test_dropping_the_only_default_is_refused(self):
        url = reverse("admin:orders_optionvalue_change", args=[self.a5.pk])
        response = self.client.post(url, self._value_form(self.a5, is_default=""), follow=True)
        self.a5.refresh_from_db()
        self.assertTrue(self.a5.is_default)
        self.assertContains(response, "no default")

    def test_a_valid_edit_is_saved(self):
        url = reverse("admin:orders_optionvalue_change", args=[self.a5.pk])
        self.client.post(url, self._value_form(self.a5, label_ar="أ5"), follow=True)
        self.a5.refresh_from_db()
        self.assertEqual(self.a5.label_ar, "أ5")

    def test_a_second_default_on_the_same_option_is_refused(self):
        a3 = OptionValue.objects.get(option__product=self.product, option__code="size", code="a3")
        url = reverse("admin:orders_optionvalue_change", args=[a3.pk])
        response = self.client.post(url, self._value_form(a3, is_default="on"), follow=True)
        a3.refresh_from_db()
        self.assertFalse(a3.is_default)
        self.assertContains(response, "more than one default")

    def test_deleting_the_default_value_is_refused(self):
        url = reverse("admin:orders_optionvalue_delete", args=[self.a5.pk])
        self.client.post(url, {"post": "yes"}, follow=True)
        self.assertTrue(OptionValue.objects.filter(pk=self.a5.pk).exists())

    def test_deleting_the_price_of_the_default_combination_is_refused(self):
        price = (
            BasePrice.objects.filter(product=self.product)
            .filter(values__code="a5").filter(values__code="170gsm-gloss").filter(values__code="500").get()
        )
        url = reverse("admin:orders_baseprice_delete", args=[price.pk])
        self.client.post(url, {"post": "yes"}, follow=True)
        self.assertTrue(BasePrice.objects.filter(pk=price.pk).exists())

    def test_inactive_product_can_be_built_up_freely(self):
        draft = Product.objects.create(name="Draft", slug="draft", active=False)
        option = Option.objects.create(product=draft, code="size", name_en="Size")
        url = reverse("admin:orders_option_change", args=[option.pk])
        response = self.client.post(url, {
            "product": draft.pk, "code": "size", "name_en": "Size", "name_ar": "Size", "sort_order": 0,
            "active": "on", "pricing_role": "none", "yield_order": 0,
        }, follow=True)
        option.refresh_from_db()
        self.assertEqual(option.name_ar, "Size")
        self.assertNotContains(response, "no default")

    def test_activating_a_product_with_an_invalid_catalogue_is_refused(self):
        draft = Product.objects.create(name="Draft", slug="draft", active=False)
        Option.objects.create(product=draft, code="size", name_en="Size")
        url = reverse("admin:orders_product_change", args=[draft.pk])
        response = self.client.post(url, {
            "name": "Draft", "slug": "draft", "image_url": "", "active": "on", "bleed_mm": 3, "safe_mm": 5,
            "size_tolerance_mm": 1.5, "bleed_min_mm": 1, "bleed_max_mm": 6, "ppi_error_below": 150,
            "ppi_warn_below": 250,
        }, follow=True)
        draft.refresh_from_db()
        self.assertFalse(draft.active)
        self.assertContains(response, "no default")


class AdminMissingPriceReportTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_superuser("staff", "s@example.com", "pw"))
        self.product = Product.objects.get(slug="flyers")

    def test_product_page_says_when_the_price_list_is_complete(self):
        response = self.client.get(reverse("admin:orders_product_change", args=[self.product.pk]))
        self.assertContains(response, "No missing Base prices")

    def test_product_page_lists_missing_cells(self):
        BasePrice.objects.filter(product=self.product).filter(values__code="a6").filter(
            values__code="130gsm-gloss"
        ).filter(values__code="100").delete()
        response = self.client.get(reverse("admin:orders_product_change", args=[self.product.pk]))
        self.assertContains(response, "1 missing Base price")
        self.assertContains(response, "A6")
        self.assertContains(response, "130gsm gloss")

    def test_product_list_shows_the_missing_count(self):
        response = self.client.get(reverse("admin:orders_product_changelist"))
        self.assertContains(response, "Flyers")


def _with_default(catalogue, option_code, default_codes):
    """Copy of `catalogue` with the default flag reset on one Option's values."""
    options = []
    for option in catalogue["options"]:
        if option["code"] == option_code:
            wanted = default_codes or []
            option = {**option, "values": [{**v, "is_default": v["code"] in wanted} for v in option["values"]]}
        options.append(option)
    return {**catalogue, "options": options}


def _without_x2_price(catalogue):
    return {**catalogue, "base_prices": [bp for bp in catalogue["base_prices"] if bp["combo"]["x"] != "x2"]}
