import json
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from math import floor

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count, Q
from django.db.models.deletion import PROTECT

from apps.merchants.models import Merchant, Product


DUMMYJSON_SOURCE = "DummyJSON pinned demo catalog"
OPEN_PRICES_SOURCE = "Open Food Facts / Open Prices"
UNIQUE_SOURCE = "Open Food Facts unique merchant catalog"
IMPORTED_SOURCES = (DUMMYJSON_SOURCE, OPEN_PRICES_SOURCE, UNIQUE_SOURCE)
OFF_SEARCH_URL = "https://world.openfoodfacts.net/api/v2/search"
OFF_LICENSE = "ODbL-1.0; images CC BY-SA"
USER_AGENT = "Nexora/1.0 (https://nexora-agentic-commerce.vercel.app)"
PRODUCTS_PER_MERCHANT = 500
SEARCH_PAGE_SIZE = 100
SEARCH_COUNTRIES = (
    "France",
    "Germany",
    "Italy",
    "Spain",
    "Netherlands",
    "Belgium",
    "Switzerland",
    "Austria",
    "Canada",
    "Australia",
    "India",
    "United States",
    "United Kingdom",
)


def _money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _active_merchants():
    return list(
        Merchant.objects.filter(owner__is_active=True)
        .exclude(name__iexact="Webhook proof buyer")
        .order_by("id")
    )


def _source_key(product):
    if product.source_name == DUMMYJSON_SOURCE:
        return f"dummyjson:{product.title.casefold()}"
    return f"barcode:{(product.specifications or {}).get('barcode', product.title.casefold())}"


