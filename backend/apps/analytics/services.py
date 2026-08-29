import logging
import math
import re
import statistics
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import DatabaseError
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from apps.agents.models import GrowthExperimentAssignment, GrowthOffer
from apps.merchants.models import Product, ProductRelationship
from apps.orders.models import AgentTransactionAudit, Order, OrderItem

from .models import AgentSearchImpression, LostOpportunity


logger = logging.getLogger(__name__)
ANALYTICS_WINDOW_DAYS = 7


def _query_scope(queryset, query: str, category: str | None):
    if category:
        return queryset.filter(category__icontains=category)
    tokens = [token for token in re.findall(r"[\w+-]+", query.lower()) if len(token) > 3][:6]
    if not tokens:
        return queryset.none()
    conditions = Q()
    for token in tokens:
        conditions |= Q(title__icontains=token) | Q(category__icontains=token) | Q(tags__contains=[token])
    return queryset.filter(conditions)


def record_search_analytics(
    *,
    query: str,
    recommendations: list[dict[str, Any]],
    source: str,
    max_price: float | None = None,
    category: str | None = None,
) -> None:
    """Persist bounded search analytics without affecting the buyer response path."""

    try:
        budget = Decimal(str(max_price)) if max_price is not None else None
        recommended_ids = {item["id"] for item in recommendations}
        AgentSearchImpression.objects.bulk_create(
            [
                AgentSearchImpression(
                    merchant_id=item["merchant"]["id"],
                    product_id=item["id"],
                    product_title=item["title"],
                    query=query,
                    source=source,
                    position=position,
                    max_price=budget,
                )
                for position, item in enumerate(recommendations, start=1)
            ]
        )

        scoped = _query_scope(Product.objects.select_related("merchant"), query, category).exclude(pk__in=recommended_ids)
        lost_records = []
        if budget is not None:
            for product in scoped.filter(is_active=True, stock_quantity__gt=0, price__gt=budget).order_by("price")[:20]:
                lost_records.append(
                    LostOpportunity(
                        merchant=product.merchant,
                        product=product,
                        product_title=product.title,
                        query=query,
                        reason=LostOpportunity.Reason.PRICE,
                        requested_max_price=budget,
                        observed_price=product.price,
                    )
                )
        for product in scoped.filter(stock_quantity=0).order_by("-rating")[:20]:
            lost_records.append(
                LostOpportunity(
                    merchant=product.merchant,
                    product=product,
                    product_title=product.title,
                    query=query,
                    reason=LostOpportunity.Reason.STOCK,
                    requested_max_price=budget,
                    observed_price=product.price,
                )
            )
        LostOpportunity.objects.bulk_create(lost_records)
    except DatabaseError:
        logger.exception("Search analytics could not be recorded; buyer response remains available.")


def _trend(current: int, previous: int) -> float:
    if previous == 0:
        return 100.0 if current else 0.0
    return round(((current - previous) / previous) * 100, 1)


