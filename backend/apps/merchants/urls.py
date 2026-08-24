from rest_framework.routers import DefaultRouter

from .views import MerchantViewSet, ProductRelationshipViewSet, ProductViewSet


router = DefaultRouter()
router.register("merchants/products", ProductViewSet, basename="merchant-product")
router.register(
    "merchants/product-relationships",
    ProductRelationshipViewSet,
    basename="merchant-product-relationship",
)
router.register("merchants", MerchantViewSet, basename="merchant")

urlpatterns = router.urls