class Command(BaseCommand):
    help = (
        "Deduplicate imported production inventory, distribute every source product to "
        "one merchant, and maintain 500 globally unique products per active merchant."
    )

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

        merchants = _active_merchants()
        if not merchants:
            raise CommandError("No active merchant workspaces were found.")
        if options["verify_only"]:
            self._verify(merchants)
            return

        duplicate_rows = self._duplicate_row_count()
        existing_unique = Product.objects.filter(source_name=UNIQUE_SOURCE).count()
        required = PRODUCTS_PER_MERCHANT * len(merchants)
        self.stdout.write(f"Target: {database_name} on {'.'.join(database_host.split('.')[-3:])}")
        self.stdout.write(
            f"Imported duplicate rows to retire: {duplicate_rows}. Existing unique-source rows: "
            f"{existing_unique}."
        )
        self.stdout.write(
            f"Unique catalog target: {PRODUCTS_PER_MERCHANT} x {len(merchants)} = "
            f"{required}."
        )
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply after review."))
            return

        missing = max(0, required - existing_unique)
        source_rows = []
        if missing:
            excluded_barcodes = {
                str(barcode)
                for barcode in Product.objects.filter(
                    source_name__in=IMPORTED_SOURCES,
                    is_active=True,
                ).values_list("specifications__barcode", flat=True)
                if barcode
            }
            source_rows = self._download_unique_products(missing, excluded_barcodes)
            self._validate_source_rows(source_rows, merchants[0])

        with transaction.atomic():
            deleted, archived = self._deduplicate_existing(merchants)
            if source_rows:
                self._upsert_unique_products(merchants, source_rows)
            self._rebalance_offers(merchants)
        self.stdout.write(
            self.style.SUCCESS(
                f"Unique catalog rebuilt: {deleted} duplicate rows deleted, {archived} "
                "historical duplicates archived."
            )
        )
        self._verify(merchants)

    def _duplicate_row_count(self):
        total = 0
        for source in (DUMMYJSON_SOURCE, OPEN_PRICES_SOURCE):
            rows = Product.objects.filter(source_name=source, is_active=True).values("title").annotate(
                copies=Count("id")
            )
            total += sum(max(0, row["copies"] - 1) for row in rows)
        return total

    def _download_unique_products(self, required, excluded_barcodes):
        selected = {}
        for country in SEARCH_COUNTRIES:
            for page in range(1, 11):
                query = urllib.parse.urlencode(
                    {
                        "countries_tags_en": country,
                        "fields": (
                            "code,product_name,brands,quantity,image_front_small_url,"
                            "categories_tags,nutriscore_grade,ecoscore_grade"
                        ),
                        "sort_by": "unique_scans_n",
                        "page_size": SEARCH_PAGE_SIZE,
                        "page": page,
                    }
                )
                request = urllib.request.Request(
                    f"{OFF_SEARCH_URL}?{query}", headers={"User-Agent": USER_AGENT}
                )
                payload = None
                last_error = None
                for attempt in range(1, 4):
                    try:
                        with urllib.request.urlopen(request, timeout=45) as response:
                            payload = json.load(response)
                        break
                    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                        last_error = exc
                        if attempt < 3:
                            time.sleep(attempt * 4)
                if payload is None:
                    raise CommandError(
                        f"Unable to download Open Food Facts {country} page {page} after 3 attempts."
                    ) from last_error
                for product in payload.get("products") or []:
                    code = str(product.get("code") or "").strip()
                    name = " ".join(str(product.get("product_name") or "").split())
                    image_url = str(product.get("image_front_small_url") or "").strip()
                    if (
                        code
                        and name
                        and image_url
                        and code not in selected
                        and code not in excluded_barcodes
                    ):
                        selected[code] = product
                self.stdout.write(
                    f"Open Food Facts ({country}): {len(selected)}/{required} unique image-backed products."
                )
                if len(selected) >= required:
                    break
                time.sleep(6.2)
            if len(selected) >= required:
                break
        if len(selected) < required:
            raise CommandError(f"Only {len(selected)} eligible unique products were available.")
        return [selected[code] for code in sorted(selected)[:required]]

    def _title(self, product, used_titles):
        name = " ".join(str(product.get("product_name") or "").split())
        brand = " ".join(str(product.get("brands") or "").split())
        quantity = " ".join(str(product.get("quantity") or "").split())
        if brand and brand.casefold() not in name.casefold():
            name = f"{brand} {name}"
        if quantity and quantity.casefold() not in name.casefold():
            name = f"{name} · {quantity}"
        title = name[:255]
        if title.casefold() in used_titles:
            title = f"{title[:235]} · {product['code']}"
        used_titles.add(title.casefold())
        return title

    def _values(self, product, title):
        code = str(product["code"])
        numeric = int("".join(character for character in code if character.isdigit())[-9:] or "1")
        regular_price = _money(Decimal(49 + numeric % 1951))
        categories = [
            tag.removeprefix("en:").replace("-", " ").title()
            for tag in product.get("categories_tags") or []
        ]
        specific_category = categories[-1] if categories else "Food & Household"
        brand = str(product.get("brands") or "Unbranded").strip()[:200]
        raw_tags = ["grocery", specific_category, brand, *categories]
        tags = []
        for value in raw_tags:
            clean = str(value).strip().lower()[:50]
            if clean and clean not in tags:
                tags.append(clean)
            if len(tags) == 30:
                break
        specifications = {
            "brand": brand,
            "sku": f"OFF-{code}"[:200],
            "barcode": code[:200],
            "quantity": str(product.get("quantity") or "See package")[:200],
            "nutriscore": str(product.get("nutriscore_grade") or "unknown")[:200],
            "ecoscore": str(product.get("ecoscore_grade") or "unknown")[:200],
            "shipping_information": "Availability is confirmed again before checkout.",
            "return_policy": "See merchant terms for food and household products.",
        }
        return {
            "title": title,
            "description": (
                f"{product.get('product_name')} by {brand}, barcode {code}, package "
                f"{product.get('quantity') or 'not stated'}. Price is a bounded Razorpay "
                "test-mode merchant catalog price."
            ),
            "category": f"Groceries · {specific_category}"[:120],
            "price": regular_price,
            "compare_at_price": None,
            "image_url": product["image_front_small_url"],
            "stock_quantity": 5 + numeric % 46,
            "rating": 0,
            "is_active": True,
            "specifications": specifications,
            "tags": tags,
            "source_name": UNIQUE_SOURCE,
            "source_url": f"https://world.openfoodfacts.org/product/{code}",
            "source_license": OFF_LICENSE,
            "is_demo": True,
        }

    def _validate_source_rows(self, rows, merchant):
        used_titles = set(
            Product.objects.filter(source_name__in=IMPORTED_SOURCES).values_list(
                "title", flat=True
            )
        )
        used_titles = {title.casefold() for title in used_titles}
        for source in rows:
            title = self._title(source, used_titles)
            Product(merchant=merchant, **self._values(source, title)).full_clean(
                exclude=["merchant"]
            )

    def _deduplicate_existing(self, merchants):
        merchant_ids = [merchant.id for merchant in merchants]
        duplicates = []
        for source in (DUMMYJSON_SOURCE, OPEN_PRICES_SOURCE):
            products = list(
                Product.objects.filter(source_name=source, is_active=True).order_by("id")
            )
            groups = {}
            for product in products:
                groups.setdefault(_source_key(product), []).append(product)
            for index, key in enumerate(sorted(groups)):
                copies = groups[key]
                assigned_merchant_id = merchant_ids[index % len(merchant_ids)]
                keeper = next(
                    (item for item in copies if item.merchant_id == assigned_merchant_id),
                    copies[0],
                )
                if keeper.merchant_id != assigned_merchant_id:
                    keeper.merchant_id = assigned_merchant_id
                    keeper.save(update_fields=["merchant", "updated_at"])
                for duplicate in copies:
                    if duplicate.pk == keeper.pk:
                        continue
                    duplicates.append(duplicate)

        deleted, archived = self._retire_duplicates(duplicates)

        remaining = list(
            Product.objects.filter(is_active=True, stock_quantity__gt=0).order_by("id")
        )
        title_groups = {}
        for product in remaining:
            title_groups.setdefault(product.title.casefold(), []).append(product)
        title_duplicates = []
        for copies in title_groups.values():
            if len(copies) > 1:
                title_duplicates.extend(copies[1:])
        more_deleted, more_archived = self._retire_duplicates(title_duplicates)
        return deleted + more_deleted, archived + more_archived

    def _retire_duplicates(self, duplicates):
        duplicate_ids = [product.pk for product in duplicates]
        if not duplicate_ids:
            return 0, 0
        protected_ids = set()
        for relation in Product._meta.related_objects:
            if relation.on_delete is not PROTECT:
                continue
            field_name = relation.field.name
            protected_ids.update(
                relation.related_model._default_manager.filter(
                    **{f"{field_name}_id__in": duplicate_ids}
                ).values_list(f"{field_name}_id", flat=True)
            )

        deletable_ids = set(duplicate_ids) - protected_ids
        if deletable_ids:
            Product.objects.filter(pk__in=deletable_ids).delete()
        archived_products = [product for product in duplicates if product.pk in protected_ids]
        for product in archived_products:
            product.title = f"{product.title[:220]} · archived duplicate {product.pk}"
            product.is_active = False
            product.stock_quantity = 0
            product.compare_at_price = None
        if archived_products:
            Product.objects.bulk_update(
                archived_products,
                fields=["title", "is_active", "stock_quantity", "compare_at_price"],
                batch_size=200,
            )
        return len(deletable_ids), len(archived_products)

    def _upsert_unique_products(self, merchants, rows):
        existing_titles = {
            title.casefold()
            for title in Product.objects.filter(
                source_name__in=IMPORTED_SOURCES, is_active=True
            ).values_list("title", flat=True)
        }
        created = []
        source_index = 0
        for merchant in merchants:
            existing_count = Product.objects.filter(
                merchant=merchant,
                source_name=UNIQUE_SOURCE,
                is_active=True,
                stock_quantity__gt=0,
            ).count()
            for _ in range(max(0, PRODUCTS_PER_MERCHANT - existing_count)):
                source = rows[source_index]
                source_index += 1
                title = self._title(source, existing_titles)
                candidate = Product(merchant=merchant, **self._values(source, title))
                candidate.full_clean(exclude=["merchant"])
                created.append(candidate)
        if source_index != len(rows):
            raise CommandError("Downloaded product count does not match merchant deficits.")
        Product.objects.bulk_create(created, batch_size=200)

    def _rebalance_offers(self, merchants):
        for merchant in merchants:
            active = Product.objects.filter(
                merchant=merchant, is_active=True, stock_quantity__gt=0
            )
            total = active.count()
            target = floor(total * 0.6 + 0.5)
            custom_offers = active.exclude(source_name__in=IMPORTED_SOURCES).filter(
                compare_at_price__isnull=False
            ).count()
            imported = list(
                active.filter(source_name__in=IMPORTED_SOURCES).order_by(
                    "source_name", "title", "id"
                )
            )
            required = max(0, min(len(imported), target - custom_offers))
            for index, product in enumerate(imported):
                regular_price = product.compare_at_price or product.price
                if index < required:
                    product.compare_at_price = regular_price
                    product.price = _money(regular_price * Decimal("0.90"))
                else:
                    product.price = regular_price
                    product.compare_at_price = None
            Product.objects.bulk_update(
                imported, fields=["price", "compare_at_price"], batch_size=200
            )

    def _verify(self, merchants):
        active_catalog = Product.objects.filter(
            is_active=True, stock_quantity__gt=0
        )
        duplicate_titles = active_catalog.values("title").annotate(copies=Count("id")).filter(copies__gt=1)
        duplicate_barcodes = (
            active_catalog.exclude(specifications__barcode__isnull=True)
            .values("specifications__barcode")
            .annotate(copies=Count("id"))
            .filter(copies__gt=1)
        )
        if duplicate_titles.exists() or duplicate_barcodes.exists():
            raise CommandError("Verification failed: active imported products are not globally unique.")
        for merchant in merchants:
            new_products = Product.objects.filter(
                merchant=merchant,
                source_name=UNIQUE_SOURCE,
                is_active=True,
                stock_quantity__gt=0,
            )
            active = Product.objects.filter(
                merchant=merchant, is_active=True, stock_quantity__gt=0
            )
            total = active.count()
            offers = active.filter(compare_at_price__isnull=False).count()
            expected_offers = floor(total * 0.6 + 0.5)
            images = new_products.exclude(image_url="").count()
            repeated_categories = (
                active.values("category").annotate(items=Count("id")).filter(items__gte=2).count()
            )
            if new_products.count() != PRODUCTS_PER_MERCHANT or images != PRODUCTS_PER_MERCHANT:
                raise CommandError(
                    f"Merchant {merchant.id} does not have {PRODUCTS_PER_MERCHANT} "
                    "unique new products/images."
                )
            if offers != expected_offers:
                raise CommandError(
                    f"Merchant {merchant.id} offer ratio failed: {offers}/{total}, expected {expected_offers}."
                )
            if repeated_categories < 1:
                raise CommandError(f"Merchant {merchant.id} has no same-category alternatives.")
            self.stdout.write(
                f"Verified merchant {merchant.id}: {PRODUCTS_PER_MERCHANT} exclusive products/images; "
                f"{offers}/{total} active items offered ({offers / total:.1%}); "
                f"{repeated_categories} categories have alternatives."
            )
