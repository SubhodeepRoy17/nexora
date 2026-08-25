from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MerchantViewSet, MerchantWorkspaceView, ProductRelationshipViewSet, ProductViewSet


router = DefaultRouter()
router.register("merchants/products", ProductViewSet, basename="merchant-product")
router.register(
    "merchants/product-relationships",
    ProductRelationshipViewSet,
    basename="merchant-product-relationship",
)
router.register("merchants", MerchantViewSet, basename="merchant")

urlpatterns = [path("merchants/workspace/", MerchantWorkspaceView.as_view(), name="merchant-workspace")]
urlpatterns += router.urls
