from decimal import Decimal

from django.test import SimpleTestCase

from apps.merchants.management.commands.rebuild_unique_production_catalog import (
    Command,
    DUMMYJSON_SOURCE,
    UNIQUE_SOURCE,
    _source_key,
)
from apps.merchants.models import Product


def source_product():
    return {
        "code": "8901058895780",
        "product_name": "Hot & Sweet Sauce",
        "brands": "Maggi",
        "quantity": "500 g",
        "image_front_small_url": "https://images.openfoodfacts.org/example.200.jpg",
        "categories_tags": ["en:condiments", "en:sauces"],
        "nutriscore_grade": "d",
        "ecoscore_grade": "unknown",
    }


class UniqueProductionCatalogTests(SimpleTestCase):
    def test_source_identity_does_not_depend_on_merchant(self):
        product = Product(
            title="Apple MacBook Air 13-inch",
            source_name=DUMMYJSON_SOURCE,
            price=Decimal("75000.00"),
        )

        self.assertEqual(_source_key(product), "dummyjson:apple macbook air 13-inch")

    def test_title_collision_adds_the_barcode(self):
        command = Command()
        used = {"maggi hot & sweet sauce · 500 g"}

        title = command._title(source_product(), used)

        self.assertEqual(title, "Maggi Hot & Sweet Sauce · 500 g · 8901058895780")

    def test_generated_product_is_image_backed_and_bounded(self):
        values = Command()._values(
            source_product(), "Maggi Hot & Sweet Sauce · 500 g"
        )

        self.assertEqual(values["source_name"], UNIQUE_SOURCE)
        self.assertEqual(values["specifications"]["barcode"], "8901058895780")
        self.assertEqual(values["category"], "Groceries · Sauces")
        self.assertTrue(values["image_url"].startswith("https://"))
        self.assertGreater(values["price"], Decimal("0"))
        self.assertLessEqual(values["price"], Decimal("2000"))
        Product(**values).full_clean(exclude=["merchant"])
