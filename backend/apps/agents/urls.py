from django.urls import path

from .views import BuyerAgentSearchView, GrowthOfferResponseView


app_name = "agents"

urlpatterns = [
    path("search/", BuyerAgentSearchView.as_view(), name="search"),
    path(
        "growth-offers/<uuid:offer_id>/respond/",
        GrowthOfferResponseView.as_view(),
        name="growth-offer-respond",
    ),
]
