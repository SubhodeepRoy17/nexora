from django.conf import settings
from rest_framework import serializers

from .models import (
    AgentTransactionAudit,
    Cart,
    CartItem,
    MoneyActionAudit,
    Order,
    OrderItem,
    Quote,
    QuoteItem,
    PaymentRefund,
)


class CartLineInputSerializer(serializers.Serializer):
    decision_id = serializers.UUIDField()
    decision_token = serializers.CharField(min_length=20, max_length=2_048, trim_whitespace=False)
    quantity = serializers.IntegerField(min_value=1, max_value=10_000)
    growth_offer_id = serializers.UUIDField(required=False, allow_null=True)


class CreateCartSerializer(serializers.Serializer):
    items = CartLineInputSerializer(many=True, allow_empty=False)

    def validate_items(self, value):
        if len(value) > settings.ORDER_MAX_CART_ITEMS:
            raise serializers.ValidationError(
                f"A cart can contain at most {settings.ORDER_MAX_CART_ITEMS} items."
            )
        decision_ids = [item["decision_id"] for item in value]
        if len(decision_ids) != len(set(decision_ids)):
            raise serializers.ValidationError("Duplicate recommendation decisions are not allowed.")
        return value


class CreateOrderSerializer(serializers.Serializer):
    quote_id = serializers.UUIDField()
    approval_token = serializers.CharField(min_length=20, max_length=2_048, trim_whitespace=False)


class CreateQuoteSerializer(serializers.Serializer):
    decision_id = serializers.UUIDField()
    decision_token = serializers.CharField(min_length=20, max_length=2_048, trim_whitespace=False)
    quantity = serializers.IntegerField(min_value=1, max_value=10_000)


class VerifyCheckoutPaymentSerializer(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=64)
    razorpay_payment_id = serializers.CharField(max_length=64)
    razorpay_signature = serializers.CharField(max_length=256, trim_whitespace=False)


class ApproveQuoteSerializer(serializers.Serializer):
    confirmed = serializers.BooleanField()

    def validate_confirmed(self, value):
        if value is not True:
            raise serializers.ValidationError("Explicit confirmation is required.")
        return value


class CartItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    merchant_name = serializers.CharField(source="product.merchant.name", read_only=True)

    class Meta:
        model = CartItem
        fields = [
            "product", "product_title", "merchant_name", "decision", "growth_offer", "quantity"
        ]
        read_only_fields = fields


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)

    class Meta:
        model = Cart
        fields = ["cart_id", "session", "status", "items", "created_at", "updated_at"]
        read_only_fields = fields


class QuoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuoteItem
        fields = [
            "product", "product_title", "merchant", "merchant_name", "decision", "quantity",
            "growth_offer", "unit_price", "line_total", "explanation", "trade_offs",
        ]
        read_only_fields = fields


class QuoteSerializer(serializers.ModelSerializer):
    items = QuoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = Quote
        fields = [
            "quote_id", "cart", "session", "items", "total_amount", "currency", "expires_at",
            "status", "policy_snapshot", "created_at",
        ]
        read_only_fields = fields


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "product", "product_title", "merchant", "merchant_name", "quantity", "unit_price",
            "line_total", "growth_offer",
        ]
        read_only_fields = fields


class PaymentRefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentRefund
        fields = [
            "refund_id", "razorpay_refund_id", "amount", "currency", "status",
            "reason_code", "error_code", "requested_at", "processed_at",
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    refunds = PaymentRefundSerializer(many=True, read_only=True)
    cancellable = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "order_id", "quote", "items", "total_amount", "currency", "status", "cancellable",
            "reservation_expires_at", "razorpay_order_id", "razorpay_payment_id", "paid_at",
            "cancelled_at", "refunds", "state_updated_at", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_cancellable(self, obj):
        return obj.status in {Order.Status.PAYMENT_PENDING, Order.Status.PAYMENT_FAILED}


class AgentTransactionAuditSerializer(serializers.ModelSerializer):
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)
    buyer_reference = serializers.SerializerMethodField()
    total_amount = serializers.DecimalField(
        source="order.total_amount", max_digits=12, decimal_places=2, read_only=True
    )
    order_status = serializers.CharField(source="order.status", read_only=True)
    product_titles = serializers.SerializerMethodField()

    class Meta:
        model = AgentTransactionAudit
        fields = [
            "id", "order", "merchant", "merchant_name", "product_titles", "buyer_reference",
            "total_amount", "order_status", "agent_thought_summary", "conversion_status", "created_at",
        ]
        read_only_fields = fields

    def get_buyer_reference(self, obj):
        user_id = obj.order.buyer_id
        return f"Buyer #{user_id}" if user_id else "Legacy buyer"

    def get_product_titles(self, obj):
        return list(
            obj.order.items.filter(merchant=obj.merchant).values_list("product_title", flat=True)
        )


class MoneyActionAuditSerializer(serializers.ModelSerializer):
    buyer_reference = serializers.SerializerMethodField()
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)
    approved_amount = serializers.DecimalField(
        source="quote.total_amount", max_digits=12, decimal_places=2, read_only=True, default=None
    )
    currency = serializers.CharField(source="quote.currency", read_only=True, default=None)

    class Meta:
        model = MoneyActionAudit
        fields = [
            "audit_id", "session", "quote", "order", "merchant_name", "buyer_reference",
            "approved_amount", "currency", "action", "outcome", "reason_code", "summary",
            "metadata", "created_at",
        ]
        read_only_fields = fields

    def get_buyer_reference(self, obj):
        return f"Buyer #{obj.buyer_id}"
