from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.merchants.embeddings import catalog_text_embedding
from apps.merchants.models import Product, ProductEmbedding

from .rebuild_unique_production_catalog import UNIQUE_SOURCE


def _clean(value):
    return " ".join(str(value or "").replace("·", " ").split())


def english_catalog_title(product, used_titles):
    """Build an English, useful title from the catalog's structured source fields."""
    specifications = product.specifications or {}
    brand = _clean(specifications.get("brand")) or "Nexora"
    category = _clean(product.category.split("·")[-1]) or "Catalog Product"
    quantity = _clean(specifications.get("quantity"))
    pieces = [brand]
    if category.casefold() not in brand.casefold():
        pieces.append(category)
    if quantity and quantity.casefold() not in " ".join(pieces).casefold():
        pieces.append(quantity)
    title = " · ".join(pieces)[:255]
    if title.casefold() in used_titles:
        barcode = _clean(specifications.get("barcode")) or str(product.pk)
        title = f"{title[:238]} · {barcode[-12:]}"
    used_titles.add(title.casefold())
    return title


class Command(BaseCommand):
    help = (
        "Preview or replace Open Food Facts source-language names with English "
        "brand/category/quantity titles. Defaults to dry-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        database_name = connection.settings_dict.get("NAME", "")
        database_host = connection.settings_dict.get("HOST", "")
        if database_name.lower().startswith("test_"):
            raise CommandError("Refusing to modify a test database.")
        if options["apply"] and (
            database_name != "neondb" or "neon.tech" not in database_host
        ):
            raise CommandError(
                "--apply is restricted to the production Neon database named neondb."
            )

        products = list(
            Product.objects.filter(source_name=UNIQUE_SOURCE).order_by("id")
        )
        if not products:
            self.stdout.write(self.style.WARNING("No unique Open Food Facts products found."))
            return
        target_ids = [product.pk for product in products]
        used_titles = {
            title.casefold()
            for title in Product.objects.exclude(pk__in=target_ids).values_list(
                "title", flat=True
            )
        }
        changed = []
        for product in products:
            title = english_catalog_title(product, used_titles)
            if title == product.title:
                continue
            product.title = title
            product.description = (
                f"{title}. Source barcode {product.specifications.get('barcode', 'not stated')}. "
                "Availability and price are confirmed again before checkout."
            )
            product.updated_at = timezone.now()
            changed.append(product)

        self.stdout.write(
            f"English catalog normalization: {len(changed)}/{len(products)} titles would change."
        )
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply after review."))
            return

        embedding_table_available = (
            ProductEmbedding._meta.db_table in connection.introspection.table_names()
        )
        with transaction.atomic():
            Product.objects.bulk_update(
                changed,
                fields=["title", "description", "updated_at"],
                batch_size=200,
            )
            now = timezone.now()
            embeddings = [
                ProductEmbedding(
                    product_id=product.pk,
                    embedding=catalog_text_embedding(
                        product.title,
                        product.description,
                        product.category,
                        product.specifications,
                        product.tags,
                    ),
                    updated_at=now,
                )
                for product in changed
            ]
            if embeddings and embedding_table_available:
                ProductEmbedding.objects.bulk_create(
                    embeddings,
                    batch_size=200,
                    update_conflicts=True,
                    update_fields=["embedding", "updated_at"],
                    unique_fields=["product"],
                )
        self.stdout.write(self.style.SUCCESS(f"Normalized {len(changed)} catalog titles to English."))
        if changed and not embedding_table_available:
            self.stdout.write(
                self.style.WARNING(
                    "The optional vector table is unavailable; SQL catalog search remains active."
                )
            )
