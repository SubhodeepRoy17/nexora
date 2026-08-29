"""ACP 2026-04-17 checkout-session compatibility profile.

Nexora keeps Razorpay Checkout as a human-present payment handoff. The ACP
adapter therefore maps ACP session resources to Nexora's exact Quote and Order
state while exposing a small explicit-approval extension. It never treats an
agent-supplied payment result as settlement authority.
"""

from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers, status, throttling
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agents.models import AgentSession, RecommendationDecision
from apps.merchants.models import Product
from apps.orders.idempotency import IdempotencyKeyError, request_fingerprint, require_idempotency_key
from apps.orders.models import Cart, CartItem, IdempotencyRecord, Order, Quote
from apps.orders.policy import MESSAGES
from apps.orders.services import amount_to_subunits
from apps.orders.views import ApproveQuoteView, CancelOrderView, CreateOrderView, MoneyRequestError, _quote_locked_cart


ACP_VERSION = "2026-04-17"
ACP_TOKEN_SALT = "nexora.acp.buyer.v1"
ACP_HANDLER_ID = "nexora_razorpay_test"
ACP_HANDLER_NAME = "in.nexora.razorpay_test_checkout"


def _protocol_error(code, message):
    return {"type": "invalid_request", "code": code, "message": message}


class ACPVersionError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "unsupported_api_version"


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError(
                    {name: ["This field is not supported by this profile."] for name in unknown}
                )
        return super().to_internal_value(data)


def issue_acp_buyer_token(user):
    return signing.dumps({"buyer_id": user.pk}, salt=ACP_TOKEN_SALT, compress=True)


class ACPBearerAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header:
            raise AuthenticationFailed(
                _protocol_error("authentication_required", "A valid ACP bearer token is required.")
            )
        if len(header) != 2 or header[0].lower() != b"bearer":
            raise AuthenticationFailed(
                _protocol_error("authentication_required", "A valid ACP bearer token is required.")
            )
        try:
            payload = signing.loads(
                header[1].decode(),
                salt=ACP_TOKEN_SALT,
                max_age=settings.ACP_BUYER_TOKEN_TTL_SECONDS,
            )
            user = get_user_model().objects.get(pk=payload["buyer_id"], is_active=True)
        except (signing.BadSignature, KeyError, ValueError, get_user_model().DoesNotExist) as exc:
            raise AuthenticationFailed(
                _protocol_error(
                    "authentication_required", "The ACP bearer token is invalid or expired."
                )
            ) from exc
        return user, header[1].decode()


class ACPItemSerializer(StrictSerializer):
    id = serializers.CharField(max_length=80)
    name = serializers.CharField(max_length=255, required=False)
    unit_amount = serializers.IntegerField(min_value=0, required=False)


class ACPCreateSerializer(StrictSerializer):
    line_items = ACPItemSerializer(many=True, allow_empty=False)
    currency = serializers.CharField(max_length=3)
    capabilities = serializers.JSONField()
    buyer = serializers.JSONField(required=False)
    metadata = serializers.JSONField(required=False)
    locale = serializers.CharField(max_length=40, required=False)
    timezone = serializers.CharField(max_length=80, required=False)
    fulfillment_details = serializers.JSONField(required=False)
    fulfillment_groups = serializers.JSONField(required=False)
    affiliate_attribution = serializers.JSONField(required=False)
    coupons = serializers.ListField(child=serializers.CharField(), required=False)
    discounts = serializers.JSONField(required=False)
    quote_id = serializers.CharField(required=False)
    order_notes = serializers.CharField(max_length=5000, required=False)

    def validate_currency(self, value):
        value = value.upper()
        if value != settings.MONEY_SUPPORTED_CURRENCY:
            raise serializers.ValidationError("Only INR is supported by this Razorpay Test profile.")
        return value

    def validate_line_items(self, value):
        if len(value) > settings.ORDER_MAX_CART_ITEMS:
            raise serializers.ValidationError("The checkout contains too many items.")
        try:
            ids = [int(item["id"]) for item in value]
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError("Every item id must be a Nexora catalog product id.") from exc
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Duplicate line items are not supported.")
        return value


