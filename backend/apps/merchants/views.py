from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsMerchantUser

from .models import Merchant, Product, ProductRelationship
from .serializers import MerchantSerializer, ProductRelationshipSerializer, ProductSerializer


CATALOG_HEALTH_CHECKS = (
    ("active", lambda product: product.is_active),
    ("in_stock", lambda product: product.stock_quantity > 0),
    ("description", lambda product: bool(product.description.strip())),
    ("specifications", lambda product: bool(product.specifications)),
    ("search_tags", lambda product: bool(product.tags)),
)


class MerchantWorkspaceView(APIView):
    """Owner-scoped source for catalog health and payment operations panels."""

    permission_classes = [IsMerchantUser]

    def get(self, request):
        from apps.orders.models import Order, ReconciliationException, WebhookEvent

        merchant = request.user.merchant_profile
        products = list(merchant.products.all())
        issue_counts = {name: 0 for name, _ in CATALOG_HEALTH_CHECKS}
        passed_checks = 0
        for product in products:
            for name, check in CATALOG_HEALTH_CHECKS:
                passed = check(product)
                passed_checks += int(passed)
                issue_counts[name] += int(not passed)
        total_checks = len(products) * len(CATALOG_HEALTH_CHECKS)
        score = round((passed_checks / total_checks) * 100) if total_checks else None

        orders = Order.objects.filter(
            Q(items__merchant=merchant) | Q(product__merchant=merchant)
        ).distinct()
        status_counts = {
            row["status"]: row["count"]
            for row in orders.values("status").annotate(count=Count("order_id"))
        }
        events = WebhookEvent.objects.filter(order__in=orders)
        event_counts = {
            row["processing_state"]: row["count"]
            for row in events.values("processing_state").annotate(count=Count("event_id"))
        }
        open_exceptions = ReconciliationException.objects.filter(
            order__in=orders, resolved_at__isnull=True
        )
        latest_values = [
            merchant.products.aggregate(value=Max("updated_at"))["value"],
            orders.aggregate(value=Max("state_updated_at"))["value"],
            events.aggregate(value=Max("received_at"))["value"],
            open_exceptions.aggregate(value=Max("last_seen_at"))["value"],
        ]
        latest = max(
            (value for value in latest_values if value is not None),
            default=merchant.created_at,
        )
        return Response({
            "merchant": MerchantSerializer(merchant).data,
            "catalog_health": {
                "score_percent": score,
                "passed_checks": passed_checks,
                "total_checks": total_checks,
                "total_products": len(products),
                "active_products": sum(product.is_active for product in products),
                "in_stock_products": sum(product.stock_quantity > 0 for product in products),
                "issue_counts": issue_counts,
                "definition": "Five equal checks per product: active, in stock, description, specifications, and search tags.",
            },
            "operations": {
                "orders_by_status": status_counts,
                "webhooks_by_state": event_counts,
                "open_reconciliation_exceptions": open_exceptions.count(),
                "latest_backend_update_at": latest,
            },
            "calculated_at": timezone.now(),
        })


class MerchantViewSet(viewsets.ModelViewSet):
    serializer_class = MerchantSerializer
    permission_classes = [IsMerchantUser]
    http_method_names = ["get", "put", "patch", "head", "options"]

    def get_queryset(self):
        return Merchant.objects.prefetch_related("products").filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsMerchantUser]

    def get_queryset(self):
        queryset = Product.objects.select_related("merchant").filter(
            merchant__owner=self.request.user
        ).annotate(
            agent_impressions=Count("agent_search_impressions", distinct=True),
            paid_conversions=Count(
                "order_items__order",
                filter=Q(order_items__order__status="PAID"),
                distinct=True,
            ),
        ).order_by("-created_at")
        category = self.request.query_params.get("category")
        is_active = self.request.query_params.get("is_active")

        if category:
            queryset = queryset.filter(category__iexact=category)
        if is_active is not None:
            normalized = is_active.lower()
            if normalized in {"true", "1"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"false", "0"}:
                queryset = queryset.filter(is_active=False)
        return queryset

    def perform_create(self, serializer):
        serializer.save(merchant=self.request.user.merchant_profile)


class ProductRelationshipViewSet(viewsets.ModelViewSet):
    serializer_class = ProductRelationshipSerializer
    permission_classes = [IsMerchantUser]

    def get_queryset(self):
        return ProductRelationship.objects.select_related(
            "source_product", "related_product"
        ).filter(source_product__merchant__owner=self.request.user)
