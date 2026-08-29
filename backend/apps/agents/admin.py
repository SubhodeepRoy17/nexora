from django.contrib import admin

from .models import GrowthExperimentAssignment, GrowthOffer


@admin.register(GrowthExperimentAssignment)
class GrowthExperimentAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "assignment_id",
        "experiment_key",
        "merchant",
        "variant",
        "offers_shown",
        "is_synthetic",
        "created_at",
    )
    list_filter = ("experiment_key", "variant", "is_synthetic", "merchant")
    search_fields = ("assignment_id", "session__session_id")
    readonly_fields = (
        "assignment_id",
        "session",
        "primary_decision",
        "merchant",
        "eligible_addon_product",
        "experiment_key",
        "variant",
        "assignment_unit_hash",
        "eligibility_snapshot",
        "offers_shown",
        "is_synthetic",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GrowthOffer)
class GrowthOfferAdmin(admin.ModelAdmin):
    list_display = (
        "offer_id",
        "product",
        "response",
        "incremental_cost",
        "experiment_assignment",
        "is_synthetic",
        "created_at",
    )
    list_filter = ("response", "is_synthetic", "relationship__relationship_type")
    search_fields = ("offer_id", "session__session_id", "product__title")
    readonly_fields = tuple(field.name for field in GrowthOffer._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
