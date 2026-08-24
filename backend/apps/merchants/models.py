import re
import secrets

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.core.exceptions import ValidationError
from django.db import DatabaseError, models
from pgvector.django import VectorField

from .embeddings import EMBEDDING_DIMENSIONS, catalog_text_embedding
from .schemas import validate_specifications, validate_tags


def generate_api_key() -> str:
    return secrets.token_urlsafe(32)


class Merchant(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="merchant_profile",
    )
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


class ProductRelationship(models.Model):
    class Kind(models.TextChoices):
        ACCESSORY = "ACCESSORY", "Accessory"
        COMPLEMENT = "COMPLEMENT", "Complement"
        SUBSTITUTE = "SUBSTITUTE", "Substitute"
        BUNDLE = "BUNDLE", "Bundle"

    source_product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="outgoing_relationships"
    )
    related_product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="incoming_relationships"
    )
    relationship_type = models.CharField(max_length=16, choices=Kind.choices, db_index=True)
    compatibility = models.JSONField(default=dict)
    benefit = models.CharField(max_length=500)
    trade_off = models.CharField(max_length=500, blank=True)
    offer_label = models.CharField(max_length=120, blank=True)
    priority = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source_product", "related_product", "relationship_type"],
                name="unique_product_relationship",
            ),
            models.CheckConstraint(
                condition=~models.Q(source_product=models.F("related_product")),
                name="relationship_products_differ",
            ),
        ]
        indexes = [models.Index(fields=["source_product", "is_active", "priority"])]

    def clean(self):
        super().clean()
        if self.source_product_id == self.related_product_id:
            raise ValidationError({"related_product": "A product cannot link to itself."})
        if self.source_product_id and self.related_product_id:
            if self.source_product.merchant_id != self.related_product.merchant_id:
                raise ValidationError(
                    {"related_product": "Relationships may only link products owned by the same merchant."}
                )
            if self.is_active and (
                not self.source_product.is_active or not self.related_product.is_active
            ):
                raise ValidationError("Both linked products must be active.")
            if self.is_active and self.related_product.stock_quantity < 1:
                raise ValidationError({"related_product": "The linked product must be in stock."})
        if not isinstance(self.compatibility, dict):
            raise ValidationError({"compatibility": "Compatibility must be a JSON object."})
        if self.offer_label and (
            "%" in self.offer_label
            or re.search(
                r"\b(save|discount|off|limited|hurry|urgent|expires?|today only)\b",
                self.offer_label,
                flags=re.IGNORECASE,
            )
        ):
            raise ValidationError(
                {"offer_label": "Offer labels cannot claim savings, discounts, scarcity, or urgency."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
