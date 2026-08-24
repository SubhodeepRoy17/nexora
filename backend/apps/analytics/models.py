from django.db import models

from apps.merchants.models import Merchant, Product


class AgentSearchImpression(models.Model):
    class Source(models.TextChoices):
        GROQ = "GROQ", "Groq"
        FALLBACK = "FALLBACK", "ORM fallback"

    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="agent_search_impressions")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, related_name="agent_search_impressions")
    product_title = models.CharField(max_length=255)
    query = models.CharField(max_length=2_000)
    source = models.CharField(max_length=12, choices=Source.choices)
    position = models.PositiveSmallIntegerField()
    max_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["merchant", "created_at"]),
            models.Index(fields=["product", "created_at"]),
        ]


class LostOpportunity(models.Model):
    class Reason(models.TextChoices):
        PRICE = "PRICE", "Price above buyer budget"
        STOCK = "STOCK", "Product out of stock"

    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="lost_opportunities")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, related_name="lost_opportunities")
    product_title = models.CharField(max_length=255)
    query = models.CharField(max_length=2_000)
    reason = models.CharField(max_length=12, choices=Reason.choices)
    requested_max_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    observed_price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["merchant", "reason", "created_at"]),
            models.Index(fields=["product", "created_at"]),
        ]
