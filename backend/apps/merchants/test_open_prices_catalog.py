from decimal import Decimal

from django.test import SimpleTestCase

from apps.merchants.management.commands.sync_open_prices_catalog import (
    Command,
    SOURCE_NAME,
    _display_title,
)
from apps.merchants.models import Product


def price_row(*, discounted=False):
    return {
        "id": 3210,
        "price": 100,
        "price_is_discounted": discounted,
        "price_without_discount": 125 if discounted else None,
        "currency": "INR",
        "date": "2026-08-20",
        "location": {"osm_display_name": "Hyderabad, Telangana, India"},
        "_nexora_title": "Maggi Hot & Sweet Sauce · 500 g",
        "product": {
            "code": "8901058895780",
            "product_name_en": "Hot & Sweet Sauce",
            "brands": "Maggi",
            "quantity": "500 g",
            "image_url": "https://images.openfoodfacts.org/example.400.jpg",
            "categories_tags": ["en:condiments", "en:sauces"],
            "labels_tags": ["en:vegetarian"],
            "nutriscore_grade": "d",
            "ecoscore_grade": "unknown",
        },
    }


class OpenPricesCatalogTests(SimpleTestCase):
    def test_display_title_keeps_brand_name_and_package_quantity(self):
        self.assertEqual(
            _display_title(price_row()["product"]),
            "Maggi Hot & Sweet Sauce · 500 g",
        )

    def test_recorded_discount_remains_the_observed_offer(self):
        values = Command()._values(price_row(discounted=True), has_offer=True)

        self.assertEqual(values["price"], Decimal("100.00"))
        self.assertEqual(values["compare_at_price"], Decimal("125.00"))
        self.assertEqual(values["source_name"], SOURCE_NAME)
        self.assertEqual(values["category"], "Groceries · Sauces")
        self.assertEqual(values["specifications"]["barcode"], "8901058895780")
        Product(**values).full_clean(exclude=["merchant"])

    def test_test_mode_promotion_is_bounded_to_ten_percent(self):
        offered = Command()._values(price_row(), has_offer=True)
        regular = Command()._values(price_row(), has_offer=False)

        self.assertEqual(offered["price"], Decimal("90.00"))
        self.assertEqual(offered["compare_at_price"], Decimal("100.00"))
        self.assertEqual(regular["price"], Decimal("100.00"))
        self.assertIsNone(regular["compare_at_price"])
