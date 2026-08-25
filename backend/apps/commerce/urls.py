from django.urls import path

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
