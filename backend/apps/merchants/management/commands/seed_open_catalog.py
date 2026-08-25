import json
import re
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.merchants.models import Merchant, Product, ProductRelationship


DUMMYJSON_COMMIT = "55ca918227aed430409a1ae46271448cb102d7f3"
DUMMYJSON_URL = (
    "https://raw.githubusercontent.com/Ovi/DummyJSON/"
    f"{DUMMYJSON_COMMIT}/database/products.json"
)
DUMMYJSON_LICENSE_URL = "https://github.com/Ovi/DummyJSON/blob/master/LICENSE"
INR_PER_USD = Decimal("83.00")


KEYBOARDS = [
    ("Nexora Code 75 Wireless", "Quiet 75% tri-mode board for coding and mixed-device desks.", "7499", 18, 4.8, "Silent tactile", ["Bluetooth 5.1", "2.4 GHz", "USB-C"], 180, "75%", True, "PBT", ["keyboard", "mechanical", "wireless", "quiet", "coding", "macos", "windows"]),
    ("Nexora Flow 75 Lite", "Value-focused gasket keyboard with quiet linear switches.", "6299", 24, 4.6, "Quiet linear", ["Bluetooth 5.0", "2.4 GHz", "USB-C"], 160, "75%", True, "PBT", ["keyboard", "mechanical", "wireless", "quiet", "office", "hot-swap"]),
    ("Nexora Type Mini 68", "Compact wireless mechanical keyboard for smaller workspaces.", "5199", 15, 4.5, "Tactile", ["Bluetooth 5.1", "2.4 GHz", "USB-C"], 120, "65%", True, "PBT", ["keyboard", "mechanical", "compact", "wireless", "coding", "hot-swap"]),
    ("Nexora Studio TKL", "Tenkeyless productivity board with dampened tactile switches.", "7899", 9, 4.7, "Silent tactile", ["Bluetooth 5.1", "USB-C"], 200, "TKL", True, "PBT", ["keyboard", "mechanical", "quiet", "wireless", "productivity", "macos"]),
    ("Nexora Air 75", "Low-profile portable keyboard for office and travel use.", "6999", 12, 4.4, "Low-profile tactile", ["Bluetooth 5.1", "2.4 GHz", "USB-C"], 100, "75% low-profile", True, "PBT", ["keyboard", "low-profile", "wireless", "travel", "quiet", "windows"]),
    ("Nexora Core 96", "Compact full-size layout with a number pad and multi-device pairing.", "7799", 11, 4.5, "Tactile", ["Bluetooth 5.0", "2.4 GHz", "USB-C"], 150, "96%", True, "PBT", ["keyboard", "mechanical", "numpad", "wireless", "office", "hot-swap"]),
    ("Nexora Quiet 60", "Minimal 60% board with dampened linear switches.", "4499", 28, 4.3, "Silent linear", ["Bluetooth 5.0", "USB-C"], 90, "60%", True, "PBT", ["keyboard", "mechanical", "compact", "quiet", "wireless", "budget"]),
    ("Nexora Workboard 84", "Practical 84-key wireless board with tactile feedback.", "5799", 20, 4.4, "Brown tactile", ["Bluetooth 5.1", "2.4 GHz", "USB-C"], 140, "75%", True, "ABS", ["keyboard", "mechanical", "wireless", "coding", "value", "hot-swap"]),
    ("Nexora MacType 75", "Mac-first 75% keyboard with Windows keycaps included.", "7299", 13, 4.7, "Quiet tactile", ["Bluetooth 5.1", "USB-C"], 170, "75%", True, "PBT", ["keyboard", "mechanical", "macos", "windows", "wireless", "quiet"]),
    ("Nexora Office Keys", "Quiet scissor-switch multi-device keyboard for shared offices.", "3499", 32, 4.4, "Scissor", ["Bluetooth 5.1"], 360, "Compact", False, "ABS", ["keyboard", "office", "quiet", "wireless", "macos", "windows"]),
    ("Nexora Ergo Split", "Split ergonomic mechanical keyboard with adjustable tenting.", "8999", 7, 4.6, "Tactile", ["Bluetooth 5.1", "USB-C"], 130, "Split 70%", True, "PBT", ["keyboard", "ergonomic", "mechanical", "wireless", "coding", "hot-swap"]),
    ("Nexora Creator 80", "Premium aluminium TKL board for a stable desktop setup.", "10499", 6, 4.8, "Linear", ["2.4 GHz", "USB-C"], 110, "TKL", True, "PBT", ["keyboard", "mechanical", "aluminium", "creator", "hot-swap", "premium"]),
    ("Nexora Game 65 HE", "Compact Hall-effect board tuned for fast key response.", "8499", 10, 4.5, "Hall effect linear", ["USB-C"], 0, "65%", False, "PBT", ["keyboard", "gaming", "hall-effect", "wired", "compact"]),
    ("Nexora Essential Full", "Affordable full-size wired keyboard for everyday desks.", "2499", 40, 4.2, "Membrane", ["USB-A"], 0, "Full size", False, "ABS", ["keyboard", "office", "budget", "wired", "numpad"]),
    ("Nexora SwitchLab 75", "Hot-swappable enthusiast board with open remapping support.", "7999", 14, 4.7, "Tactile", ["Bluetooth 5.1", "2.4 GHz", "USB-C"], 155, "75%", True, "PBT", ["keyboard", "mechanical", "wireless", "coding", "remappable", "hot-swap"]),
]