class ACPCompleteSerializer(StrictSerializer):
    payment_data = serializers.JSONField()
    buyer = serializers.JSONField(required=False)
    authentication_result = serializers.JSONField(required=False)
    affiliate_attribution = serializers.JSONField(required=False)
    risk_signals = serializers.JSONField(required=False)
    marketing_consents = serializers.JSONField(required=False)
    order_notes = serializers.CharField(max_length=5000, required=False)

    def validate_payment_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Payment data must be an object.")
        if value.get("handler_id") != ACP_HANDLER_ID:
            raise serializers.ValidationError("The advertised Razorpay Test handler is required.")
        instrument = value.get("instrument") or {}
        if not isinstance(instrument, dict):
            raise serializers.ValidationError("The payment instrument must be an object.")
        credential = instrument.get("credential") or {}
        if not isinstance(credential, dict):
            raise serializers.ValidationError("The approval credential must be an object.")
        token = credential.get("token")
        if not isinstance(token, str) or len(token) < 20:
            raise serializers.ValidationError("A human-approved Nexora grant is required.")
        return value


def _acp_error(code, message, *, http_status=400, param=None):
    payload = {"type": "invalid_request", "code": code, "message": message}
    if param:
        payload["param"] = param
    return Response(payload, status=http_status)


def _acp_status(quote):
    order = getattr(quote, "order", None)
    if order:
        return {
            Order.Status.PAID: "completed",
            Order.Status.CANCELLED: "canceled",
            Order.Status.EXPIRED: "expired",
            Order.Status.PAYMENT_FAILED: "requires_escalation",
            Order.Status.MANUAL_REVIEW: "requires_escalation",
        }.get(order.status, "complete_in_progress")
    return {
        Quote.Status.ACTIVE: "pending_approval",
        Quote.Status.APPROVED: "ready_for_payment",
        Quote.Status.CONSUMED: "complete_in_progress",
        Quote.Status.BLOCKED: "not_ready_for_payment",
        Quote.Status.EXPIRED: "expired",
    }[quote.status]


def _handler(request):
    return {
        "id": ACP_HANDLER_ID,
        "name": ACP_HANDLER_NAME,
        "display_name": "Razorpay Test Checkout",
        "version": ACP_VERSION,
        "spec": request.build_absolute_uri("/api/commerce/v1/acp/payment-handler.json"),
        "requires_delegate_payment": False,
        "requires_pci_compliance": False,
        "psp": "razorpay",
        "config_schema": request.build_absolute_uri(
            "/api/commerce/v1/acp/schemas/razorpay-test-handler.json"
        ),
        "instrument_schemas": [],
        "config": {
            "environment": "test_mode_only",
            "human_present": True,
            "settlement_authority": "verified_webhook_or_exact_provider_reconciliation",
        },
    }


def _total(amount):
    return {"type": "total", "display_text": "Total", "amount": amount_to_subunits(amount)}


