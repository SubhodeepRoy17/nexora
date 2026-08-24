from rest_framework import serializers

from .models import AgentTransactionAudit, Order


class CreateOrderSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=25)
    buyer_email = serializers.EmailField(max_length=254)


class OrderSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)

    class Meta:
        model = Order
        fields = [
            "order_id",
            "product",
            "product_title",
            "buyer_email",
            "quantity",
            "total_amount",
            "status",
            "razorpay_order_id",
            "razorpay_payment_id",
            "created_at",
        ]
        read_only_fields = fields


class AgentTransactionAuditSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="order.product.title", read_only=True)
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)
    buyer_email = serializers.EmailField(source="order.buyer_email", read_only=True)
    total_amount = serializers.DecimalField(
        source="order.total_amount",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    order_status = serializers.CharField(source="order.status", read_only=True)

    class Meta:
        model = AgentTransactionAudit
        fields = [
            "id",
            "order",
            "merchant",
            "merchant_name",
            "product_title",
            "buyer_email",
            "total_amount",
            "order_status",
            "agent_thought_summary",
            "conversion_status",
            "created_at",
        ]
        read_only_fields = fields
