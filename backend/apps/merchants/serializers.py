from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Merchant, Product
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
        read_only_fields = ["id", "merchant_name", "created_at", "updated_at"]

    def validate_specifications(self, value):
        return serializer_validation(validate_specifications, value)

    def validate_tags(self, value):
        return serializer_validation(validate_tags, value)
