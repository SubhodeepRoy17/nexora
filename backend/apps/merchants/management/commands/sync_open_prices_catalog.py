import json
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from math import floor

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count, Q

from apps.merchants.models import Merchant, Product


SOURCE_NAME = "Open Food Facts / Open Prices"
SOURCE_LICENSE = "ODbL-1.0; images CC BY-SA"
API_URL = "https://prices.openfoodfacts.org/api/v1/prices"
CATALOG_SIZE = 250
USER_AGENT = "Nexora/1.0 (https://nexora-agentic-commerce.vercel.app)"


def _money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _display_title(product):
    name = " ".join(str(product.get("product_name_en") or "").split())
    brand = " ".join(str(product.get("brands") or "").split())
    quantity = " ".join(str(product.get("quantity") or "").split())
    if brand and brand.casefold() not in name.casefold():
        name = f"{brand} {name}"
    if quantity and quantity.casefold() not in name.casefold():
        name = f"{name} · {quantity}"
    return name[:255]


class Command(BaseCommand):
    help = (
        "Preview, apply, or verify 250 image-backed INR products from Open Prices "
        "for every active production merchant. Defaults to dry-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--verify-only", action="store_true")

    def handle(self, *args, **options):
        database_name = connection.settings_dict.get("NAME", "")
        database_host = connection.settings_dict.get("HOST", "")
        if database_name.lower().startswith("test_"):
            raise CommandError("Refusing to sync a test database.")
        if options["apply"] and (database_name != "neondb" or "neon.tech" not in database_host):
            raise CommandError("--apply is restricted to the production Neon database named neondb.")
        if options["apply"] and options["verify_only"]:
            raise CommandError("Choose either --apply or --verify-only.")
        if options["apply"]:
            raise CommandError(
                "This copier is retired because it duplicates products across merchants. "
                "Use rebuild_unique_production_catalog --apply."
            )

        merchants = list(
            Merchant.objects.filter(owner__is_active=True)
            .exclude(name__iexact="Webhook proof buyer")
            .order_by("id")
        )
        if not merchants:
            raise CommandError("No active merchant owners were found.")
        products = self._download_products()
        if len(products) != CATALOG_SIZE:
            raise CommandError(f"Expected {CATALOG_SIZE} eligible products; found {len(products)}.")

        offer_targets = {}
        for merchant in merchants:
            other = Product.objects.filter(merchant=merchant).exclude(source_name=SOURCE_NAME)
            other_count = other.count()
            other_offers = other.filter(compare_at_price__isnull=False).count()
            total_after = other_count + CATALOG_SIZE
            offer_targets[merchant.id] = max(
                0,
                min(CATALOG_SIZE, floor(total_after * 0.6 + 0.5) - other_offers),
            )

        validation_offer_count = max(offer_targets.values())
        for index, row in enumerate(products):
            candidate = Product(
                merchant=merchants[0],
                **self._values(row, has_offer=index < validation_offer_count),
            )
            candidate.full_clean(exclude=["merchant"])

        self.stdout.write(
            f"Target: {database_name} on {'.'.join(database_host.split('.')[-3:]) or 'local'}"
        )
        self.stdout.write(
            f"Open Prices preview: {CATALOG_SIZE} unique INR products with names and images."
        )
        for merchant in merchants:
            current = Product.objects.filter(merchant=merchant).count()
            source_count = Product.objects.filter(
                merchant=merchant, source_name=SOURCE_NAME
            ).count()
            self.stdout.write(
                f"Merchant {merchant.id}: {merchant.name} — {current} current; "
                f"{CATALOG_SIZE - source_count} to create, {source_count} to refresh; "
                f"{offer_targets[merchant.id]} source offers."
            )
        if options["verify_only"]:
            self._verify(merchants)
            return
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply after review."))
            return

        with transaction.atomic():
            for merchant in merchants:
                existing = {
                    product.specifications.get("barcode"): product
                    for product in Product.objects.filter(
                        merchant=merchant, source_name=SOURCE_NAME
                    )
                }
                created = []
                updated = []
                for index, row in enumerate(products):
                    barcode = row["product"]["code"]
                    values = self._values(
                        row,
                        has_offer=index < offer_targets[merchant.id],
                    )
                    product = existing.get(barcode)
                    if product is None:
                        product = Product(merchant=merchant, **values)
                        created.append(product)
                    else:
                        for field, value in values.items():
                            setattr(product, field, value)
                        updated.append(product)
                    product.full_clean(exclude=["merchant"])
                Product.objects.bulk_create(created, batch_size=200)
                if updated:
                    Product.objects.bulk_update(
                        updated,
                        fields=list(self._values(products[0], has_offer=True)),
                        batch_size=200,
                    )
        self.stdout.write(
            self.style.SUCCESS(
                f"Synced {CATALOG_SIZE} additional products to {len(merchants)} merchants."
            )
        )
        self._verify(merchants)

    def _download_products(self):
        rows = []
        page = 1
        pages = 1
        while page <= pages and page <= 20:
            query = urllib.parse.urlencode({"currency": "INR", "size": 100, "page": page})
            request = urllib.request.Request(
                f"{API_URL}?{query}", headers={"User-Agent": USER_AGENT}
            )
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = json.load(response)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise CommandError("Unable to download Open Prices data.") from exc
            rows.extend(payload.get("items") or [])
            pages = int(payload.get("pages") or 1)
            page += 1

        latest_by_code = {}
        for row in rows:
            product = row.get("product") or {}
            code = str(product.get("code") or row.get("product_code") or "").strip()
            if not (
                code
                and product.get("product_name_en")
                and product.get("image_url")
                and row.get("price")
                and row.get("currency") == "INR"
            ):
                continue
            if _money(row["price"]) <= 0 or _money(row["price"]) > settings.MONEY_MAX_ORDER_VALUE:
                continue
            current = latest_by_code.get(code)
            if current is None or (str(row.get("date") or ""), int(row.get("id") or 0)) > (
                str(current.get("date") or ""), int(current.get("id") or 0)
            ):
                latest_by_code[code] = row
        selected = [latest_by_code[code] for code in sorted(latest_by_code)[:CATALOG_SIZE]]
        titles = set()
        for row in selected:
            title = _display_title(row["product"])
            if title in titles:
                title = f"{title[:235]} · {row['product']['code']}"
            row["_nexora_title"] = title
            titles.add(title)
        return selected

    def _values(self, row, *, has_offer):
        product = row["product"]
        observed_price = _money(row["price"])
        recorded_compare = row.get("price_without_discount")
        recorded_discount = bool(
            row.get("price_is_discounted")
            and recorded_compare
            and _money(recorded_compare) > observed_price
        )
        if has_offer and recorded_discount:
            price = observed_price
            compare_at = _money(recorded_compare)
            offer_note = "Observed discounted INR price from Open Prices."
        elif has_offer:
            compare_at = observed_price
            price = _money(observed_price * Decimal("0.90"))
            offer_note = "10% Nexora merchant test-mode promotion against the observed INR price."
        else:
            price = observed_price
            compare_at = None
            offer_note = "Observed INR price; no active merchant promotion."

        categories = [tag.removeprefix("en:").replace("-", " ").title() for tag in product.get("categories_tags") or []]
        category = categories[-1] if categories else "Groceries"
        brand = str(product.get("brands") or "Unbranded").strip()[:200]
        location = row.get("location") or {}
        specifications = {
            "brand": brand,
            "sku": f"OFF-{product['code']}"[:200],
            "barcode": str(product["code"])[:200],
            "quantity": str(product.get("quantity") or "See package")[:200],
            "nutriscore": str(product.get("nutriscore_grade") or "unknown")[:200],
            "ecoscore": str(product.get("ecoscore_grade") or "unknown")[:200],
            "price_observed_on": str(row.get("date") or "unknown")[:200],
            "price_location": str(location.get("osm_display_name") or "India")[:200],
            "shipping_information": "Availability is confirmed again before checkout.",
            "return_policy": "See merchant terms for food and household products.",
        }
        raw_tags = [
            "grocery",
            category.lower(),
            brand.lower(),
            *[tag.removeprefix("en:").replace("-", " ") for tag in product.get("categories_tags") or []],
            *[tag.removeprefix("en:").replace("-", " ") for tag in product.get("labels_tags") or []],
        ]
        tags = []
        for value in raw_tags:
            clean = str(value).strip().lower()[:50]
            if clean and clean not in tags:
                tags.append(clean)
            if len(tags) == 30:
                break
        description = (
            f"{row['_nexora_title']} by {brand}, barcode {product['code']}, "
            f"package {product.get('quantity') or 'not stated'}. {offer_note}"
        )
        return {
            "title": row["_nexora_title"],
            "description": description,
            "category": f"Groceries · {category}"[:120],
            "price": price,
            "compare_at_price": compare_at,
            "image_url": product["image_url"],
            "stock_quantity": 25,
            "rating": 0,
            "is_active": True,
            "specifications": specifications,
            "tags": tags,
            "source_name": SOURCE_NAME,
            "source_url": f"{API_URL}/{row['id']}",
            "source_license": SOURCE_LICENSE,
            "is_demo": True,
        }

    def _verify(self, merchants):
        rows = Product.objects.filter(
            merchant__in=merchants, source_name=SOURCE_NAME
        ).values("merchant_id").annotate(
            products=Count("id"),
            images=Count("id", filter=~Q(image_url="")),
        ).order_by("merchant_id")
        if len(rows) != len(merchants):
            raise CommandError("Verification failed: one or more merchants have no Open Prices catalog.")
        for row in rows:
            total = Product.objects.filter(merchant_id=row["merchant_id"]).count()
            offers = Product.objects.filter(
                merchant_id=row["merchant_id"], compare_at_price__isnull=False
            ).count()
            expected_offers = floor(total * 0.6 + 0.5)
            if row["products"] != CATALOG_SIZE or row["images"] != CATALOG_SIZE:
                raise CommandError(f"Verification failed for merchant {row['merchant_id']}: {row}")
            if offers != expected_offers:
                raise CommandError(
                    f"Verification failed for merchant {row['merchant_id']}: "
                    f"{offers}/{total} offered, expected {expected_offers}."
                )
            self.stdout.write(
                f"Verified merchant {row['merchant_id']}: {row['products']} Open Prices products, "
                f"{row['images']} images, {offers}/{total} total items offered "
                f"({offers / total:.1%})."
            )