def _session_payload(request, quote, *, checkout_payload=None):
    quote = (
        Quote.objects.select_related("session", "order")
        .prefetch_related("items__product", "order__items")
        .get(pk=quote.pk)
    )
    acp_state = _acp_status(quote)
    messages = []
    if acp_state == "pending_approval":
        messages.append({
            "type": "error",
            "code": "approval_required",
            "severity": "high",
            "resolution": "requires_buyer_review",
            "content_type": "plain",
            "content": "The buyer must review and approve this exact expiring quote.",
        })
    if quote.status == Quote.Status.BLOCKED:
        messages.append({
            "type": "error",
            "code": "quantity_exceeded" if quote.policy_snapshot.get("reason_code") == "QUANTITY_LIMIT_EXCEEDED" else "invalid",
            "severity": "high",
            "resolution": "recoverable",
            "content_type": "plain",
            "content": MESSAGES.get(quote.policy_snapshot.get("reason_code"), "The checkout is outside the configured policy."),
        })
    line_items = [
        {
            "id": str(item.pk),
            "item": {"id": str(item.product_id), "name": item.product_title, "unit_amount": amount_to_subunits(item.unit_price)},
            "quantity": item.quantity,
            "name": item.product_title,
            "description": item.explanation,
            "images": [item.product.image_url] if item.product.image_url else [],
            "unit_amount": amount_to_subunits(item.unit_price),
            "product_id": str(item.product_id),
            "category": item.product.category,
            "availability_status": "in_stock",
            "available_quantity": item.product.stock_quantity,
            "max_quantity_per_order": settings.MONEY_MAX_ITEM_QUANTITY,
            "totals": [_total(item.line_total)],
        }
        for item in quote.items.all()
    ]
    payload = {
        "id": str(quote.quote_id),
        "protocol": {"version": ACP_VERSION},
        "status": acp_state,
        "currency": quote.currency,
        "line_items": line_items,
        "totals": [_total(quote.total_amount)],
        "fulfillment_options": [],
        "messages": messages,
        "links": [],
        "capabilities": {"payment": {"handlers": [_handler(request)]}},
        "created_at": quote.created_at,
        "updated_at": quote.updated_at,
        "expires_at": quote.expires_at,
        "quote_id": str(quote.quote_id),
        "quote_expires_at": quote.expires_at,
        "metadata": {
            "nexora": {
                "approval_url": request.build_absolute_uri(
                    f"/api/commerce/v1/acp/checkout_sessions/{quote.quote_id}/approve"
                ),
                "money_policy_url": request.build_absolute_uri(
                    "/api/commerce/v1/policies/money-actions/"
                ),
                "browser_callback_can_settle": False,
            }
        },
    }
    order = getattr(quote, "order", None)
    if order:
        order_status = "confirmed" if order.status == Order.Status.PAID else (
            "canceled" if order.status == Order.Status.CANCELLED else "processing"
        )
        payload["order"] = {
            "id": str(order.order_id),
            "checkout_session_id": str(quote.quote_id),
            "order_number": str(order.order_id).split("-")[0].upper(),
            "permalink_url": request.build_absolute_uri(
                f"/api/commerce/v1/orders/{order.order_id}/"
            ),
            "status": order_status,
            "line_items": [
                {
                    "id": str(item.pk),
                    "title": item.product_title,
                    "product_id": str(item.product_id),
                    "quantity": {
                        "ordered": item.quantity,
                        "current": item.quantity,
                        "fulfilled": item.quantity if order.status == Order.Status.PAID else 0,
                    },
                    "unit_price": amount_to_subunits(item.unit_price),
                    "subtotal": amount_to_subunits(item.line_total),
                    "status": "fulfilled" if order.status == Order.Status.PAID else "processing",
                }
                for item in order.items.all()
            ],
            "totals": [_total(order.total_amount)],
        }
        razorpay = {
            "key": settings.RAZORPAY_KEY_ID,
            "amount": amount_to_subunits(order.total_amount),
            "currency": order.currency,
            "order_id": order.razorpay_order_id,
            "name": "Nexora",
            "description": "Human-approved ACP checkout",
        }
        if checkout_payload:
            razorpay.update({key: checkout_payload[key] for key in ("key", "amount") if key in checkout_payload})
        payload["metadata"]["nexora"]["razorpay_checkout"] = razorpay
        payload["metadata"]["nexora"]["order_status_url"] = payload["order"]["permalink_url"]
    return payload


class ACPHeadersMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.headers.get("API-Version") != ACP_VERSION:
            raise ACPVersionError(
                {
                    **_protocol_error(
                        "unsupported_api_version", f"API-Version must be {ACP_VERSION}."
                    ),
                    "supported_versions": [ACP_VERSION],
                }
            )

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["API-Version"] = ACP_VERSION
        if request.headers.get("Idempotency-Key"):
            response["Idempotency-Key"] = request.headers["Idempotency-Key"]
        if request.headers.get("Request-Id"):
            response["Request-Id"] = request.headers["Request-Id"]
        return response


class ACPBuyerTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({
            "access_token": issue_acp_buyer_token(request.user),
            "token_type": "Bearer",
            "expires_in": settings.ACP_BUYER_TOKEN_TTL_SECONDS,
            "scope": "nexora:acp:checkout",
        }, status=status.HTTP_201_CREATED)


class ACPDiscoveryView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "protocol": {
                    "name": "acp",
                    "version": ACP_VERSION,
                    "supported_versions": [ACP_VERSION],
                },
                "api_base_url": request.build_absolute_uri("/api/commerce/v1/acp"),
                "transports": ["rest"],
                "capabilities": {
                    "services": ["checkout"],
                    "extensions": [],
                    "intervention_types": [],
                    "supported_currencies": [settings.MONEY_SUPPORTED_CURRENCY.lower()],
                    "supported_locales": ["en-IN"],
                },
            }
        )