ACCESSORIES = [
    ("Nexora Felt Desk Mat", "Soft desk mat sized for compact keyboard and mouse setups.", "899", "Felt", ["accessory", "desk-mat", "keyboard"]),
    ("Nexora 75 Wrist Rest", "Low-profile wrist support sized for 75% keyboards.", "1199", "Memory foam", ["accessory", "wrist-rest", "keyboard", "75%"]),
    ("Nexora Silent Switch Set", "A 90-piece demo switch set for supported hot-swap keyboards.", "1599", "Polycarbonate", ["accessory", "switches", "quiet", "hot-swap"]),
    ("Nexora USB-C Coiled Cable", "Detachable braided USB-C cable for compatible keyboards.", "799", "Braided nylon", ["accessory", "cable", "usb-c", "keyboard"]),
]


def _owner(username):
    user, _ = get_user_model().objects.get_or_create(username=username)
    if user.has_usable_password():
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user


def _merchant(username, name, email):
    merchant, _ = Merchant.objects.update_or_create(
        owner=_owner(username), defaults={"name": name, "email": email}
    )
    return merchant


def _upsert(merchant, payload):
    product = Product.objects.filter(merchant=merchant, title=payload["title"]).first()
    if product is None:
        product = Product(merchant=merchant)
    for field, value in payload.items():
        setattr(product, field, value)
    product.full_clean()
    product.save()
    return product


def _warranty_months(value):
    match = re.search(r"(\d+)\s*(week|month|year)", value or "", flags=re.IGNORECASE)
    if not match:
        return None
    count = int(match.group(1))
    unit = match.group(2).lower()
    return max(1, round(count / 4)) if unit == "week" else count * 12 if unit == "year" else count


