from django.contrib import admin

from .models import Merchant, Product, ProductRelationship


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "owner", "created_at"]
    search_fields = ["name", "email", "owner__username", "owner__email"]
    readonly_fields = ["api_key", "created_at"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["title", "merchant", "category", "price", "stock_quantity", "is_active"]
    list_filter = ["category", "is_active"]
    search_fields = ["title", "merchant__name", "tags"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(ProductRelationship)
class ProductRelationshipAdmin(admin.ModelAdmin):
    list_display = [
        "source_product", "relationship_type", "related_product", "priority", "is_active"
    ]
    list_filter = ["relationship_type", "is_active"]
