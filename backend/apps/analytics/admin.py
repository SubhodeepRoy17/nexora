from django.contrib import admin

from .models import AgentSearchImpression, LostOpportunity


@admin.register(AgentSearchImpression)
class AgentSearchImpressionAdmin(admin.ModelAdmin):
    list_display = ("product_title", "merchant", "source", "position", "created_at")
    list_filter = ("source", "merchant")
    search_fields = ("product_title", "query")


@admin.register(LostOpportunity)
class LostOpportunityAdmin(admin.ModelAdmin):
    list_display = ("product_title", "merchant", "reason", "observed_price", "created_at")
    list_filter = ("reason", "merchant")
    search_fields = ("product_title", "query")