def _growth_experiment_payload(merchant_id: int | None) -> dict[str, Any]:
    """Estimate intent-to-treat revenue lift for randomized eligible sessions.

    Every assignment contributes one outcome, including zero revenue. This is
    deliberately different from add-on attribution, whose denominator is shown
    offers rather than all randomized eligible sessions.
    """

    assignments = GrowthExperimentAssignment.objects.filter(
        experiment_key=settings.GROWTH_EXPERIMENT_KEY,
        is_synthetic=False,
    )
    if merchant_id is not None:
        assignments = assignments.filter(merchant_id=merchant_id)
    assignments = list(assignments.values("session_id", "variant", "offers_shown"))
    session_ids = [item["session_id"] for item in assignments]
    paid_revenue = {
        item["order__quote__session_id"]: item["revenue"]
        for item in OrderItem.objects.filter(
            order__status=Order.Status.PAID,
            order__quote__session_id__in=session_ids,
            **({"merchant_id": merchant_id} if merchant_id is not None else {}),
        )
        .values("order__quote__session_id")
        .annotate(revenue=Sum("line_total"))
    }

    arms: dict[str, dict[str, Any]] = {}
    samples: dict[str, list[float]] = {}
    for variant in (
        GrowthExperimentAssignment.Variant.CONTROL,
        GrowthExperimentAssignment.Variant.TREATMENT,
    ):
        arm_assignments = [item for item in assignments if item["variant"] == variant]
        values = [float(paid_revenue.get(item["session_id"], Decimal("0"))) for item in arm_assignments]
        samples[variant] = values
        conversions = sum(value > 0 for value in values)
        total_revenue = sum(values)
        arms[variant.lower()] = {
            "assigned_sessions": len(values),
            "offer_exposures": sum(item["offers_shown"] for item in arm_assignments),
            "paid_sessions": conversions,
            "conversion_rate_percent": round(100 * conversions / len(values), 2) if values else 0.0,
            "total_paid_revenue": f"{total_revenue:.2f}",
            "revenue_per_eligible_session": f"{total_revenue / len(values):.2f}" if values else "0.00",
        }

    control = samples[GrowthExperimentAssignment.Variant.CONTROL]
    treatment = samples[GrowthExperimentAssignment.Variant.TREATMENT]
    control_mean = statistics.fmean(control) if control else 0.0
    treatment_mean = statistics.fmean(treatment) if treatment else 0.0
    absolute_lift = treatment_mean - control_mean
    relative_lift = (absolute_lift / control_mean * 100) if control_mean else None
    confidence_interval = None
    if len(control) >= 2 and len(treatment) >= 2:
        standard_error = math.sqrt(
            statistics.variance(control) / len(control)
            + statistics.variance(treatment) / len(treatment)
        )
        confidence_interval = {
            "lower": round(absolute_lift - 1.96 * standard_error, 2),
            "upper": round(absolute_lift + 1.96 * standard_error, 2),
            "level_percent": 95,
        }

    minimum = settings.GROWTH_EXPERIMENT_MIN_SAMPLE_PER_VARIANT
    if not settings.GROWTH_EXPERIMENT_ENABLED and not assignments:
        status = "NOT_STARTED"
        interpretation = "Enable the randomized experiment before making a revenue-lift claim."
    elif min(len(control), len(treatment)) < minimum:
        status = "COLLECTING"
        interpretation = (
            f"Collect at least {minimum} eligible real sessions in each arm before interpreting lift."
        )
    elif confidence_interval and confidence_interval["lower"] > 0:
        status = "POSITIVE_SIGNAL"
        interpretation = (
            "The randomized intent-to-treat estimate is positive at the configured 95% interval; "
            "keep the experiment running and report its population and time window."
        )
    elif confidence_interval and confidence_interval["upper"] < 0:
        status = "NEGATIVE_SIGNAL"
        interpretation = (
            "The randomized intent-to-treat estimate is negative at the configured 95% interval."
        )
    else:
        status = "INCONCLUSIVE"
        interpretation = "The current randomized estimate does not exclude zero lift."

    control_conversion = arms["control"]["conversion_rate_percent"]
    treatment_conversion = arms["treatment"]["conversion_rate_percent"]
    return {
        "enabled": settings.GROWTH_EXPERIMENT_ENABLED,
        "experiment_key": settings.GROWTH_EXPERIMENT_KEY,
        "status": status,
        "randomization_unit": "eligible agent session",
        "treatment_allocation_percent": settings.GROWTH_EXPERIMENT_TREATMENT_BPS / 100,
        "minimum_sample_per_variant": minimum,
        "metric": "merchant paid revenue per eligible agent session",
        "arms": arms,
        "estimate": {
            "absolute_revenue_lift_per_session": round(absolute_lift, 2),
            "relative_revenue_lift_percent": round(relative_lift, 2) if relative_lift is not None else None,
            "conversion_lift_percentage_points": round(treatment_conversion - control_conversion, 2),
            "confidence_interval": confidence_interval,
        },
        "interpretation": interpretation,
        "claim_boundary": (
            "This is an intent-to-treat randomized estimate for eligible sessions, not universal proof. "
            "Synthetic assignments are excluded and zero-revenue sessions remain in the denominator."
        ),
    }


