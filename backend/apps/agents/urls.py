from django.urls import path

from .views import BuyerAgentSearchView


app_name = "agents"

urlpatterns = [
    path("search/", BuyerAgentSearchView.as_view(), name="search"),
]
