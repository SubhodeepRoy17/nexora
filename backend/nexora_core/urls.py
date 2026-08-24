from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/merchants/analytics/", include("apps.analytics.urls")),
    path("api/", include("apps.merchants.urls")),
    path("api/agents/", include("apps.agents.urls")),
    path("api/orders/", include("apps.orders.urls")),
]
