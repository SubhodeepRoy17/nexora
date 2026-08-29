import json
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from math import floor

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count, Q

from apps.merchants.models import Merchant, Product

from .seed_open_catalog import (
    DUMMYJSON_COMMIT,
    DUMMYJSON_LICENSE_URL,
    DUMMYJSON_URL,
    INR_PER_USD,
    _warranty_months,
)


def _money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class Command(BaseCommand):
    help = (
        "Preview or idempotently sync the pinned, licensed broad demo catalog to every "
        "active production merchant. Refuses test databases and defaults to dry-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Apply the previewed changes.")
        parser.add_argument("--verify-only", action="store_true", help="Verify the current production sync without writing.")
        parser.add_argument("--limit", type=int, default=0, help="Optional per-merchant cap; 0 imports all eligible products.")

    def handle(self, *args, **options):
        database_name = connection.settings_dict.get("NAME", "")
        database_host = connection.settings_dict.get("HOST", "")
        if database_name.lower().startswith("test_"):
            raise CommandError("Refusing to sync a test database.")
        if options["apply"] and (database_name != "neondb" or "neon.tech" not in database_host):
            raise CommandError("--apply is restricted to the production Neon database named neondb.")
        if options["apply"] and options["verify_only"]:
            raise CommandError("Choose either --apply or --verify-only.")

        merchants = list(
            Merchant.objects.filter(owner__is_active=True)
            .exclude(name__iexact="Webhook proof buyer")
            .order_by("id")
        )
        if not merchants:
            raise CommandError("No active merchant owners were found.")
        source_products = self._download()
        eligible = self._eligible_products(source_products, options["limit"])
        if not eligible:
            raise CommandError("No checkout-eligible products were found in the pinned source.")
        offer_targets = {}
        for merchant in merchants:
            other_products = Product.objects.filter(merchant=merchant).exclude(
                source_name="DummyJSON pinned demo catalog"
            )
            other_count = other_products.count()
            other_offers = other_products.filter(compare_at_price__isnull=False).count()
            target_total_offers = floor((other_count + len(eligible)) * 0.6 + 0.5)
            offer_targets[merchant.id] = max(
                0, min(len(eligible), target_total_offers - other_offers)
            )
        existing = {
            merchant.id: Product.objects.filter(merchant=merchant).count()
            for merchant in merchants
        }
        self.stdout.write(
            f"Target: {database_name} on {'.'.join(database_host.split('.')[-3:]) or 'local'}"
        )
        self.stdout.write(
            f"Pinned source: DummyJSON {DUMMYJSON_COMMIT}; {len(eligible)} eligible products."
        )
        for merchant in merchants:
            self.stdout.write(
                f"Merchant {merchant.id}: {merchant.name} — {existing[merchant.id]} existing, "
                f"up to {len(eligible)} catalog rows created or refreshed; "
                f"{offer_targets[merchant.id]} source offers target a 60% total-inventory ratio."
            )
        if options["verify_only"]:
            self._verify(merchants, len(eligible), offer_targets)
            return
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply after reviewing this preview."))
            return

        with transaction.atomic():
            for merchant in merchants:
                source_titles = [item["title"] for item in eligible]
                existing_products = {
                    product.title: product
                    for product in Product.objects.filter(
                        merchant=merchant,
                        title__in=source_titles,
                        source_name="DummyJSON pinned demo catalog",
                    ).order_by("id")
                }
                created = []
                updated = []
                for index, item in enumerate(eligible):
                    values = self._product_values(
                        item, has_offer=index < offer_targets[merchant.id]
                    )
                    product = existing_products.get(item["title"])
                    if product is None:
                        product = Product(merchant=merchant, title=item["title"], **values)
                        created.append(product)
                    else:
                        for field, value in values.items():
                            setattr(product, field, value)
                        updated.append(product)
                    # The merchant was resolved once above; excluding the FK avoids one
                    # remote existence query for every catalog row.
                    product.full_clean(exclude=["merchant"])
                Product.objects.bulk_create(created, batch_size=200)
                if updated:
                    Product.objects.bulk_update(
                        updated,
                        fields=list(self._product_values(eligible[0], has_offer=True)),
                        batch_size=200,
                    )
        self.stdout.write(
            self.style.SUCCESS(
                f"Synced {len(eligible)} source products to {len(merchants)} active merchants; "
                "each inventory now targets a 60% source-backed offer ratio."
            )
        )
        self._verify(merchants, len(eligible), offer_targets)

    def _verify(self, merchants, expected_products, offer_targets):
        rows = Product.objects.filter(
            merchant__in=merchants,
            source_name="DummyJSON pinned demo catalog",
        ).values("merchant_id", "merchant__name").annotate(
            products=Count("id"),
            offers=Count("id", filter=Q(compare_at_price__isnull=False)),
            images=Count("id", filter=~Q(image_url="")),
        ).order_by("merchant_id")
        if len(rows) != len(merchants):
            raise CommandError("Verification failed: one or more active merchants have no synced catalog.")
        for row in rows:
            merchant_total = Product.objects.filter(merchant_id=row["merchant_id"]).count()
            merchant_offers = Product.objects.filter(
                merchant_id=row["merchant_id"], compare_at_price__isnull=False
            ).count()
            expected_total_offers = floor(merchant_total * 0.6 + 0.5)
            if row["products"] != expected_products or row["images"] != expected_products:
                raise CommandError(f"Verification failed for merchant {row['merchant_id']}: {row}")
            if merchant_offers != expected_total_offers:
                raise CommandError(
                    f"Verification failed for merchant {row['merchant_id']}: "
                    f"{merchant_offers}/{merchant_total} offered, expected {expected_total_offers}."
                )
            self.stdout.write(
                f"Verified merchant {row['merchant_id']}: {row['products']} products, "
                f"{row['images']} images; {merchant_offers}/{merchant_total} total items offered "
                f"({merchant_offers / merchant_total:.1%})."
            )

    def _download(self):
        try:
            with urllib.request.urlopen(DUMMYJSON_URL, timeout=30) as response:
                payload = json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise CommandError("Unable to download the pinned catalog source.") from exc
        if not isinstance(payload, list):
            raise CommandError("Pinned catalog source has an unexpected shape.")
        return payload

    def _eligible_products(self, source_products, limit):
        eligible = []
        for item in source_products:
            price = _money(Decimal(str(item["price"])) * INR_PER_USD)
            if price <= 0 or price > settings.MONEY_MAX_ORDER_VALUE:
                continue
            if not item.get("title") or not item.get("thumbnail"):
                continue
            eligible.append(item)
        maximum = max(0, limit)
        return eligible[:maximum] if maximum else eligible

    def _product_values(self, item, *, has_offer):
        dimensions = item.get("dimensions") or {}
        price = _money(Decimal(str(item["price"])) * INR_PER_USD)
        discount = Decimal(str(item.get("discountPercentage") or 0))
        compare_at = None
        if has_offer and Decimal("0") < discount < Decimal("100"):
            compare_at = _money(price / (Decimal("1") - discount / Decimal("100")))
        specifications = {
            "brand": str(item.get("brand") or "Unbranded")[:200],
            "sku": str(item.get("sku") or f"DUMMYJSON-{item['id']}")[:200],
            "shipping_information": str(item.get("shippingInformation") or "See merchant details")[:200],
            "return_policy": str(item.get("returnPolicy") or "See merchant details")[:200],
            "warranty_months": _warranty_months(item.get("warrantyInformation")),
        }
        if all(dimensions.get(key) for key in ("width", "depth", "height")):
            specifications["dimensions"] = {
                "width_mm": float(dimensions["width"]) * 10,
                "depth_mm": float(dimensions["depth"]) * 10,
                "height_mm": float(dimensions["height"]) * 10,
                "weight_grams": max(1.0, float(item.get("weight") or 1) * 100),
            }
        tags = list(dict.fromkeys(
            str(value).strip().lower()
            for value in [item.get("category"), item.get("brand"), *(item.get("tags") or [])]
            if value
        ))[:30]
        return {
            "description": item.get("description", ""),
            "category": item["category"].replace("-", " ").title(),
            "price": price,
            "compare_at_price": compare_at,
            "image_url": item["thumbnail"],
            "stock_quantity": max(1, int(item.get("stock") or 1)),
            "rating": max(0, min(5, float(item.get("rating") or 0))),
            "is_active": True,
            "specifications": specifications,
            "tags": tags,
            "source_name": "DummyJSON pinned demo catalog",
            "source_url": DUMMYJSON_URL,
            "source_license": f"MIT ({DUMMYJSON_LICENSE_URL})",
            "is_demo": True,
        }
