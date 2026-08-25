from django.conf import settings
from rest_framework import serializers

from apps.merchants.models import Merchant, Product, ProductRelationship


class PublicMerchantSerializer(serializers.ModelSerializer):
    catalog_url = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Merchant
        fields = ["id", "name", "catalog_url", "updated_at"]

    def get_catalog_url(self, obj):
        request = self.context["request"]
        return request.build_absolute_uri(f"/api/commerce/v1/catalog/products/?merchant_id={obj.pk}")

    def get_updated_at(self, obj):
        latest = obj.products.order_by("-updated_at").values_list("updated_at", flat=True).first()
        return latest


class RelatedProductSerializer(serializers.ModelSerializer):
    merchant = serializers.CharField(source="merchant.name", read_only=True)
    currency = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "title", "merchant", "category", "price", "currency", "available", "updated_at"]

    def get_currency(self, _obj):
        return settings.MONEY_SUPPORTED_CURRENCY

    def get_available(self, obj):
        return obj.is_active and obj.stock_quantity > 0


class PublicRelationshipSerializer(serializers.ModelSerializer):
    related_product = RelatedProductSerializer(read_only=True)

    class Meta:
        model = ProductRelationship
        fields = [
            "id", "relationship_type", "related_product", "compatibility", "benefit",
            "trade_off", "offer_label", "updated_at",
        ]


class PublicProductSerializer(serializers.ModelSerializer):
    merchant = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()
    relationships = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "merchant", "title", "description", "category", "price", "currency",
            "availability", "rating", "specifications", "tags", "relationships", "updated_at",
        ]

    def get_merchant(self, obj):
        return {"id": obj.merchant_id, "name": obj.merchant.name}

    def get_currency(self, _obj):
        return settings.MONEY_SUPPORTED_CURRENCY

    def get_availability(self, obj):
        return {
            "available": obj.is_active and obj.stock_quantity > 0,
            "stock_quantity": obj.stock_quantity,
        }

    def get_relationships(self, obj):
        eligible = [
            relationship
            for relationship in obj.outgoing_relationships.all()
            if relationship.is_active
            and relationship.related_product.is_active
            and relationship.related_product.stock_quantity > 0
        ]
        return PublicRelationshipSerializer(eligible, many=True).data


class CommerceQuoteLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class CommerceQuoteRequestSerializer(serializers.Serializer):
    intent = serializers.CharField(max_length=2_000, required=False, default="External catalog selection")
    items = CommerceQuoteLineSerializer(many=True, allow_empty=False)

    def validate_items(self, value):
        if len(value) > settings.ORDER_MAX_CART_ITEMS:
            raise serializers.ValidationError(
                f"A quote can contain at most {settings.ORDER_MAX_CART_ITEMS} items."
            )
        product_ids = [item["product_id"] for item in value]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Duplicate product lines are not allowed.")
        return value
