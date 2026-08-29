from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.merchants.embeddings import catalog_text_embedding
from apps.merchants.models import Merchant, Product, ProductEmbedding

from .rebuild_unique_production_catalog import IMPORTED_SOURCES


SOURCE_NAME = "Curated real product replacement catalog"
SOURCE_LICENSE = "Product facts: manufacturer; image: Wikimedia Commons per-file license"
FIXTURE_SOURCES = (
    "Nexora deterministic demo fixture",
    "Nexora Track Demo Catalog",
    "Nexora P03 deterministic evidence",
)

BRAND_URLS = {
    "Acer": "https://www.acer.com/",
    "Anker": "https://www.anker.com/",
    "Anglepoise": "https://www.anglepoise.com/",
    "Apple": "https://www.apple.com/",
    "ASUS": "https://www.asus.com/",
    "Audio-Technica": "https://www.audio-technica.com/",
    "Baseus": "https://www.baseus.com/",
    "Beats": "https://www.beatsbydre.com/",
    "Belkin": "https://www.belkin.com/",
    "Bellroy": "https://bellroy.com/",
    "BenQ": "https://www.benq.com/",
    "Bose": "https://www.bose.com/",
    "Corsair": "https://www.corsair.com/",
    "Cuktech": "https://cuktech.com/",
    "Dell": "https://www.dell.com/",
    "Dyson": "https://www.dyson.com/",
    "Elgato": "https://www.elgato.com/",
    "Fjallraven": "https://www.fjallraven.com/",
    "Gigabyte": "https://www.gigabyte.com/",
    "Glorious": "https://www.gloriousgaming.com/",
    "Griffin": "https://griffintechnology.com/",
    "Herman Miller": "https://www.hermanmiller.com/",
    "Herschel": "https://herschel.com/",
    "HP": "https://www.hp.com/",
    "Hyper": "https://www.hypershop.com/",
    "HyperX": "https://hyperx.com/",
    "Humanscale": "https://www.humanscale.com/",
    "IKEA": "https://www.ikea.com/",
    "Insta360": "https://www.insta360.com/",
    "JBL": "https://www.jbl.com/",
    "Kensington": "https://www.kensington.com/",
    "Keychron": "https://www.keychron.com/",
    "Lamicall": "https://lamicall.com/",
    "Lenovo": "https://www.lenovo.com/",
    "LG": "https://www.lg.com/",
    "Logitech": "https://www.logitech.com/",
    "Marshall": "https://www.marshall.com/",
    "Microsoft": "https://www.microsoft.com/",
    "MOFT": "https://www.moft.us/",
    "MSI": "https://www.msi.com/",
    "Nexstand": "https://nexstand.io/",
    "Nulaxy": "https://nulaxy.com/",
    "OtterBox": "https://www.otterbox.com/",
    "Peak Design": "https://www.peakdesign.com/",
    "Philips Hue": "https://www.philips-hue.com/",
    "Rain Design": "https://www.raindesigninc.com/",
    "Razer": "https://www.razer.com/",
    "Roost": "https://www.therooststand.com/",
    "Samsung": "https://www.samsung.com/",
    "Samsonite": "https://www.samsonite.com/",
    "Satechi": "https://satechi.net/",
    "Sennheiser": "https://www.sennheiser-hearing.com/",
    "Sony": "https://www.sony.com/",
    "SteelSeries": "https://steelseries.com/",
    "Targus": "https://us.targus.com/",
    "Thule": "https://www.thule.com/",
    "Timbuk2": "https://www.timbuk2.com/",
    "TP-Link": "https://www.tp-link.com/",
    "Twelve South": "https://www.twelvesouth.com/",
    "UGREEN": "https://www.ugreen.com/",
    "ViewSonic": "https://www.viewsonic.com/",
    "Xiaomi": "https://www.mi.com/",
    "Zendure": "https://zendure.com/",
}

