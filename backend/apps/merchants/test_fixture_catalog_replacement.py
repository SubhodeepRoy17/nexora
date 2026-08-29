from collections import Counter
from decimal import Decimal

from django.test import SimpleTestCase

from apps.merchants.management.commands.replace_fixture_catalog import (
    BRAND_URLS,
    Command,
    IMAGE_ASSETS,
    KEYBOARD_FACTS,
    REPLACEMENTS,
)
from apps.merchants.models import Product
from apps.merchants.schemas import validate_specifications


class FixtureCatalogReplacementTests(SimpleTestCase):
    def test_manifest_has_exact_category_coverage(self):
        self.assertEqual(
            Counter(item["category"] for item in REPLACEMENTS),
            Counter({
                "Keyboards": 14,
                "Keyboard Accessories": 3,
                "Mice": 10,
                "Headphones": 10,
                "Monitors": 10,
                "Webcams": 10,
                "USB Hubs": 10,
                "Laptop Stands": 10,
                "Power Banks": 10,
                "Desk Lamps": 10,
                "Laptop Backpacks": 10,
            }),
        )

    def test_every_replacement_has_unique_real_name_and_source_data(self):
        titles = [item["title"].casefold() for item in REPLACEMENTS]

        self.assertEqual(len(titles), 107)
        self.assertEqual(len(titles), len(set(titles)))
        for item in REPLACEMENTS:
            self.assertNotIn("nexora", item["title"].casefold())
            self.assertNotIn("soumya", item["title"].casefold())
            self.assertIn(item["brand"], BRAND_URLS)
            self.assertTrue(BRAND_URLS[item["brand"]].startswith("https://"))
            self.assertIn(item["category"], IMAGE_ASSETS)
            self.assertTrue(IMAGE_ASSETS[item["category"]][0].startswith("https://"))

    def test_keyboard_facts_cover_every_replacement_keyboard(self):
        keyboard_titles = {
            item["title"] for item in REPLACEMENTS if item["category"] == "Keyboards"
        }

        self.assertEqual(keyboard_titles, set(KEYBOARD_FACTS))

    def test_catalog_contract_accepts_model_and_image_provenance(self):
        result = validate_specifications({
            "brand": "Logitech",
            "model": "K120",
            "product_type": "Keyboards",
            "image_source_url": "https://commons.wikimedia.org/wiki/File:Backlit_keyboard.jpg",
            "image_note": "Category-representative image.",
        })

        self.assertEqual(result["model"], "K120")

    def test_replacement_product_satisfies_the_product_contract(self):
        product = Product(
            title="Old fixture",
            category="Keyboards",
            price=Decimal("2499.00"),
            stock_quantity=5,
        )

        Command()._apply_replacement(product, REPLACEMENTS[0])

        product.full_clean(exclude=["merchant"])
        self.assertEqual(product.specifications["model"], "K120")
        self.assertTrue(product.image_url.startswith("https://"))
