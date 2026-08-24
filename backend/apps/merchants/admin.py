from django.contrib import admin

from .models import Merchant, Product


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "created_at"]
    search_fields = ["name", "email"]
    readonly_fields = ["api_key", "created_at"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["title", "merchant", "category", "price", "stock_quantity", "is_active"]
    list_filter = ["category", "is_active"]
    search_fields = ["title", "merchant__name", "tags"]
    readonly_fields = ["created_at", "updated_at"]