IMAGE_ASSETS = {
    "Desk Lamps": (
        "https://upload.wikimedia.org/wikipedia/commons/7/71/Concise_bamboo_eye_protection_LED_desk_lamp.jpg",
        "https://commons.wikimedia.org/wiki/File:Concise_bamboo_eye_protection_LED_desk_lamp.jpg",
    ),
    "Headphones": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Huawei_headphones_%2854260659872%29.jpg/960px-Huawei_headphones_%2854260659872%29.jpg",
        "https://commons.wikimedia.org/wiki/File:Huawei_headphones_(54260659872).jpg",
    ),
    "Keyboard Accessories": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Hand_auflage_pad_pillow.jpg/960px-Hand_auflage_pad_pillow.jpg",
        "https://commons.wikimedia.org/wiki/File:Hand_auflage_pad_pillow.jpg",
    ),
    "Keyboards": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Backlit_keyboard.jpg/960px-Backlit_keyboard.jpg",
        "https://commons.wikimedia.org/wiki/File:Backlit_keyboard.jpg",
    ),
    "Mechanical Keyboards": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Backlit_keyboard.jpg/960px-Backlit_keyboard.jpg",
        "https://commons.wikimedia.org/wiki/File:Backlit_keyboard.jpg",
    ),
    "Laptop Backpacks": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Laptop_backpacks_from_Mr._DIY_at_Ayala_Center_Cebu_%282025-02-24%29.jpg/960px-Laptop_backpacks_from_Mr._DIY_at_Ayala_Center_Cebu_%282025-02-24%29.jpg",
        "https://commons.wikimedia.org/wiki/File:Laptop_backpacks_from_Mr._DIY_at_Ayala_Center_Cebu_(2025-02-24).jpg",
    ),
    "Laptop Stands": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Laptop_and_monitor_on_a_stands.jpg/960px-Laptop_and_monitor_on_a_stands.jpg",
        "https://commons.wikimedia.org/wiki/File:Laptop_and_monitor_on_a_stands.jpg",
    ),
    "Mice": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Wireless_mouse_logi.jpg/960px-Wireless_mouse_logi.jpg",
        "https://commons.wikimedia.org/wiki/File:Wireless_mouse_logi.jpg",
    ),
    "Monitors": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/EIZO_Foris_FG2421_VGA_computer_monitor_displaying_test_pattern.png/960px-EIZO_Foris_FG2421_VGA_computer_monitor_displaying_test_pattern.png",
        "https://commons.wikimedia.org/wiki/File:EIZO_Foris_FG2421_VGA_computer_monitor_displaying_test_pattern.png",
    ),
    "Power Banks": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Portable_power_bank.jpg/960px-Portable_power_bank.jpg",
        "https://commons.wikimedia.org/wiki/File:Portable_power_bank.jpg",
    ),
    "USB Hubs": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/USB_HUB_2.0.jpg/960px-USB_HUB_2.0.jpg",
        "https://commons.wikimedia.org/wiki/File:USB_HUB_2.0.jpg",
    ),
    "Webcams": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Logitech_Webcam.png/960px-Logitech_Webcam.png",
        "https://commons.wikimedia.org/wiki/File:Logitech_Webcam.png",
    ),
}


def _items(category, entries):
    return [
        {"category": category, "title": title, "brand": brand, "model": model}
        for title, brand, model in entries
    ]


