import logging
import re
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db import DatabaseError
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from apps.merchants.models import Product
from apps.orders.models import AgentTransactionAudit

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


def merchant_analytics_payload(merchant_id: int | None = None) -> dict[str, Any]:
    now = timezone.now()
    current_start = now - timedelta(days=ANALYTICS_WINDOW_DAYS)
    previous_start = current_start - timedelta(days=ANALYTICS_WINDOW_DAYS)

    impressions = AgentSearchImpression.objects.all()
    audits = AgentTransactionAudit.objects.select_related("order", "order__product")
    losses = LostOpportunity.objects.all()
    if merchant_id is not None:
        impressions = impressions.filter(merchant_id=merchant_id)
        audits = audits.filter(merchant_id=merchant_id)
        losses = losses.filter(merchant_id=merchant_id)

    total_impressions = impressions.count()
    purchased = audits.filter(conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED)
    purchased_orders = purchased.values("order_id").distinct().count()
    conversion_rate = round((purchased_orders / total_impressions) * 100, 2) if total_impressions else 0.0
    revenue = purchased.aggregate(total=Sum("order__total_amount"))["total"] or Decimal("0")

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

    return {
        "window_days": ANALYTICS_WINDOW_DAYS,
        "total_agent_impressions": total_impressions,
        "agent_conversions": purchased_orders,
        "agent_conversion_rate": conversion_rate,
        "agent_attributed_revenue": str(revenue),
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
