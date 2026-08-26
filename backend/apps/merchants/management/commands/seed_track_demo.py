import os
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.merchants.models import Merchant, Product, ProductRelationship


SOURCE_NAME = "Nexora Track Demo Catalog"
SOURCE_URL = "https://github.com/SubhodeepRoy17/nexora/blob/soumya/docs/CatalogData.md"
SOURCE_LICENSE = "CC0-1.0"
DEMO_PROMPT = "Find the Nexora Nomad 75 quiet travel keyboard under ₹9000"
NO_RESULT_PROMPT = "Find a keyboard under ₹100"


PRODUCTS = (
    {
        "title": "Nexora Nomad 75",
        "description": (
            "Quiet 75% wireless mechanical keyboard designed for coding while travelling, "
            "with USB-C, Bluetooth, and 2.4 GHz connectivity."
        ),
        "category": "Keyboards",
        "price": Decimal("7499.00"),
        "stock_quantity": 12,
        "rating": 4.9,
        "specifications": {
            "switches": "Silent tactile",
            "connectivity": ["Bluetooth 5.1", "2.4 GHz", "USB-C"],
            "battery_life_hours": 180.0,
            "layout": "75%",
            "keycaps": "PBT",
            "hot_swappable": True,
            "warranty_months": 24,
        },
        "tags": ["keyboard", "travel", "coding", "quiet", "wireless", "usb-c", "demo-primary"],
    },
    {
        "title": "Nexora Nomad 75 Travel Case",
        "description": "Protective fitted case for the Nexora Nomad 75 keyboard during travel.",
        "category": "Keyboard Accessories",
        "price": Decimal("999.00"),
        "stock_quantity": 25,
        "rating": 4.7,
        "specifications": {
            "color": "Graphite",
            "material": "Recycled felt",
            "warranty_months": 6,
        },
        "tags": ["accessory", "keyboard", "travel", "case", "75%", "demo-addon"],
    },
    {
        "title": "Nexora Office TKL",
        "description": "Quiet tenkeyless wireless keyboard for a permanent office setup.",
        "category": "Keyboards",
        "price": Decimal("6799.00"),
        "stock_quantity": 16,
        "rating": 4.6,
        "specifications": {
            "switches": "Quiet tactile",
            "connectivity": ["Bluetooth 5.1", "USB-C"],
            "battery_life_hours": 150.0,
            "layout": "TKL",
            "keycaps": "PBT",
            "hot_swappable": True,
            "warranty_months": 12,
        },
        "tags": ["keyboard", "office", "quiet", "wireless", "productivity", "demo-alternative"],
    },
    {
        "title": "Nexora Compact 68",
        "description": "Affordable compact wireless keyboard for small desks and everyday carry.",
        "category": "Keyboards",
        "price": Decimal("5299.00"),
        "stock_quantity": 20,
        "rating": 4.4,
        "specifications": {
            "switches": "Linear",
            "connectivity": ["Bluetooth 5.0", "USB-C"],
            "battery_life_hours": 100.0,
            "layout": "65%",
            "keycaps": "ABS",
            "hot_swappable": False,
            "warranty_months": 12,
        },
        "tags": ["keyboard", "compact", "budget", "wireless", "portable", "demo-alternative"],
    },
    {
        "title": "Nexora Full-Size Wrist Rest",
        "description": "Full-size wrist support that is intentionally incompatible with 75% layouts.",
        "category": "Keyboard Accessories",
        "price": Decimal("899.00"),
        "stock_quantity": 18,
        "rating": 4.3,
        "specifications": {"material": "Memory foam", "warranty_months": 6},
        "tags": ["accessory", "keyboard", "wrist-rest", "full-size", "demo-incompatible"],
    },
    {
        "title": "Nexora Nomad Cable Organizer",
        "description": "Travel cable organizer retained at zero stock to prove unavailable add-ons are withheld.",
        "category": "Keyboard Accessories",
        "price": Decimal("399.00"),
        "stock_quantity": 0,
        "rating": 4.2,
        "specifications": {"material": "Recycled nylon", "warranty_months": 3},
        "tags": ["accessory", "travel", "cable", "organizer", "demo-out-of-stock"],
    },
)


