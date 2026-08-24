from django.contrib import admin

from .models import Cart, Order, OrderItem, Quote, StockReservation, AgentTransactionAudit


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_id", "buyer_email", "total_amount", "status", "reservation_expires_at", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["order_id", "buyer_email", "razorpay_order_id", "razorpay_payment_id"]
    readonly_fields = ["order_id", "razorpay_signature", "created_at", "updated_at"]


admin.site.register(Cart)
admin.site.register(Quote)
admin.site.register(OrderItem)
admin.site.register(StockReservation)


@admin.register(AgentTransactionAudit)
class AgentTransactionAuditAdmin(admin.ModelAdmin):
    list_display = ["order", "merchant", "conversion_status", "created_at"]
    list_filter = ["conversion_status", "created_at"]
    search_fields = ["order__order_id", "merchant__name", "agent_thought_summary"]
    readonly_fields = ["created_at"]
