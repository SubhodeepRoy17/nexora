import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.merchants.models import Merchant, Product
from apps.agents.models import AgentSession, GrowthOffer, RecommendationDecision


class Cart(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        QUOTED = "QUOTED", "Quoted"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    cart_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="carts", null=True, blank=True
    )
    session = models.ForeignKey(
        AgentSession, on_delete=models.PROTECT, related_name="carts", null=True, blank=True
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    decision = models.ForeignKey(
        RecommendationDecision, on_delete=models.PROTECT, related_name="cart_items"
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="cart_items")
    growth_offer = models.OneToOneField(
        GrowthOffer, on_delete=models.PROTECT, related_name="cart_items", null=True, blank=True
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["cart", "product"], name="unique_cart_product")]


class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        QUOTED = "QUOTED", "Quoted"
        APPROVED = "APPROVED", "Approved"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        PAID = "PAID", "Paid"
        PAYMENT_FAILED = "PAYMENT_FAILED", "Payment failed"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"
        REFUND_PENDING = "REFUND_PENDING", "Refund pending"
        REFUNDED = "REFUNDED", "Refunded"

    order_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )
    quote = models.OneToOneField(
        "Quote",
        on_delete=models.PROTECT,
        related_name="order",
        null=True,
        blank=True,
    )
    # Deprecated compatibility fields. New code reads immutable OrderItem rows.
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="orders", null=True, blank=True
    )
    buyer_email = models.EmailField()
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)], null=True, blank=True)
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PAYMENT_PENDING, db_index=True
    )
    reservation_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    reservation_released_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    state_updated_at = models.DateTimeField(default=timezone.now)
    razorpay_order_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_signature = models.CharField(max_length=256, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["product", "status"]), models.Index(fields=["buyer", "status"])]

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
                fields=["order", "merchant", "conversion_status"],
                name="unique_order_conversion_audit",
            )
        ]

    def __str__(self) -> str:
        return f"{self.order_id} · {self.conversion_status}"


class Quote(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        APPROVED = "APPROVED", "Approved"
        CONSUMED = "CONSUMED", "Consumed"
        BLOCKED = "BLOCKED", "Blocked"
        EXPIRED = "EXPIRED", "Expired"

    quote_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.OneToOneField(
        Cart, on_delete=models.PROTECT, related_name="quote", null=True, blank=True
    )
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="quotes")
    session = models.ForeignKey(AgentSession, on_delete=models.PROTECT, related_name="quotes")
    # Deprecated single-line compatibility fields. QuoteItem is authoritative.
    decision = models.ForeignKey(
        RecommendationDecision, on_delete=models.PROTECT, related_name="quotes", null=True, blank=True
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="quotes", null=True, blank=True
    )
    quantity = models.PositiveIntegerField(null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    expires_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    policy_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class QuoteItem(models.Model):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="items")
    decision = models.ForeignKey(
        RecommendationDecision, on_delete=models.PROTECT, related_name="quote_items", null=True, blank=True
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="quote_items")
    growth_offer = models.OneToOneField(
        GrowthOffer, on_delete=models.PROTECT, related_name="quote_items", null=True, blank=True
    )
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="quote_items")
    product_title = models.CharField(max_length=255)
    merchant_name = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    explanation = models.TextField(max_length=2_000, blank=True)
    trade_offs = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["quote", "product"], name="unique_quote_product"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="quote_item_quantity_positive"),
            models.CheckConstraint(condition=models.Q(line_total__gte=0), name="quote_item_total_nonnegative"),
        ]


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_items")
    growth_offer = models.OneToOneField(
        GrowthOffer, on_delete=models.PROTECT, related_name="order_items", null=True, blank=True
    )
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="order_items")
    product_title = models.CharField(max_length=255)
    merchant_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="unique_order_product"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="order_item_quantity_positive"),
            models.CheckConstraint(condition=models.Q(line_total__gte=0), name="order_item_total_nonnegative"),
        ]


class StockReservation(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CONSUMED = "CONSUMED", "Consumed"
        RELEASED = "RELEASED", "Released"
        EXPIRED = "EXPIRED", "Expired"

    reservation_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="reservations")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="stock_reservations")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="unique_order_product_reservation"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="reservation_quantity_positive"),
        ]
        indexes = [models.Index(fields=["status", "expires_at"])]


class IdempotencyRecord(models.Model):
    class Operation(models.TextChoices):
        COMMERCE_QUOTE = "COMMERCE_QUOTE", "Commerce quote"
        QUOTE_APPROVAL = "QUOTE_APPROVAL", "Quote approval"
        PAYMENT_ORDER = "PAYMENT_ORDER", "Payment order"

    record_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="idempotency_records")
    operation = models.CharField(max_length=20, choices=Operation.choices)
    key = models.CharField(max_length=128)
    request_hash = models.CharField(max_length=64)
    quote = models.ForeignKey(Quote, on_delete=models.PROTECT, related_name="idempotency_records")
    order = models.ForeignKey(
        Order, on_delete=models.PROTECT, related_name="idempotency_records", null=True, blank=True
    )
    response_status = models.PositiveSmallIntegerField(default=201)
    error_code = models.CharField(max_length=48, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["buyer", "operation", "key"], name="unique_buyer_operation_key")
        ]


class ApprovalGrant(models.Model):
    grant_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote = models.OneToOneField(Quote, on_delete=models.PROTECT, related_name="approval")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="approval_grants")
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ImmutableAuditQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValueError("MoneyActionAudit records are immutable")

    def delete(self):
        raise ValueError("MoneyActionAudit records are immutable")


class MoneyActionAudit(models.Model):
    class Action(models.TextChoices):
        QUOTE_ALLOWED = "QUOTE_ALLOWED", "Quote allowed"
        MONEY_BLOCKED = "MONEY_BLOCKED", "Money action blocked"
        APPROVAL_GRANTED = "APPROVAL_GRANTED", "Approval granted"
        APPROVAL_CONSUMED = "APPROVAL_CONSUMED", "Approval consumed"
        ORDER_CREATED = "ORDER_CREATED", "Order created"
        PAYMENT_CAPTURED = "PAYMENT_CAPTURED", "Payment captured"
        PAYMENT_FAILED = "PAYMENT_FAILED", "Payment failed"
        RESERVATION_CREATED = "RESERVATION_CREATED", "Reservation created"
        RESERVATION_RELEASED = "RESERVATION_RELEASED", "Reservation released"
        RESERVATION_CONSUMED = "RESERVATION_CONSUMED", "Reservation consumed"
        ORDER_CANCELLED = "ORDER_CANCELLED", "Order cancelled"
        ORDER_EXPIRED = "ORDER_EXPIRED", "Order expired"

    audit_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AgentSession, on_delete=models.PROTECT, related_name="money_audits")
    quote = models.ForeignKey(Quote, on_delete=models.PROTECT, related_name="money_audits", null=True, blank=True)
    approval = models.ForeignKey(ApprovalGrant, on_delete=models.PROTECT, related_name="money_audits", null=True, blank=True)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="money_audits", null=True, blank=True)
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name="money_action_audits")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="money_action_audits")
    action = models.CharField(max_length=24, choices=Action.choices, db_index=True)
    outcome = models.CharField(max_length=12)
    reason_code = models.CharField(max_length=48, db_index=True)
    summary = models.TextField(max_length=2_000)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    objects = ImmutableAuditQuerySet.as_manager()

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("MoneyActionAudit records are immutable")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("MoneyActionAudit records are immutable")
