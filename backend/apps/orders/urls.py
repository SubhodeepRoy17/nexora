from django.urls import path

from .views import AgentTransactionAuditListView, CreateOrderView
from .webhooks import razorpay_webhook


app_name = "orders"

urlpatterns = [
    path("create/", CreateOrderView.as_view(), name="create"),
    path("audits/", AgentTransactionAuditListView.as_view(), name="audit-list"),
    path("webhook/razorpay/", razorpay_webhook, name="razorpay-webhook"),
]
