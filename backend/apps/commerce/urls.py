from django.urls import path

from .acp import (
    ACPBuyerTokenView,
    ACPCheckoutApproveView,
    ACPCheckoutCancelView,
    ACPCheckoutCollectionView,
    ACPCheckoutCompleteView,
    ACPCheckoutDetailView,
    ACPHandlerSchemaView,
    ACPPaymentHandlerView,
)

from .views import (
    CommerceApproveQuoteView,
    CommerceCreateOrderView,
    CommerceOrderDetailView,
    CommerceQuoteView,
    MerchantCatalogView,
    MoneyPolicyView,
    OpenAPIView,
    ProductCatalogView,
    ProductDetailView,
    ProductSchemaView,
)


app_name = "commerce"

urlpatterns = [
    path("acp/agent-tokens/", ACPBuyerTokenView.as_view(), name="acp-agent-token"),
    path("acp/payment-handler.json", ACPPaymentHandlerView.as_view(), name="acp-payment-handler"),
    path("acp/schemas/razorpay-test-handler.json", ACPHandlerSchemaView.as_view(), name="acp-handler-schema"),
    path("acp/checkout_sessions", ACPCheckoutCollectionView.as_view(), name="acp-checkout-create"),
    path("acp/checkout_sessions/<uuid:checkout_session_id>", ACPCheckoutDetailView.as_view(), name="acp-checkout-detail"),
    path("acp/checkout_sessions/<uuid:checkout_session_id>/approve", ACPCheckoutApproveView.as_view(), name="acp-checkout-approve"),
    path("acp/checkout_sessions/<uuid:checkout_session_id>/complete", ACPCheckoutCompleteView.as_view(), name="acp-checkout-complete"),
    path("acp/checkout_sessions/<uuid:checkout_session_id>/cancel", ACPCheckoutCancelView.as_view(), name="acp-checkout-cancel"),
    path("catalog/products/", ProductCatalogView.as_view(), name="product-list"),
    path("catalog/products/<int:product_id>/", ProductDetailView.as_view(), name="product-detail"),
    path("catalog/merchants/", MerchantCatalogView.as_view(), name="merchant-list"),
    path("schemas/catalog-product.json", ProductSchemaView.as_view(), name="product-schema"),
    path("openapi.json", OpenAPIView.as_view(), name="openapi"),
    path("policies/money-actions/", MoneyPolicyView.as_view(), name="money-policy"),
    path("quotes/", CommerceQuoteView.as_view(), name="quote-create"),
    path("quotes/<uuid:quote_id>/approve/", CommerceApproveQuoteView.as_view(), name="quote-approve"),
    path("checkout-orders/", CommerceCreateOrderView.as_view(), name="checkout-create"),
    path("orders/<uuid:order_id>/", CommerceOrderDetailView.as_view(), name="order-detail"),
]
