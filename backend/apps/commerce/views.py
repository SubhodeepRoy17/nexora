import hashlib
import json
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.http import http_date, parse_http_date_safe
from rest_framework import permissions, status, throttling
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agents.models import AgentSession, RecommendationDecision
from apps.merchants.models import Merchant, Product, ProductRelationship
from apps.orders.idempotency import IdempotencyKeyError, request_fingerprint, require_idempotency_key
from apps.orders.models import Cart, CartItem, IdempotencyRecord
from apps.orders.policy import MESSAGES
from apps.orders.serializers import QuoteSerializer
from apps.orders.views import (
    ApproveQuoteView,
    CreateOrderView,
    MoneyRequestError,
    OrderDetailView,
    _quote_locked_cart,
)

from .contracts import API_VERSION, CONTRACT_VERSION, openapi_document, product_schema
from .pagination import CommerceCursorPagination
from .serializers import (
    CommerceQuoteRequestSerializer,
    PublicMerchantSerializer,
    PublicProductSerializer,
)


CATALOG_FILTERS = {
    "q", "category", "merchant_id", "min_price", "max_price", "updated_after",
    "cursor", "page_size", "format",
}


def commerce_error(code, message, *, http_status=400, correlation_id=None):
    return Response(
        {
            "error": {
                "code": code,
                "message": message,
                "correlation_id": str(correlation_id) if correlation_id else None,
            }
        },
        status=http_status,
    )


class ContractHeadersMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["X-Nexora-Contract-Version"] = CONTRACT_VERSION
        return response


class PublicContractView(ContractHeadersMixin, APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]


def _absolute(request, path):
    # Django correctly quotes arbitrary URI characters, but these two fields
    # are RFC 6570-style templates and their variables must remain visible.
    return request.build_absolute_uri(path).replace("%7B", "{").replace("%7D", "}")


class CapabilityView(PublicContractView):
    def get(self, request):
        base = request.build_absolute_uri("/").rstrip("/")
        return Response(
            {
                "name": "Nexora Agent Commerce",
                "contract_version": CONTRACT_VERSION,
                "api_version": API_VERSION,
                "environment": "test_mode_only",
                "catalog": {
                    "products_url": _absolute(request, "/api/commerce/v1/catalog/products/"),
                    "merchants_url": _absolute(request, "/api/commerce/v1/catalog/merchants/"),
                    "pagination": "cursor",
                    "schema_url": _absolute(
                        request, "/api/commerce/v1/schemas/catalog-product.json"
                    ),
                    "openapi_url": _absolute(request, "/api/commerce/v1/openapi.json"),
                },
                "transaction": {
                    "sequence": [
                        "discover", "authenticate_buyer", "quote", "present_to_human",
                        "explicit_approval", "razorpay_checkout", "poll_order_status",
                    ],
                    "quote_url": _absolute(request, "/api/commerce/v1/quotes/"),
                    "approve_url_template": _absolute(
                        request, "/api/commerce/v1/quotes/{quote_id}/approve/"
                    ),
                    "checkout_url": _absolute(
                        request, "/api/commerce/v1/checkout-orders/"
                    ),
                    "order_status_url_template": _absolute(
                        request, "/api/commerce/v1/orders/{order_id}/"
                    ),
                    "payment_handoff": "razorpay_checkout_js_test_mode",
                    "settlement_authority": "verified_razorpay_webhook",
                },
                "authentication": {
                    "type": "django_cookie_session_with_csrf",
                    "bootstrap_url": _absolute(request, "/api/auth/me/"),
                    "login_url": _absolute(request, "/api/auth/login/"),
                    "csrf_header": "X-CSRFToken",
                    "public_operations": ["capability", "catalog", "schemas", "openapi"],
                    "authenticated_operations": ["quote", "approval", "checkout", "order_status"],
                },
                "limits": {
                    "currency": settings.MONEY_SUPPORTED_CURRENCY,
                    "max_item_quantity": settings.MONEY_MAX_ITEM_QUANTITY,
                    "max_order_value": str(settings.MONEY_MAX_ORDER_VALUE),
                    "max_cart_items": settings.ORDER_MAX_CART_ITEMS,
                    "quote_ttl_seconds": settings.MONEY_QUOTE_TTL_SECONDS,
                    "approval_ttl_seconds": settings.MONEY_APPROVAL_TTL_SECONDS,
                    "catalog_page_size_default": CommerceCursorPagination.page_size,
                    "catalog_page_size_max": CommerceCursorPagination.max_page_size,
                    "idempotency_required_for": ["quote", "approval", "checkout"],
                },
                "policies": {
                    "money_actions_url": _absolute(
                        request, "/api/commerce/v1/policies/money-actions/"
                    ),
                    "human_approval_required": True,
                    "autonomous_payment_allowed": False,
                },
                "stable_error_codes": [
                    "AUTHENTICATION_REQUIRED", "INVALID_REQUEST", "FILTER_NOT_SUPPORTED",
                    "PRODUCT_UNAVAILABLE", "IDEMPOTENCY_KEY_REQUIRED",
                    "IDEMPOTENCY_KEY_INVALID", "IDEMPOTENCY_CONFLICT", "INVALID_CURSOR",
                    "CART_INVALID",
                    "QUANTITY_LIMIT_EXCEEDED", "ORDER_VALUE_LIMIT_EXCEEDED",
                    "APPROVAL_REQUIRED", "APPROVAL_EXPIRED", "APPROVAL_REPLAYED",
                    "PAYMENT_PROVIDER_ERROR",
                ],
                "protocol_positioning": {
                    "status": "nexora_native_contract",
                    "compliance_claims": [],
                    "note": "Conceptually aligned with agent commerce discovery and human authorization patterns; no ACP, AP2, x402, UAP, or other protocol compliance is claimed.",
                },
                "base_url": base,
            }
        )


