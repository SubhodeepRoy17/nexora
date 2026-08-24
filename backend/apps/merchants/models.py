import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import DatabaseError, models
from pgvector.django import VectorField

from .embeddings import EMBEDDING_DIMENSIONS, catalog_text_embedding
from .schemas import validate_specifications, validate_tags


def generate_api_key() -> str:
    return secrets.token_urlsafe(32)


class Merchant(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    api_key = models.CharField(max_length=64, unique=True, default=generate_api_key, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="products")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, db_index=True)
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    rating = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
    )
    is_active = models.BooleanField(default=True, db_index=True)
    specifications = models.JSONField(default=dict, validators=[validate_specifications])
    tags = models.JSONField(default=list, validators=[validate_tags])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["merchant", "is_active"]),
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["price"]),
            models.Index(fields=["is_active", "category", "price"]),
        ]

    def clean(self):
        super().clean()
        self.specifications = validate_specifications(self.specifications)
        self.tags = validate_tags(self.tags)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            ProductEmbedding.objects.update_or_create(
                product_id=self.pk,
                defaults={
                    "embedding": catalog_text_embedding(
                        self.title,
                        self.description,
                        self.category,
                        self.specifications,
                        self.tags,
                    )
                },
            )
        except DatabaseError:
            # The optional vector table is absent when the server extension is unavailable.
            pass

    def __str__(self) -> str:
        return self.title


class ProductEmbedding(models.Model):
    product = models.OneToOneField(
        Product,
        primary_key=True,
        db_column="product_id",
        related_name="semantic_index",
        on_delete=models.DO_NOTHING,
    )
    embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "merchants_product_embedding"