class ACPPaymentHandlerView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "name": ACP_HANDLER_NAME,
            "version": ACP_VERSION,
            "profile": "human_present_razorpay_test_handoff",
            "approval": "An exact Nexora quote grant must be obtained after buyer review.",
            "settlement": "Only a verified Razorpay webhook or exact provider reconciliation settles payment.",
            "credential_transfer": False,
        })


class ACPHandlerSchemaView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": request.build_absolute_uri(),
            "title": "Nexora Razorpay Test ACP handler configuration",
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "environment": {"const": "test_mode_only"},
                "human_present": {"const": True},
                "settlement_authority": {
                    "const": "verified_webhook_or_exact_provider_reconciliation"
                },
            },
            "required": ["environment", "human_present", "settlement_authority"],
        })


class ACPCheckoutBase(ACPHeadersMixin, APIView):
    authentication_classes = [ACPBearerAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "order_create"

    def quote(self, request, checkout_session_id):
        try:
            return Quote.objects.get(pk=checkout_session_id, buyer=request.user)
        except (Quote.DoesNotExist, ValueError):
            return None


class ACPCheckoutCollectionView(ACPCheckoutBase):
    def post(self, request):
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _acp_error("missing", MESSAGES[exc.reason_code], param="$.headers.Idempotency-Key")
        serializer = ACPCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return _acp_error("invalid", "The ACP checkout request is invalid.", http_status=422)
        data = serializer.validated_data
        product_ids = [int(item["id"]) for item in data["line_items"]]
        fingerprint = request_fingerprint({"acp_version": ACP_VERSION, "payload": request.data})
        with transaction.atomic():
            record = IdempotencyRecord.objects.select_for_update().filter(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.COMMERCE_QUOTE,
                key=key,
            ).select_related("quote").first()
            if record:
                if record.request_hash != fingerprint:
                    return _acp_error("conflict", "The idempotency key was used for another request.", http_status=422)
                response = Response(_session_payload(request, record.quote), status=record.response_status)
                response["Idempotent-Replayed"] = "true"
                return response
            products = {
                product.pk: product
                for product in Product.objects.select_for_update()
                .select_related("merchant__owner")
                .filter(pk__in=product_ids, is_active=True, stock_quantity__gt=0)
                .order_by("pk")
            }
            if len(products) != len(product_ids):
                return _acp_error("out_of_stock", "One or more products are unavailable.", http_status=422)
            intent = str((data.get("metadata") or {}).get("intent") or "ACP checkout selection")[:2000]
            session = AgentSession.objects.create(
                buyer=request.user,
                user_request=intent,
                parsed_constraints={"source": "acp_2026_04_17"},
                catalog_candidate_ids=product_ids,
                provider_source=AgentSession.Source.FALLBACK,
                decision_summary="ACP buyer selected live catalog products; deterministic policy remains authoritative.",
            )
            decisions = {}
            for rank, product_id in enumerate(product_ids, start=1):
                product = products[product_id]
                decisions[product_id] = RecommendationDecision.objects.create(
                    session=session,
                    product=product,
                    rank=rank,
                    explanation="Selected through the ACP checkout-session compatibility profile.",
                    trade_offs=[],
                    catalog_snapshot={
                        "title": product.title,
                        "merchant": product.merchant.name,
                        "unit_price": str(product.price),
                        "currency": data["currency"],
                        "stock_quantity": product.stock_quantity,
                        "source": f"acp_{ACP_VERSION}",
                    },
                )
            cart = Cart.objects.create(buyer=request.user, session=session)
            CartItem.objects.bulk_create([
                CartItem(cart=cart, decision=decisions[product_id], product=products[product_id], quantity=1)
                for product_id in product_ids
            ])
            try:
                quote, result = _quote_locked_cart(Cart.objects.select_for_update().get(pk=cart.pk))
            except MoneyRequestError as exc:
                return _acp_error("invalid", MESSAGES[exc.reason_code], http_status=422)
            IdempotencyRecord.objects.create(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.COMMERCE_QUOTE,
                key=key,
                request_hash=fingerprint,
                quote=quote,
                response_status=201,
                error_code="" if result.allowed else result.reason_code,
            )
        return Response(_session_payload(request, quote), status=status.HTTP_201_CREATED)


class ACPCheckoutDetailView(ACPCheckoutBase):
    def get(self, request, checkout_session_id):
        quote = self.quote(request, checkout_session_id)
        return _acp_error("not_found", "Checkout session not found.", http_status=404) if quote is None else Response(_session_payload(request, quote))

    def post(self, request, checkout_session_id):
        try:
            require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _acp_error(
                "missing",
                MESSAGES[exc.reason_code],
                param="$.headers.Idempotency-Key",
            )
        quote = self.quote(request, checkout_session_id)
        if quote is None:
            return _acp_error("not_found", "Checkout session not found.", http_status=404)
        requested_items = request.data.get("line_items")
        if requested_items:
            if not isinstance(requested_items, list) or not all(
                isinstance(item, dict) for item in requested_items
            ):
                return _acp_error(
                    "invalid",
                    "Line items must be an array of item objects.",
                    http_status=422,
                    param="$.line_items",
                )
            requested = [str(item.get("id")) for item in requested_items]
            current = [str(item.product_id) for item in quote.items.order_by("pk")]
            if requested != current:
                return _acp_error(
                    "unsupported",
                    "Item replacement requires a new exact checkout session in this human-present profile.",
                    http_status=422,
                    param="$.line_items",
                )
        return Response(_session_payload(request, quote))


class ACPCheckoutApproveView(ACPCheckoutBase):
    def post(self, request, checkout_session_id):
        if request.data.get("confirmed") is not True:
            return _acp_error("approval_required", "Explicit confirmation of the exact quote is required.", http_status=422)
        quote = self.quote(request, checkout_session_id)
        if quote is None:
            return _acp_error("not_found", "Checkout session not found.", http_status=404)
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _acp_error("missing", MESSAGES[exc.reason_code])
        native_request = SimpleNamespace(
            user=request.user,
            data={"confirmed": True},
            headers={"Idempotency-Key": key},
        )
        native_response = ApproveQuoteView().post(native_request, quote.pk)
        if native_response.status_code >= 400:
            return _acp_error("approval_required", native_response.data.get("detail", "Approval failed."), http_status=native_response.status_code)
        return Response({
            "checkout_session": _session_payload(request, quote),
            "approval_token": native_response.data["approval_token"],
            "expires_at": native_response.data["expires_at"],
        }, status=status.HTTP_201_CREATED)


class ACPCheckoutCompleteView(ACPCheckoutBase):
    def post(self, request, checkout_session_id):
        quote = self.quote(request, checkout_session_id)
        if quote is None:
            return _acp_error("not_found", "Checkout session not found.", http_status=404)
        serializer = ACPCompleteSerializer(data=request.data)
        if not serializer.is_valid():
            return _acp_error("approval_required", "A valid human-approved grant is required.", http_status=422)
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _acp_error("missing", MESSAGES[exc.reason_code])
        credential = serializer.validated_data["payment_data"]["instrument"]["credential"]
        native_request = SimpleNamespace(
            user=request.user,
            data={"quote_id": quote.pk, "approval_token": credential["token"]},
            headers={"Idempotency-Key": key},
        )
        native_response = CreateOrderView().post(native_request)
        if native_response.status_code >= 400:
            code = native_response.data.get("reason_code", "invalid")
            return _acp_error("invalid", native_response.data.get("detail", code), http_status=native_response.status_code)
        quote.refresh_from_db()
        return Response(_session_payload(request, quote, checkout_payload=native_response.data))


class ACPCheckoutCancelView(ACPCheckoutBase):
    def post(self, request, checkout_session_id):
        try:
            require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _acp_error(
                "missing",
                MESSAGES[exc.reason_code],
                param="$.headers.Idempotency-Key",
            )
        quote = self.quote(request, checkout_session_id)
        if quote is None:
            return _acp_error("not_found", "Checkout session not found.", http_status=404)
        order = getattr(quote, "order", None)
        if order:
            native_request = SimpleNamespace(user=request.user, data={}, headers=request.headers)
            native_response = CancelOrderView().post(native_request, order.pk)
            if native_response.status_code >= 400:
                return _acp_error("conflict", "This checkout can no longer be canceled.", http_status=405)
        elif quote.status in {Quote.Status.ACTIVE, Quote.Status.APPROVED}:
            quote.status = Quote.Status.EXPIRED
            quote.save(update_fields=["status", "updated_at"])
            if quote.cart_id:
                Cart.objects.filter(pk=quote.cart_id).update(status=Cart.Status.CANCELLED, updated_at=timezone.now())
        return Response(_session_payload(request, quote))