def _catalog_last_modified():
    product_time = Product.objects.filter(is_active=True, stock_quantity__gt=0).aggregate(
        value=Max("updated_at")
    )["value"]
    relationship_time = ProductRelationship.objects.filter(is_active=True).aggregate(
        value=Max("updated_at")
    )["value"]
    values = [value for value in [product_time, relationship_time] if value is not None]
    return max(values) if values else None


def _etag(request, last_modified, count):
    material = json.dumps(
        {
            "version": CONTRACT_VERSION,
            "path": request.get_full_path(),
            "modified": last_modified.isoformat() if last_modified else None,
            "count": count,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return f'"{hashlib.sha256(material.encode()).hexdigest()}"'


def _not_modified(request, etag, last_modified):
    if request.headers.get("If-None-Match") == etag:
        return True
    if last_modified:
        since = parse_http_date_safe(request.headers.get("If-Modified-Since", ""))
        if since is not None and int(last_modified.timestamp()) <= since:
            return True
    return False


def _cache_response(request, response, *, count):
    last_modified = _catalog_last_modified()
    etag = _etag(request, last_modified, count)
    if _not_modified(request, etag, last_modified):
        response = HttpResponse(status=304)
    response["ETag"] = etag
    if last_modified:
        response["Last-Modified"] = http_date(last_modified.timestamp())
    response["Cache-Control"] = "public, max-age=60, must-revalidate"
    response["X-Nexora-Contract-Version"] = CONTRACT_VERSION
    return response


class ProductCatalogView(PublicContractView):
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "commerce_catalog"

    def get(self, request):
        unsupported = set(request.query_params) - CATALOG_FILTERS
        if unsupported:
            return commerce_error(
                "FILTER_NOT_SUPPORTED",
                f"Unsupported filter: {sorted(unsupported)[0]}",
            )
        q = request.query_params.get("q", "").strip()
        category = request.query_params.get("category", "").strip()
        if len(q) > 200 or len(category) > 120:
            return commerce_error("INVALID_REQUEST", "Catalog filters exceed their bounded length.")
        relationships = ProductRelationship.objects.filter(
            is_active=True,
            related_product__is_active=True,
            related_product__stock_quantity__gt=0,
        ).select_related("related_product__merchant")
        queryset = Product.objects.filter(is_active=True, stock_quantity__gt=0).select_related(
            "merchant"
        ).prefetch_related(Prefetch("outgoing_relationships", queryset=relationships))
        if q:
            queryset = queryset.filter(
                Q(title__icontains=q)
                | Q(description__icontains=q)
                | Q(category__icontains=q)
                | Q(tags__contains=[q.lower()])
            )
        if category:
            queryset = queryset.filter(category__iexact=category)
        try:
            if request.query_params.get("merchant_id"):
                queryset = queryset.filter(merchant_id=int(request.query_params["merchant_id"]))
            if request.query_params.get("min_price"):
                queryset = queryset.filter(price__gte=Decimal(request.query_params["min_price"]))
            if request.query_params.get("max_price"):
                queryset = queryset.filter(price__lte=Decimal(request.query_params["max_price"]))
        except (ValueError, InvalidOperation):
            return commerce_error("INVALID_REQUEST", "Numeric catalog filters are invalid.")
        updated_after = request.query_params.get("updated_after")
        if updated_after:
            parsed = parse_datetime(updated_after)
            if parsed is None:
                return commerce_error("INVALID_REQUEST", "updated_after must be ISO-8601.")
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            queryset = queryset.filter(updated_at__gt=parsed)
        queryset = queryset.order_by("-updated_at", "-pk")
        count = queryset.count()
        paginator = CommerceCursorPagination()
        try:
            page = paginator.paginate_queryset(queryset, request, view=self)
        except NotFound:
            return commerce_error("INVALID_CURSOR", "The catalog cursor is invalid.")
        response = paginator.get_paginated_response(
            PublicProductSerializer(page, many=True, context={"request": request}).data
        )
        return _cache_response(request, response, count=count)


class ProductDetailView(PublicContractView):
    def get(self, request, product_id):
        relationships = ProductRelationship.objects.filter(
            is_active=True,
            related_product__is_active=True,
            related_product__stock_quantity__gt=0,
        ).select_related("related_product__merchant")
        try:
            product = Product.objects.select_related("merchant").prefetch_related(
                Prefetch("outgoing_relationships", queryset=relationships)
            ).get(pk=product_id, is_active=True, stock_quantity__gt=0)
        except Product.DoesNotExist:
            return commerce_error("PRODUCT_UNAVAILABLE", "Product not found or unavailable.", http_status=404)
        response = Response(PublicProductSerializer(product, context={"request": request}).data)
        return _cache_response(request, response, count=1)


class MerchantCatalogView(PublicContractView):
    def get(self, request):
        merchants = Merchant.objects.filter(
            products__is_active=True, products__stock_quantity__gt=0
        ).distinct().order_by("name", "pk")[:100]
        data = PublicMerchantSerializer(merchants, many=True, context={"request": request}).data
        return _cache_response(request, Response({"results": data}), count=len(data))


class ProductSchemaView(PublicContractView):
    def get(self, request):
        return Response(product_schema())


class OpenAPIView(PublicContractView):
    def get(self, request):
        return Response(openapi_document(request.build_absolute_uri("/")))


class MoneyPolicyView(PublicContractView):
    def get(self, request):
        return Response(
            {
                "version": CONTRACT_VERSION,
                "human_approval_required": True,
                "browser_callback_can_settle": False,
                "settlement_authority": "verified_razorpay_webhook",
                "test_mode_required": settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE,
                "currency": settings.MONEY_SUPPORTED_CURRENCY,
                "max_item_quantity": settings.MONEY_MAX_ITEM_QUANTITY,
                "max_order_value": str(settings.MONEY_MAX_ORDER_VALUE),
                "quote_ttl_seconds": settings.MONEY_QUOTE_TTL_SECONDS,
                "approval_ttl_seconds": settings.MONEY_APPROVAL_TTL_SECONDS,
            }
        )


class CommerceQuoteView(ContractHeadersMixin, APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "order_create"

    def post(self, request):
        if not request.user.is_authenticated:
            return commerce_error(
                "AUTHENTICATION_REQUIRED", "A verified buyer session is required.", http_status=401
            )
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return commerce_error(exc.reason_code, MESSAGES[exc.reason_code])
        serializer = CommerceQuoteRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return commerce_error("INVALID_REQUEST", "Quote request validation failed.")
        data = serializer.validated_data
        fingerprint = request_fingerprint(
            {
                "intent": data["intent"],
                "items": [
                    {"product_id": item["product_id"], "quantity": item["quantity"]}
                    for item in data["items"]
                ],
            }
        )
        with transaction.atomic():
            get_user_model().objects.select_for_update().only("pk").get(pk=request.user.pk)
            record = IdempotencyRecord.objects.select_for_update().filter(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.COMMERCE_QUOTE,
                key=key,
            ).select_related("quote__session").first()
            if record:
                if record.request_hash != fingerprint:
                    return commerce_error(
                        "IDEMPOTENCY_CONFLICT", MESSAGES["IDEMPOTENCY_CONFLICT"], http_status=409
                    )
                quote = record.quote
                quote = type(quote).objects.prefetch_related("items").select_related("session").get(
                    pk=quote.pk
                )
                payload = QuoteSerializer(quote).data
                payload.update(
                    {
                        "correlation_id": str(quote.session_id),
                        "idempotent_replay": True,
                        "reason_code": record.error_code or "ALLOWED",
                        "approval_url": _absolute(
                            request, f"/api/commerce/v1/quotes/{quote.quote_id}/approve/"
                        ),
                    }
                )
                return Response(payload, status=record.response_status)
            product_ids = [item["product_id"] for item in data["items"]]
            products = {
                product.pk: product
                for product in Product.objects.select_for_update()
                .select_related("merchant")
                .filter(pk__in=product_ids, is_active=True, stock_quantity__gt=0)
                .order_by("pk")
            }
            if len(products) != len(product_ids):
                return commerce_error(
                    "PRODUCT_UNAVAILABLE", "One or more products are unavailable.", http_status=409
                )
            session = AgentSession.objects.create(
                buyer=request.user,
                user_request=data["intent"],
                parsed_constraints={"source": "external_agent_catalog_selection"},
                catalog_candidate_ids=product_ids,
                provider_source=AgentSession.Source.FALLBACK,
                decision_summary="External buyer selected live catalog products; deterministic policy remains authoritative.",
            )
            decisions = {}
            for rank, item in enumerate(data["items"], start=1):
                product = products[item["product_id"]]
                decisions[product.pk] = RecommendationDecision.objects.create(
                    session=session,
                    product=product,
                    rank=rank,
                    explanation="Selected by the external buyer from the live agent-readable catalog.",
                    trade_offs=["No model-generated comparative claim is attached to this selection."],
                    catalog_snapshot={
                        "title": product.title,
                        "merchant": product.merchant.name,
                        "unit_price": str(product.price),
                        "currency": settings.MONEY_SUPPORTED_CURRENCY,
                        "stock_quantity": product.stock_quantity,
                        "is_active": product.is_active,
                        "source": "commerce_api_v1",
                    },
                )
            cart = Cart.objects.create(buyer=request.user, session=session)
            CartItem.objects.bulk_create(
                [
                    CartItem(
                        cart=cart,
                        decision=decisions[item["product_id"]],
                        product=products[item["product_id"]],
                        quantity=item["quantity"],
                    )
                    for item in data["items"]
                ]
            )
            cart = Cart.objects.select_for_update().get(pk=cart.pk)
            try:
                quote, result = _quote_locked_cart(cart)
            except MoneyRequestError as exc:
                transaction.set_rollback(True)
                return commerce_error(exc.reason_code, MESSAGES[exc.reason_code], http_status=409)
            response_status = status.HTTP_201_CREATED if result.allowed else status.HTTP_409_CONFLICT
            IdempotencyRecord.objects.create(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.COMMERCE_QUOTE,
                key=key,
                request_hash=fingerprint,
                quote=quote,
                response_status=response_status,
                error_code="" if result.allowed else result.reason_code,
            )
        payload = QuoteSerializer(quote).data
        payload.update(
            {
                "correlation_id": str(session.session_id),
                "idempotent_replay": False,
                "reason_code": result.reason_code,
                "approval_url": _absolute(
                    request, f"/api/commerce/v1/quotes/{quote.quote_id}/approve/"
                ),
            }
        )
        return Response(payload, status=response_status)


class CommerceApproveQuoteView(ContractHeadersMixin, ApproveQuoteView):
    pass


class CommerceCreateOrderView(ContractHeadersMixin, CreateOrderView):
    pass


class CommerceOrderDetailView(ContractHeadersMixin, OrderDetailView):
    pass