RELATIONSHIPS = (
    {
        "source": "Nexora Nomad 75",
        "related": "Nexora Nomad 75 Travel Case",
        "relationship_type": ProductRelationship.Kind.ACCESSORY,
        "compatibility": {"source_specs": {"layout": "75%"}},
        "benefit": "Protects the catalog-listed 75% keyboard while travelling.",
        "trade_off": "Adds one basket line and ₹999 to the exact quote.",
        "offer_label": "Fitted travel companion",
        "priority": 1,
        "is_active": True,
    },
    {
        "source": "Nexora Nomad 75",
        "related": "Nexora Full-Size Wrist Rest",
        "relationship_type": ProductRelationship.Kind.COMPLEMENT,
        "compatibility": {"source_specs": {"layout": "Full size"}},
        "benefit": "Supports a full-size keyboard setup.",
        "trade_off": "Does not match the selected 75% keyboard layout.",
        "offer_label": "Layout-specific wrist support",
        "priority": 2,
        "is_active": True,
    },
    {
        "source": "Nexora Nomad 75",
        "related": "Nexora Nomad Cable Organizer",
        "relationship_type": ProductRelationship.Kind.COMPLEMENT,
        "compatibility": {"source_specs": {"layout": "75%"}},
        "benefit": "Keeps the keyboard cable organized during travel.",
        "trade_off": "Currently unavailable and therefore never offered.",
        "offer_label": "Travel cable companion",
        "priority": 3,
        "is_active": False,
    },
    {
        "source": "Nexora Nomad 75",
        "related": "Nexora Office TKL",
        "relationship_type": ProductRelationship.Kind.SUBSTITUTE,
        "compatibility": {"source_specs": {}},
        "benefit": "An alternative for buyers prioritizing a permanent office setup.",
        "trade_off": "The larger TKL layout is less convenient for frequent travel.",
        "offer_label": "Office-focused alternative",
        "priority": 10,
        "is_active": True,
    },
    {
        "source": "Nexora Nomad 75",
        "related": "Nexora Compact 68",
        "relationship_type": ProductRelationship.Kind.SUBSTITUTE,
        "compatibility": {"source_specs": {}},
        "benefit": "A lower-cost compact alternative for lighter requirements.",
        "trade_off": "It has shorter catalog-listed battery life and non-hot-swappable switches.",
        "offer_label": "Compact value alternative",
        "priority": 11,
        "is_active": True,
    },
)


def _upsert_demo_product(merchant, payload):
    product = Product.objects.filter(merchant=merchant, title=payload["title"]).first()
    if product is not None and not product.is_demo:
        raise CommandError(
            f"Refusing to overwrite non-demo product '{payload['title']}' for {merchant.name}."
        )
    if product is None:
        product = Product(merchant=merchant)
    for field, value in payload.items():
        setattr(product, field, value)
    product.source_name = SOURCE_NAME
    product.source_url = SOURCE_URL
    product.source_license = SOURCE_LICENSE
    product.is_demo = True
    product.is_active = True
    product.full_clean()
    product.save()
    return product


class Command(BaseCommand):
    help = "Idempotently seed the login-ready Track demo merchant with deterministic growth scenarios."

    @transaction.atomic
    def handle(self, *args, **options):
        call_command("seed_demo_accounts", verbosity=0)
        merchant_username = os.getenv("DEMO_MERCHANT_USERNAME", "").strip()
        try:
            merchant = Merchant.objects.select_related("owner").get(
                owner__username=merchant_username
            )
        except Merchant.DoesNotExist as exc:
            raise CommandError("The configured demo merchant could not be resolved.") from exc

        products = {
            payload["title"]: _upsert_demo_product(merchant, payload)
            for payload in PRODUCTS
        }
        for payload in RELATIONSHIPS:
            relationship, _ = ProductRelationship.objects.update_or_create(
                source_product=products[payload["source"]],
                related_product=products[payload["related"]],
                relationship_type=payload["relationship_type"],
                defaults={
                    key: value
                    for key, value in payload.items()
                    if key not in {"source", "related", "relationship_type"}
                },
            )
            relationship.full_clean()

        self.stdout.write(
            self.style.SUCCESS(
                "Track demo ready: "
                f"merchant={merchant.owner.username}, products={len(products)}, "
                f"relationships={len(RELATIONSHIPS)}, prompt={DEMO_PROMPT.replace('₹', 'INR ')!r}, "
                f"no_result_prompt={NO_RESULT_PROMPT.replace('₹', 'INR ')!r}"
            )
        )