REPLACEMENTS = [
    *_items("Keyboards", [
        ("Logitech K120 Wired Keyboard", "Logitech", "K120"),
        ("Logitech K380 Multi-Device Bluetooth Keyboard", "Logitech", "K380"),
        ("Logitech MX Keys S Wireless Keyboard", "Logitech", "MX Keys S"),
        ("Logitech G915 TKL Wireless Mechanical Keyboard", "Logitech", "G915 TKL"),
        ("Keychron Q1 Pro QMK Wireless Mechanical Keyboard", "Keychron", "Q1 Pro"),
        ("Razer BlackWidow V4 75% Mechanical Keyboard", "Razer", "BlackWidow V4 75%"),
        ("Corsair K70 RGB PRO Mechanical Gaming Keyboard", "Corsair", "K70 RGB PRO"),
        ("SteelSeries Apex Pro TKL Wireless Keyboard", "SteelSeries", "Apex Pro TKL Wireless"),
        ("Apple Magic Keyboard with Touch ID", "Apple", "Magic Keyboard with Touch ID"),
        ("Microsoft Surface Keyboard", "Microsoft", "Surface Keyboard"),
        ("Dell KB216 Multimedia Keyboard", "Dell", "KB216"),
        ("HP 230 Wireless Keyboard", "HP", "230 Wireless Keyboard"),
        ("ASUS ROG Azoth Wireless Mechanical Keyboard", "ASUS", "ROG Azoth"),
        ("Keychron V1 Max QMK Wireless Mechanical Keyboard", "Keychron", "V1 Max"),
    ]),
    *_items("Keyboard Accessories", [
        ("Glorious Gaming Wooden Keyboard Wrist Rest", "Glorious", "Wooden Wrist Rest"),
        ("Keychron Keyboard Carrying Case", "Keychron", "Keyboard Carrying Case"),
        ("Logitech Desk Mat Studio Series", "Logitech", "Desk Mat Studio Series"),
    ]),
    *_items("Mice", [
        ("Logitech MX Master 3S Wireless Mouse", "Logitech", "MX Master 3S"),
        ("Logitech G PRO X SUPERLIGHT 2 Mouse", "Logitech", "G PRO X SUPERLIGHT 2"),
        ("Logitech Pebble Mouse 2 M350s", "Logitech", "Pebble Mouse 2 M350s"),
        ("Razer DeathAdder V3 Gaming Mouse", "Razer", "DeathAdder V3"),
        ("Razer Basilisk V3 Gaming Mouse", "Razer", "Basilisk V3"),
        ("SteelSeries Aerox 3 Wireless Mouse", "SteelSeries", "Aerox 3 Wireless"),
        ("Apple Magic Mouse", "Apple", "Magic Mouse"),
        ("Microsoft Surface Arc Mouse", "Microsoft", "Surface Arc Mouse"),
        ("Corsair M65 RGB ULTRA Gaming Mouse", "Corsair", "M65 RGB ULTRA"),
        ("Dell MS116 Optical Mouse", "Dell", "MS116"),
    ]),
    *_items("Headphones", [
        ("Sony WH-1000XM5 Wireless Headphones", "Sony", "WH-1000XM5"),
        ("Bose QuietComfort Ultra Headphones", "Bose", "QuietComfort Ultra"),
        ("Apple AirPods Max", "Apple", "AirPods Max"),
        ("Sennheiser MOMENTUM 4 Wireless", "Sennheiser", "MOMENTUM 4 Wireless"),
        ("Audio-Technica ATH-M50x Headphones", "Audio-Technica", "ATH-M50x"),
        ("JBL Tune 770NC Wireless Headphones", "JBL", "Tune 770NC"),
        ("Sony MDR-7506 Professional Headphones", "Sony", "MDR-7506"),
        ("Beats Studio Pro Wireless Headphones", "Beats", "Studio Pro"),
        ("Marshall Major V Headphones", "Marshall", "Major V"),
        ("HyperX Cloud III Gaming Headset", "HyperX", "Cloud III"),
    ]),
    *_items("Monitors", [
        ("Dell UltraSharp U2723QE 27-inch 4K Monitor", "Dell", "U2723QE"),
        ("LG UltraGear 27GP850-B Gaming Monitor", "LG", "27GP850-B"),
        ("Samsung Odyssey G7 32-inch Gaming Monitor", "Samsung", "Odyssey G7 32-inch"),
        ("ASUS ProArt Display PA278CV", "ASUS", "PA278CV"),
        ("BenQ PD2725U 27-inch 4K Monitor", "BenQ", "PD2725U"),
        ("Acer Nitro XV272U Gaming Monitor", "Acer", "XV272U"),
        ("Apple Studio Display", "Apple", "Studio Display"),
        ("Gigabyte M27Q Gaming Monitor", "Gigabyte", "M27Q"),
        ("MSI Optix MAG274QRF-QD Monitor", "MSI", "MAG274QRF-QD"),
        ("ViewSonic ColorPro VP2768a-4K Monitor", "ViewSonic", "VP2768a-4K"),
    ]),
    *_items("Webcams", [
        ("Logitech C920s HD Pro Webcam", "Logitech", "C920s"),
        ("Logitech Brio 4K Webcam", "Logitech", "Brio 4K"),
        ("Logitech Brio 500 Webcam", "Logitech", "Brio 500"),
        ("Razer Kiyo Pro Webcam", "Razer", "Kiyo Pro"),
        ("Elgato Facecam", "Elgato", "Facecam"),
        ("Microsoft Modern Webcam", "Microsoft", "Modern Webcam"),
        ("Dell UltraSharp Webcam WB7022", "Dell", "WB7022"),
        ("HP 960 4K Streaming Webcam", "HP", "960 4K Streaming Webcam"),
        ("Anker PowerConf C200 Webcam", "Anker", "PowerConf C200"),
        ("Insta360 Link 4K Webcam", "Insta360", "Link"),
    ]),
    *_items("USB Hubs", [
        ("Anker 341 USB-C Hub 7-in-1", "Anker", "341 USB-C Hub"),
        ("Anker 555 USB-C Hub 8-in-1", "Anker", "555 USB-C Hub"),
        ("Belkin USB-C 7-in-1 Multiport Hub", "Belkin", "USB-C 7-in-1 Multiport Hub"),
        ("Satechi Aluminum Multi-Port Adapter V2", "Satechi", "Aluminum Multi-Port Adapter V2"),
        ("UGREEN Revodok 105 USB-C Hub", "UGREEN", "Revodok 105"),
        ("HyperDrive Next 10 Port USB-C Hub", "Hyper", "HyperDrive Next 10 Port"),
        ("Dell 7-in-1 USB-C Multiport Adapter DA310", "Dell", "DA310"),
        ("Lenovo USB-C 7-in-1 Hub", "Lenovo", "USB-C 7-in-1 Hub"),
        ("TP-Link UH720 USB 3.0 Hub", "TP-Link", "UH720"),
        ("Targus USB-C Dual HDMI 4K Docking Station ACA952", "Targus", "ACA952"),
    ]),
    *_items("Laptop Stands", [
        ("Rain Design mStand Laptop Stand", "Rain Design", "mStand"),
        ("Twelve South Curve Laptop Stand", "Twelve South", "Curve"),
        ("Roost V3 Laptop Stand", "Roost", "V3"),
        ("Nexstand K2 Laptop Stand", "Nexstand", "K2"),
        ("MOFT Invisible Laptop Stand", "MOFT", "Invisible Laptop Stand"),
        ("Kensington SmartFit Easy Riser Laptop Stand", "Kensington", "SmartFit Easy Riser"),
        ("Griffin Elevator Laptop Stand", "Griffin", "Elevator"),
        ("Lamicall Adjustable Laptop Stand", "Lamicall", "Adjustable Laptop Stand"),
        ("Nulaxy C3 Laptop Stand", "Nulaxy", "C3"),
        ("Satechi Dual Vertical Laptop Stand", "Satechi", "Dual Vertical Stand"),
    ]),
    *_items("Power Banks", [
        ("Anker 737 Power Bank", "Anker", "737 Power Bank"),
        ("Anker 325 Power Bank", "Anker", "325 Power Bank"),
        ("UGREEN 145W Power Bank 25000mAh", "UGREEN", "145W 25000mAh"),
        ("Belkin BoostCharge Power Bank 20K", "Belkin", "BoostCharge 20K"),
        ("Xiaomi 50W Power Bank 20000mAh", "Xiaomi", "50W 20000mAh"),
        ("Samsung Battery Pack 20000mAh", "Samsung", "20000mAh Battery Pack"),
        ("Baseus Blade 100W Power Bank", "Baseus", "Blade 100W"),
        ("Zendure SuperTank Pro Power Bank", "Zendure", "SuperTank Pro"),
        ("OtterBox Fast Charge Power Bank 20000mAh", "OtterBox", "Fast Charge 20000mAh"),
        ("Cuktech 20 Power Bank", "Cuktech", "20 Power Bank"),
    ]),
    *_items("Desk Lamps", [
        ("BenQ e-Reading LED Desk Lamp", "BenQ", "e-Reading Desk Lamp"),
        ("Dyson Solarcycle Morph Desk Light", "Dyson", "Solarcycle Morph"),
        ("Philips Hue Signe Gradient Table Lamp", "Philips Hue", "Signe Gradient Table Lamp"),
        ("Xiaomi Mi Smart LED Desk Lamp 1S", "Xiaomi", "Mi Smart LED Desk Lamp 1S"),
        ("Anglepoise Type 75 Desk Lamp", "Anglepoise", "Type 75"),
        ("IKEA TERTIAL Work Lamp", "IKEA", "TERTIAL"),
        ("IKEA RANARP Work Lamp", "IKEA", "RANARP"),
        ("Herman Miller Ode Desk Lamp", "Herman Miller", "Ode"),
        ("Humanscale Nova Task Light", "Humanscale", "Nova"),
        ("Logitech Litra Beam LED Light", "Logitech", "Litra Beam"),
    ]),
    *_items("Laptop Backpacks", [
        ("Peak Design Everyday Backpack 20L", "Peak Design", "Everyday Backpack 20L"),
        ("Bellroy Transit Workpack", "Bellroy", "Transit Workpack"),
        ("Timbuk2 Authority Laptop Backpack Deluxe", "Timbuk2", "Authority Deluxe"),
        ("Samsonite Tectonic Lifestyle Crossfire Business Backpack", "Samsonite", "Tectonic Lifestyle Crossfire"),
        ("Thule Subterra 2 Backpack 27L", "Thule", "Subterra 2 27L"),
        ("Herschel Kaslo Daypack Tech", "Herschel", "Kaslo Daypack Tech"),
        ("Fjallraven Kanken Laptop 15 Backpack", "Fjallraven", "Kanken Laptop 15"),
        ("Targus CitySmart Advanced 15.6-inch Backpack", "Targus", "CitySmart Advanced"),
        ("Lenovo Legion Active Gaming Backpack", "Lenovo", "Legion Active Gaming Backpack"),
        ("HP Renew Business 17.3-inch Laptop Backpack", "HP", "Renew Business 17.3-inch"),
    ]),
]

