import uuid

from django.core.validators import MinValueValidator
from django.db import models

from apps.merchants.models import Merchant, Product


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    order_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="orders")
    buyer_email = models.EmailField()
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    razorpay_order_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_signature = models.CharField(max_length=256, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["product", "status"])]

    def __str__(self) -> str:
        return f"{self.order_id} · {self.status}"


class AgentTransactionAudit(models.Model):
    class ConversionStatus(models.TextChoices):
        RECOMMENDED = "RECOMMENDED", "Recommended"
        PURCHASED = "PURCHASED", "Purchased"
        REJECTED = "REJECTED", "Rejected"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="agent_audits")
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="agent_transaction_audits")
    agent_thought_summary = models.TextField()
    conversion_status = models.CharField(max_length=12, choices=ConversionStatus.choices, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "conversion_status"],
                name="unique_order_conversion_audit",
            )
        ]

    def __str__(self) -> str:
        return f"{self.order_id} · {self.conversion_status}"
