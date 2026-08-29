import uuid

from django.conf import settings
from django.db import models

from apps.merchants.models import Product, ProductRelationship


class ChatConversation(models.Model):
    conversation_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="chat_conversations",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=120)
    title_is_custom = models.BooleanField(default=False)
    share_token = models.UUIDField(null=True, blank=True, unique=True, editable=False)
    shared_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["buyer", "-updated_at"])]


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = "USER", "User"
        ASSISTANT = "ASSISTANT", "Assistant"

    message_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        ChatConversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=12, choices=Role.choices)
    content = models.TextField(max_length=5_000)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]


class AgentSession(models.Model):
    class Source(models.TextChoices):
        GEMINI = "GEMINI", "Gemini"
        GROQ = "GROQ", "Groq (legacy)"
        FALLBACK = "FALLBACK", "Deterministic fallback"

    session_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="agent_sessions",
        null=True,
        blank=True,
    )
    conversation = models.ForeignKey(
        ChatConversation,
        on_delete=models.PROTECT,
        related_name="search_runs",
        null=True,
        blank=True,
    )
    user_request = models.TextField(max_length=2_000)
    parsed_constraints = models.JSONField(default=dict)
    catalog_candidate_ids = models.JSONField(default=list)
    provider_source = models.CharField(max_length=12, choices=Source.choices)
    decision_summary = models.TextField(max_length=2_000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class RecommendationDecision(models.Model):
    decision_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AgentSession, on_delete=models.CASCADE, related_name="decisions")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="recommendation_decisions")
    rank = models.PositiveSmallIntegerField()
    explanation = models.TextField(max_length=2_000)
    trade_offs = models.JSONField(default=list)
    catalog_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["rank"]
        constraints = [models.UniqueConstraint(fields=["session", "product"], name="unique_session_product_decision")]


class GrowthExperimentAssignment(models.Model):
    """Immutable assignment for the eligible-session growth experiment.

    The assignment exists even for the control arm, where no offer is rendered.
    This keeps the experiment denominator independent from offer impressions.
    """

    class Variant(models.TextChoices):
        CONTROL = "CONTROL", "No add-on offer"
        TREATMENT = "TREATMENT", "Eligible add-on offer"

    assignment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(
        AgentSession, on_delete=models.PROTECT, related_name="growth_experiment_assignment"
    )
    primary_decision = models.OneToOneField(
        RecommendationDecision,
        on_delete=models.PROTECT,
        related_name="growth_experiment_assignment",
    )
    merchant = models.ForeignKey(
        "merchants.Merchant", on_delete=models.PROTECT, related_name="growth_experiment_assignments"
    )
    eligible_addon_product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="eligible_growth_experiment_assignments"
    )
    experiment_key = models.CharField(max_length=80, db_index=True)
    variant = models.CharField(max_length=12, choices=Variant.choices, db_index=True)
    assignment_unit_hash = models.CharField(max_length=64)
    eligibility_snapshot = models.JSONField(default=dict)
    offers_shown = models.PositiveSmallIntegerField(default=0)
    is_synthetic = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(
                fields=["merchant", "experiment_key", "variant", "is_synthetic"],
                name="agents_grow_merchan_a015a3_idx",
            ),
        ]


class GrowthOffer(models.Model):
    class Response(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    offer_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AgentSession, on_delete=models.PROTECT, related_name="growth_offers")
    primary_decision = models.ForeignKey(
        RecommendationDecision, on_delete=models.PROTECT, related_name="primary_growth_offers"
    )
    addon_decision = models.OneToOneField(
        RecommendationDecision, on_delete=models.PROTECT, related_name="growth_offer"
    )
    relationship = models.ForeignKey(
        ProductRelationship, on_delete=models.PROTECT, related_name="growth_offers"
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="growth_offers")
    experiment_assignment = models.ForeignKey(
        GrowthExperimentAssignment,
        on_delete=models.PROTECT,
        related_name="offers",
        null=True,
        blank=True,
    )
    explanation = models.CharField(max_length=800)
    trade_off = models.CharField(max_length=500, blank=True)
    incremental_cost = models.DecimalField(max_digits=12, decimal_places=2)
    response = models.CharField(
        max_length=10, choices=Response.choices, default=Response.PENDING, db_index=True
    )
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="growth_offer_responses",
        null=True,
        blank=True,
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    is_synthetic = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "primary_decision", "product"], name="unique_session_growth_offer"
            )
        ]
        indexes = [models.Index(fields=["product", "response", "is_synthetic"])]