KEYBOARD_FACTS = {
    "Logitech K120 Wired Keyboard": ("Full-size", ["USB"], "Membrane", False),
    "Logitech K380 Multi-Device Bluetooth Keyboard": ("Compact", ["Bluetooth"], "Scissor", False),
    "Logitech MX Keys S Wireless Keyboard": ("Full-size", ["Bluetooth", "Logi Bolt"], "Scissor", False),
    "Logitech G915 TKL Wireless Mechanical Keyboard": ("TKL", ["LIGHTSPEED", "Bluetooth", "USB"], "Low-profile mechanical", False),
    "Keychron Q1 Pro QMK Wireless Mechanical Keyboard": ("75%", ["Bluetooth", "USB-C"], "Mechanical", True),
    "Razer BlackWidow V4 75% Mechanical Keyboard": ("75%", ["USB-C"], "Mechanical", True),
    "Corsair K70 RGB PRO Mechanical Gaming Keyboard": ("Full-size", ["USB"], "Mechanical", False),
    "SteelSeries Apex Pro TKL Wireless Keyboard": ("TKL", ["2.4 GHz", "Bluetooth", "USB-C"], "Adjustable magnetic", False),
    "Apple Magic Keyboard with Touch ID": ("Compact", ["Bluetooth", "USB-C"], "Scissor", False),
    "Microsoft Surface Keyboard": ("Full-size", ["Bluetooth"], "Scissor", False),
    "Dell KB216 Multimedia Keyboard": ("Full-size", ["USB"], "Membrane", False),
    "HP 230 Wireless Keyboard": ("Full-size", ["2.4 GHz wireless"], "Membrane", False),
    "ASUS ROG Azoth Wireless Mechanical Keyboard": ("75%", ["2.4 GHz", "Bluetooth", "USB"], "Mechanical", True),
    "Keychron V1 Max QMK Wireless Mechanical Keyboard": ("75%", ["2.4 GHz", "Bluetooth", "USB-C"], "Mechanical", True),
}


