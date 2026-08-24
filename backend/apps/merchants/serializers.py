from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Merchant, Product, ProductRelationship
from .schemas import validate_specifications, validate_tags


def serializer_validation(callable_, value):
    try:
        return callable_(value)
    except DjangoValidationError as exc:
        details = exc.params.get("errors") if exc.params else None
        raise serializers.ValidationError(details or exc.messages) from exc


class MerchantSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(source="products.count", read_only=True)
    api_key = serializers.SerializerMethodField()

    class Meta:
        model = Merchant
        fields = ["id", "name", "email", "api_key", "created_at", "product_count"]
        read_only_fields = ["id", "api_key", "created_at", "product_count"]

    def get_api_key(self, obj):
        return f"{obj.api_key[:8]}••••••••" if obj.api_key else None


class ProductSerializer(serializers.ModelSerializer):
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "merchant",
            "merchant_name",
            "title",
            "description",
            "category",
            "price",
            "stock_quantity",
            "rating",
            "is_active",
            "specifications",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "merchant", "merchant_name", "created_at", "updated_at"]

    def validate_specifications(self, value):
        return serializer_validation(validate_specifications, value)

    def validate_tags(self, value):
        return serializer_validation(validate_tags, value)


class ProductRelationshipSerializer(serializers.ModelSerializer):
    source_title = serializers.CharField(source="source_product.title", read_only=True)
    related_title = serializers.CharField(source="related_product.title", read_only=True)
    incremental_cost = serializers.DecimalField(
        source="related_product.price", max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = ProductRelationship
        fields = [
            "id", "source_product", "source_title", "related_product", "related_title",
            "relationship_type", "compatibility", "benefit", "trade_off", "offer_label",
            "incremental_cost", "priority", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "source_title", "related_title", "incremental_cost", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        merchant = self.context["request"].user.merchant_profile
        source = attrs.get("source_product", getattr(self.instance, "source_product", None))
        related = attrs.get("related_product", getattr(self.instance, "related_product", None))
        if not source or source.merchant_id != merchant.id:
            raise serializers.ValidationError({"source_product": "Select one of your products."})
        if not related or related.merchant_id != merchant.id:
            raise serializers.ValidationError({"related_product": "Select one of your products."})
        candidate = ProductRelationship(
            source_product=source,
            related_product=related,
            relationship_type=attrs.get(
                "relationship_type", getattr(self.instance, "relationship_type", "")
            ),
            compatibility=attrs.get("compatibility", getattr(self.instance, "compatibility", {})),
            benefit=attrs.get("benefit", getattr(self.instance, "benefit", "")),
            trade_off=attrs.get("trade_off", getattr(self.instance, "trade_off", "")),
            offer_label=attrs.get("offer_label", getattr(self.instance, "offer_label", "")),
            priority=attrs.get("priority", getattr(self.instance, "priority", 100)),
            is_active=attrs.get("is_active", getattr(self.instance, "is_active", True)),
        )
        if self.instance is not None:
            candidate.pk = self.instance.pk
        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            details = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise serializers.ValidationError(details) from exc
        return attrs
