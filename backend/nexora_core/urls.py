from django.contrib import admin
from django.urls import include, path

from apps.commerce.views import CapabilityView

from .views import HealthView


urlpatterns = [
    path("admin/", admin.site.urls),
    path(".well-known/nexora-commerce.json", CapabilityView.as_view(), name="commerce-capability"),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/merchants/analytics/", include("apps.analytics.urls")),
    path("api/", include("apps.merchants.urls")),
    path("api/agents/", include("apps.agents.urls")),
    path("api/orders/", include("apps.orders.urls")),
    path("api/commerce/v1/", include("apps.commerce.urls")),
]