def target_queryset():
    return Product.objects.filter(
        Q(source_name__in=FIXTURE_SOURCES)
        | Q(source_name="", title="Keychron K2 Pro Wireless Mechanical Keyboard"),
        is_active=True,
    ).exclude(merchant__name__iexact="Webhook proof buyer")


class Command(BaseCommand):
    help = "Replace old invented production fixtures with real products and licensed images."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--verify-only", action="store_true")

    def handle(self, *args, **options):
        database_name = connection.settings_dict.get("NAME", "")
        database_host = connection.settings_dict.get("HOST", "")
        if database_name.lower().startswith("test_"):
            raise CommandError("Refusing to modify a test database.")
        if options["apply"] and (database_name != "neondb" or "neon.tech" not in database_host):
            raise CommandError("--apply is restricted to the production Neon database named neondb.")
        if options["apply"] and options["verify_only"]:
            raise CommandError("Choose either --apply or --verify-only.")
        if options["verify_only"]:
            self._verify()
            return

        targets = list(target_queryset().order_by("category", "id"))
        if not targets and Product.objects.filter(
            source_name=SOURCE_NAME, is_active=True
        ).exclude(merchant__name__iexact="Webhook proof buyer").count() == 108:
            self.stdout.write("The fixture replacement is already applied.")
            self._verify()
            return
        replacement_counts = Counter(item["category"] for item in REPLACEMENTS)
        target_counts = Counter(product.category for product in targets if product.category != "Mechanical Keyboards")
        self.stdout.write(f"Target: {database_name} on {'.'.join(database_host.split('.')[-3:])}")
        self.stdout.write(f"Fixture replacements: {sum(target_counts.values())}; image-only repairs: {len(targets) - sum(target_counts.values())}.")
        if target_counts != replacement_counts:
            raise CommandError(f"Category plan mismatch: targets={target_counts}, replacements={replacement_counts}.")
        self._validate_plan(targets)
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply after review."))
            return

        by_category = {}
        for replacement in REPLACEMENTS:
            by_category.setdefault(replacement["category"], []).append(replacement)
        updated = []
        with transaction.atomic():
            for product in targets:
                if product.category == "Mechanical Keyboards":
                    replacement = {
                        "title": product.title,
                        "brand": "Keychron",
                        "model": "K2 Pro",
                        "category": product.category,
                    }
                else:
                    replacement = by_category[product.category].pop(0)
                self._apply_replacement(product, replacement)
                product.full_clean()
                updated.append(product)
            Product.objects.bulk_update(
                updated,
                fields=[
                    "title", "description", "image_url", "specifications", "tags",
                    "source_name", "source_url", "source_license", "is_demo", "updated_at",
                ],
                batch_size=100,
            )
            now = timezone.now()
            embeddings = [
                ProductEmbedding(
                    product_id=product.pk,
                    embedding=catalog_text_embedding(
                        product.title, product.description, product.category,
                        product.specifications, product.tags,
                    ),
                    updated_at=now,
                )
                for product in updated
            ]
            ProductEmbedding.objects.bulk_create(
                embeddings,
                batch_size=100,
                update_conflicts=True,
                update_fields=["embedding", "updated_at"],
                unique_fields=["product"],
            )
        self.stdout.write(self.style.SUCCESS(f"Replaced or repaired {len(updated)} production products."))
        self._verify()

    def _validate_plan(self, targets):
        titles = [item["title"] for item in REPLACEMENTS]
        if len(titles) != len(set(title.casefold() for title in titles)):
            raise CommandError("Replacement titles are not unique.")
        target_ids = [product.pk for product in targets]
        collisions = Product.objects.filter(is_active=True, title__in=titles).exclude(pk__in=target_ids)
        if collisions.exists():
            raise CommandError(f"Replacement title already exists: {collisions.first().title}.")
        for item in REPLACEMENTS:
            if item["brand"] not in BRAND_URLS or item["category"] not in IMAGE_ASSETS:
                raise CommandError(f"Incomplete source data for {item['title']}.")

    def _apply_replacement(self, product, replacement):
        image_url, image_source_url = IMAGE_ASSETS[replacement["category"]]
        product.title = replacement["title"]
        product.description = (
            f"{replacement['brand']} {replacement['model']} is a real {replacement['category'].lower()} "
            "model. The displayed INR amount is a bounded Razorpay test-mode catalog price; "
            "confirm current manufacturer specifications before purchase."
        )
        product.image_url = image_url
        product.specifications = {
            "brand": replacement["brand"],
            "model": replacement["model"],
            "product_type": replacement["category"],
            "image_source_url": image_source_url,
            "image_note": "Category-representative Wikimedia Commons image; it may not show the exact model.",
            "shipping_information": "Availability is confirmed again before checkout.",
            "return_policy": "See merchant terms before approval.",
        }
        if replacement["title"] in KEYBOARD_FACTS:
            layout, connectivity, switch_type, hot_swappable = KEYBOARD_FACTS[replacement["title"]]
            product.specifications.update({
                "layout": layout,
                "connectivity": connectivity,
                "switches": switch_type,
                "hot_swappable": hot_swappable,
            })
        elif replacement["model"] == "K2 Pro":
            product.specifications.update({
                "layout": "75%",
                "connectivity": ["Bluetooth", "USB-C"],
                "switches": "Mechanical",
                "hot_swappable": True,
            })
        product.tags = list(dict.fromkeys([
            replacement["category"].lower(),
            replacement["brand"].lower(),
            replacement["model"].lower(),
            "real product",
        ]))
        product.source_name = SOURCE_NAME
        product.source_url = BRAND_URLS[replacement["brand"]]
        product.source_license = SOURCE_LICENSE
        product.is_demo = True
        product.updated_at = timezone.now()

    def _verify(self):
        active = Product.objects.filter(is_active=True).exclude(
            merchant__name__iexact="Webhook proof buyer"
        )
        unresolved = active.filter(
            Q(source_name__in=FIXTURE_SOURCES)
            | Q(image_url="")
            | Q(image_url__icontains="placeholder")
        )
        duplicate_titles = active.values("title").annotate(copies=Count("id")).filter(copies__gt=1)
        if unresolved.exists():
            raise CommandError(f"Verification failed: {unresolved.count()} unresolved listings remain.")
        if duplicate_titles.exists():
            raise CommandError("Verification failed: active product titles are not globally unique.")
        replacement_count = active.filter(source_name=SOURCE_NAME).count()
        if replacement_count != 108:
            raise CommandError(f"Verification failed: expected 108 repaired listings, found {replacement_count}.")
        if active.filter(source_name=SOURCE_NAME).exclude(image_url__startswith="https://").exists():
            raise CommandError("Verification failed: a repaired listing lacks an HTTPS image.")
        for merchant in Merchant.objects.filter(owner__is_active=True).exclude(name__iexact="Webhook proof buyer"):
            catalog = active.filter(merchant=merchant, stock_quantity__gt=0)
            total = catalog.count()
            offers = catalog.filter(compare_at_price__isnull=False).count()
            self.stdout.write(
                f"Verified merchant {merchant.id}: {total} active products, {offers / total:.1%} offered."
            )
        self.stdout.write(self.style.SUCCESS("Verified 108 real-name, image-backed fixture replacements."))
