from django.urls import path

from .views import MerchantAnalyticsView


app_name = "analytics"

urlpatterns = [
    path("", MerchantAnalyticsView.as_view(), name="merchant-analytics"),
]
