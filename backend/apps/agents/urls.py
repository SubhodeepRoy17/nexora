from django.urls import path

from .views import (
    BuyerAgentSearchView,
    BuyerConversationDetailView,
    BuyerConversationListView,
    BuyerConversationShareView,
    GrowthOfferResponseView,
    SharedConversationDetailView,
)


app_name = "agents"

urlpatterns = [
    path("search/", BuyerAgentSearchView.as_view(), name="search"),
    path("conversations/", BuyerConversationListView.as_view(), name="conversation-list"),
    path(
        "conversations/<uuid:conversation_id>/",
        BuyerConversationDetailView.as_view(),
        name="conversation-detail",
    ),
    path(
        "conversations/<uuid:conversation_id>/share/",
        BuyerConversationShareView.as_view(),
        name="conversation-share",
    ),
    path(
        "shared-conversations/<uuid:share_token>/",
        SharedConversationDetailView.as_view(),
        name="shared-conversation-detail",
    ),
    path(
        "growth-offers/<uuid:offer_id>/respond/",
        GrowthOfferResponseView.as_view(),
        name="growth-offer-respond",
    ),
]