class Command(BaseCommand):
    help = "Idempotently seed a licensed open demo catalog and CC0 keyboard scenarios."

    def add_arguments(self, parser):
        parser.add_argument("--skip-external", action="store_true")
        parser.add_argument("--external-limit", type=int, default=60)

    def handle(self, *args, **options):
        demo_merchant = _merchant(
            "nexora-demo-catalog", "Nexora Demo Peripherals", "demo-catalog@nexora.invalid"
        )
        keyboard_products = []
        for title, description, price, stock, rating, switches, connectivity, battery, layout, hot_swap, keycaps, tags in KEYBOARDS:
            keyboard_products.append(
                _upsert(
                    demo_merchant,
                    {
                        "title": title,
                        "description": description,
                        "category": "Keyboards",
                        "price": Decimal(price),
                        "stock_quantity": stock,
                        "rating": rating,
                        "is_active": True,
                        "specifications": {
                            "switches": switches,
                            "connectivity": connectivity,
                            "battery_life_hours": float(battery),
                            "layout": layout,
                            "keycaps": keycaps,
                            "hot_swappable": hot_swap,
                            "warranty_months": 12,
                        },
                        "tags": tags,
                        "source_name": "Nexora CC0 Demo Catalog",
                        "source_url": "https://github.com/SubhodeepRoy17/nexora/blob/soumya/docs/CatalogData.md",
                        "source_license": "CC0-1.0",
                        "is_demo": True,
                    },
                )
            )
        accessory_products = []
        for title, description, price, material, tags in ACCESSORIES:
            accessory_products.append(
                _upsert(
                    demo_merchant,
                    {
                        "title": title,
                        "description": description,
                        "category": "Keyboard Accessories",
                        "price": Decimal(price),
                        "stock_quantity": 30,
                        "rating": 4.4,
                        "is_active": True,
                        "specifications": {"material": material, "warranty_months": 6},
                        "tags": tags,
                        "source_name": "Nexora CC0 Demo Catalog",
                        "source_url": "https://github.com/SubhodeepRoy17/nexora/blob/soumya/docs/CatalogData.md",
                        "source_license": "CC0-1.0",
                        "is_demo": True,
                    },
                )
            )
        for keyboard in keyboard_products:
            for priority, accessory in enumerate(accessory_products[:2], start=1):
                ProductRelationship.objects.update_or_create(
                    source_product=keyboard,
                    related_product=accessory,
                    relationship_type=ProductRelationship.Kind.COMPLEMENT,
                    defaults={
                        "compatibility": {"source_specs": {}},
                        "benefit": "Adds optional desk comfort without changing the selected keyboard.",
                        "trade_off": f"Adds ₹{accessory.price} and one optional basket line.",
                        "offer_label": "Compatible desk companion",
                        "priority": priority,
                        "is_active": True,
                    },
                )

        external_count = 0
        if not options["skip_external"]:
            external_count = self._seed_dummyjson(options["external_limit"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Open catalog ready: {len(keyboard_products)} keyboards, "
                f"{len(accessory_products)} accessories, {external_count} MIT-source products."
            )
        )

    def _seed_dummyjson(self, limit):
        try:
            with urllib.request.urlopen(DUMMYJSON_URL, timeout=30) as response:
                source_products = json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise CommandError(
                "Unable to download the pinned DummyJSON catalog; rerun with --skip-external "
                "for the offline CC0 keyboard set."
            ) from exc
        allowed = {"laptops", "smartphones", "tablets", "mobile-accessories", "sports-accessories"}
        merchant = _merchant(
            "nexora-open-catalog", "Open Catalog Electronics", "open-catalog@nexora.invalid"
        )
        count = 0
        for item in source_products:
            if item.get("category") not in allowed or count >= max(0, min(limit, 100)):
                continue
            dimensions = item.get("dimensions") or {}
            specifications = {
                "dimensions": {
                    "width_mm": float(dimensions["width"]) * 10,
                    "depth_mm": float(dimensions["depth"]) * 10,
                    "height_mm": float(dimensions["height"]) * 10,
                    "weight_grams": float(item.get("weight") or 1),
                },
                "warranty_months": _warranty_months(item.get("warrantyInformation")),
            }
            specifications = {
                key: value for key, value in specifications.items() if value is not None
            }
            price = (Decimal(str(item["price"])) * INR_PER_USD).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            tags = list(
                dict.fromkeys(
                    str(tag).strip().lower()
                    for tag in [item.get("category"), item.get("brand"), *(item.get("tags") or [])]
                    if tag
                )
            )[:30]
            _upsert(
                merchant,
                {
                    "title": item["title"],
                    "description": item.get("description", ""),
                    "category": item["category"].replace("-", " ").title(),
                    "price": price,
                    "stock_quantity": max(0, int(item.get("stock") or 0)),
                    "rating": max(0, min(5, float(item.get("rating") or 0))),
                    "is_active": True,
                    "specifications": specifications,
                    "tags": tags,
                    "source_name": "DummyJSON",
                    "source_url": DUMMYJSON_URL,
                    "source_license": "MIT",
                    "is_demo": True,
                },
            )
            count += 1
        return count
