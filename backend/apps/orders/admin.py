from django.contrib import admin

from .models import (
    AgentTransactionAudit,
    Cart,
    Order,
    OrderItem,
    PaymentRefund,
    Quote,
    ReconciliationException,
    StockReservation,
    WebhookEvent,
)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_id", "buyer_email", "total_amount", "status", "reservation_expires_at", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["order_id", "buyer_email", "razorpay_order_id", "razorpay_payment_id"]
    readonly_fields = ["order_id", "created_at", "updated_at"]


admin.site.register(Cart)
admin.site.register(Quote)
admin.site.register(OrderItem)
admin.site.register(StockReservation)
admin.site.register(PaymentRefund)
admin.site.register(ReconciliationException)


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = [
        "event_type", "razorpay_event_id", "signature_verified", "processing_state",
        "attempt_count", "order", "error_code", "received_at",
    ]
    list_filter = ["signature_verified", "processing_state", "event_type", "received_at"]
    search_fields = ["razorpay_event_id", "payload_hash", "order__order_id", "error_code"]
    readonly_fields = [
        "event_id", "razorpay_event_id", "deduplication_key", "event_type", "payload_hash",
        "signature_verified", "processing_state", "attempt_count", "order", "error_code",
        "received_at", "last_attempt_at", "processed_at",
    ]


@admin.register(AgentTransactionAudit)
class AgentTransactionAuditAdmin(admin.ModelAdmin):
    list_display = ["order", "merchant", "conversion_status", "created_at"]
    list_filter = ["conversion_status", "created_at"]
    search_fields = ["order__order_id", "merchant__name", "agent_thought_summary"]
    readonly_fields = ["created_at"]