def merchant_analytics_payload(merchant_id: int | None = None) -> dict[str, Any]:
    now = timezone.now()
    current_start = now - timedelta(days=ANALYTICS_WINDOW_DAYS)
    previous_start = current_start - timedelta(days=ANALYTICS_WINDOW_DAYS)

    impressions = AgentSearchImpression.objects.all()
    audits = AgentTransactionAudit.objects.select_related("order")
    losses = LostOpportunity.objects.all()
    if merchant_id is not None:
        impressions = impressions.filter(merchant_id=merchant_id)
        audits = audits.filter(merchant_id=merchant_id)
        losses = losses.filter(merchant_id=merchant_id)

    total_impressions = impressions.count()
    purchased = audits.filter(conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED)
    purchased_orders = purchased.values("order_id").distinct().count()
    conversion_rate = round((purchased_orders / total_impressions) * 100, 2) if total_impressions else 0.0
    paid_items = OrderItem.objects.filter(order__status=Order.Status.PAID)
    if merchant_id is not None:
        paid_items = paid_items.filter(merchant_id=merchant_id)
    revenue = paid_items.aggregate(total=Sum("line_total"))["total"] or Decimal("0")

    current_impressions = impressions.filter(created_at__gte=current_start).count()
    previous_impressions = impressions.filter(created_at__gte=previous_start, created_at__lt=current_start).count()
    current_conversions = purchased.filter(created_at__gte=current_start).count()
    previous_conversions = purchased.filter(created_at__gte=previous_start, created_at__lt=current_start).count()

    lost_breakdown = []
    grouped_losses = (
        losses.values("reason", "product_id", "product_title")
        .annotate(
            count=Count("id"),
            average_price=Avg("observed_price"),
            average_budget=Avg("requested_max_price"),
        )
        .order_by("-count")[:10]
    )
    for item in grouped_losses:
        if item["reason"] == LostOpportunity.Reason.PRICE:
            budget = item["average_budget"] or Decimal("0")
            message = (
                f'{item["count"]} buyers searched within about ₹{budget:,.0f}, '
                f'but {item["product_title"]} averaged ₹{item["average_price"]:,.0f}.'
            )
        else:
            message = f'{item["count"]} high-intent searches missed {item["product_title"]} because it was out of stock.'
        lost_breakdown.append(
            {
                "reason": item["reason"],
                "product_id": item["product_id"],
                "product_title": item["product_title"],
                "count": item["count"],
                "message": message,
            }
        )

    relationships = ProductRelationship.objects.select_related(
        "source_product", "related_product"
    ).all()
    offers = GrowthOffer.objects.select_related(
        "relationship__source_product", "product"
    ).all()
    if merchant_id is not None:
        relationships = relationships.filter(source_product__merchant_id=merchant_id)
        offers = offers.filter(product__merchant_id=merchant_id)

    def growth_segment(is_synthetic: bool) -> dict[str, Any]:
        scoped_offers = offers.filter(is_synthetic=is_synthetic)
        impressions_count = scoped_offers.count()
        accepted_count = scoped_offers.filter(response=GrowthOffer.Response.ACCEPTED).count()
        rejected_count = scoped_offers.filter(response=GrowthOffer.Response.REJECTED).count()
        responded_count = accepted_count + rejected_count
        attached_items = paid_items.filter(
            growth_offer__isnull=False,
            growth_offer__is_synthetic=is_synthetic,
        )
        paid_attached = attached_items.values("growth_offer_id").distinct().count()
        incremental_revenue = attached_items.aggregate(total=Sum("line_total"))["total"] or Decimal("0")
        return {
            "offer_impressions": impressions_count,
            "accepted_offers": accepted_count,
            "rejected_offers": rejected_count,
            "responded_offers": responded_count,
            "accept_rate_percent": round((accepted_count / responded_count) * 100, 2)
            if responded_count else 0.0,
            "paid_attached_offers": paid_attached,
            "paid_attachment_rate_percent": round((paid_attached / impressions_count) * 100, 2)
            if impressions_count else 0.0,
            "incremental_paid_revenue": str(incremental_revenue),
            "denominators": {
                "accept_rate": "accepted / (accepted + rejected)",
                "paid_attachment_rate": "paid attached offers / offer impressions",
            },
        }

    top_complements = list(
        paid_items.filter(growth_offer__isnull=False, growth_offer__is_synthetic=False)
        .values(
            "growth_offer__relationship__source_product__title",
            "product_id",
            "product_title",
            "growth_offer__relationship__relationship_type",
        )
        .annotate(paid_attachments=Count("growth_offer_id", distinct=True), revenue=Sum("line_total"))
        .order_by("-paid_attachments", "-revenue")[:5]
    )
    rejected_offers = list(
        offers.filter(response=GrowthOffer.Response.REJECTED, is_synthetic=False)
        .values("product_id", "product__title", "relationship__relationship_type")
        .annotate(rejections=Count("offer_id"))
        .order_by("-rejections")[:5]
    )
    compatibility_gaps = list(
        relationships.filter(is_active=True)
        .filter(Q(related_product__is_active=False) | Q(related_product__stock_quantity=0))
        .values("source_product_id", "source_product__title")
        .annotate(gap_count=Count("id"))
        .order_by("-gap_count")[:5]
    )

    return {
        "window_days": ANALYTICS_WINDOW_DAYS,
        "total_agent_impressions": total_impressions,
        "agent_conversions": purchased_orders,
        "agent_conversion_rate": conversion_rate,
        "agent_attributed_revenue": str(revenue),
        "growth": {
            "real": growth_segment(False),
            "synthetic": growth_segment(True),
            "top_converting_complements": top_complements,
            "rejected_offers": rejected_offers,
            "compatibility_gaps": compatibility_gaps,
            "attribution_note": (
                "Incremental revenue is recorded attribution for buyer-approved add-on lines on paid orders; "
                "it is not a causal lift estimate."
            ),
            "experiment": _growth_experiment_payload(merchant_id),
        },
        "lost_opportunities": {
            "total": losses.count(),
            "breakdown": lost_breakdown,
        },
        "trends": {
            "impressions_percent": _trend(current_impressions, previous_impressions),
            "conversions_percent": _trend(current_conversions, previous_conversions),
            "current_impressions": current_impressions,
            "current_conversions": current_conversions,
        },
    }
