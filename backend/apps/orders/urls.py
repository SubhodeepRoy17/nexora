from django.urls import path

from .views import (
    AgentTransactionAuditListView,
    ApproveQuoteView,
    CancelOrderView,
    CartCreateView,
    CartQuoteView,
    CreateOrderView,
    CreateQuoteView,
    MoneyActionAuditListView,
    OrderDetailView,
    OrderListView,
    VerifyCheckoutPaymentView,
)
from .webhooks import razorpay_webhook


app_name = "orders"

urlpatterns = [
    path("create/", CreateOrderView.as_view(), name="create"),
    path("carts/", CartCreateView.as_view(), name="cart-create"),
    path("carts/<uuid:cart_id>/quote/", CartQuoteView.as_view(), name="cart-quote"),
    path("quotes/", CreateQuoteView.as_view(), name="quote-create"),
    path("quotes/<uuid:quote_id>/approve/", ApproveQuoteView.as_view(), name="quote-approve"),
    path("", OrderListView.as_view(), name="list"),
    path("<uuid:order_id>/", OrderDetailView.as_view(), name="detail"),
    path("<uuid:order_id>/cancel/", CancelOrderView.as_view(), name="cancel"),
    path("<uuid:order_id>/payment-status/", VerifyCheckoutPaymentView.as_view(), name="payment-status"),
    path("audits/", AgentTransactionAuditListView.as_view(), name="audit-list"),
    path("money-audits/", MoneyActionAuditListView.as_view(), name="money-audit-list"),
    path("webhook/razorpay/", razorpay_webhook, name="razorpay-webhook"),
]
