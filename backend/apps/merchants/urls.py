from rest_framework.routers import DefaultRouter

from .views import MerchantViewSet, ProductViewSet


router = DefaultRouter()
router.register("merchants/products", ProductViewSet, basename="merchant-product")
router.register("merchants", MerchantViewSet, basename="merchant")

urlpatterns = router.urls
