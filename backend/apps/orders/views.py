import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from razorpay.errors import BadRequestError, GatewayError, ServerError
from requests import RequestException
from rest_framework import permissions, status, throttling
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsMerchantUser
from apps.agents.models import GrowthOffer, RecommendationDecision
from apps.merchants.models import Merchant, Product

from .idempotency import IdempotencyKeyError, request_fingerprint, require_idempotency_key
from .lifecycle import LifecycleError, release_reservations, reserve_order_inventory, transition_order
from .models import (
    AgentTransactionAudit,
    ApprovalGrant,
    Cart,
    CartItem,
    IdempotencyRecord,
    MoneyActionAudit,
    Order,
    OrderItem,
    Quote,
    QuoteItem,
)
from .policy import MESSAGES, ReasonCode, evaluate_cart_lines
from .serializers import (
    AgentTransactionAuditSerializer,
    ApproveQuoteSerializer,
    CartSerializer,
    CreateCartSerializer,
    CreateOrderSerializer,
    CreateQuoteSerializer,
    MoneyActionAuditSerializer,
    OrderSerializer,
    QuoteSerializer,
)
from .services import (
    PaymentConfigurationError,
    amount_to_subunits,
    create_razorpay_order,
    get_razorpay_client,
)
from .tokens import issue_approval_token, read_approval_token, read_decision_token, token_digest


logger = logging.getLogger(__name__)
RAZORPAY_REQUEST_ERRORS = (BadRequestError, GatewayError, ServerError)
ORDER_CREATION_ERRORS = RAZORPAY_REQUEST_ERRORS + (RequestException, KeyError, TypeError, ValueError)


class MoneyRequestError(RuntimeError):
    def __init__(self, reason_code, http_status=status.HTTP_400_BAD_REQUEST):
        self.reason_code = reason_code
        self.http_status = http_status
        super().__init__(reason_code)


def _error(reason_code, *, http_status=status.HTTP_409_CONFLICT):
    return Response({"detail": MESSAGES[reason_code], "reason_code": reason_code}, status=http_status)


def _primary_quote_item(quote):
    items = list(quote.items.all())
    return items[0] if items else None


def _record_audit(*, quote, action, outcome, reason_code, summary=None, approval=None, order=None):
    primary = _primary_quote_item(quote)
    merchant = primary.merchant if primary else quote.product.merchant
    item_payload = [
        {
            "product_id": item.product_id,
            "merchant_id": item.merchant_id,
            "quantity": item.quantity,
            "unit_price": str(item.unit_price),
            "line_total": str(item.line_total),
        }
        for item in quote.items.all()
    ]
    return MoneyActionAudit.objects.create(
        session=quote.session,
        quote=quote,
        approval=approval,
        order=order,
        merchant=merchant,
        buyer=quote.buyer,
        action=action,
        outcome=outcome,
        reason_code=reason_code,
        summary=summary or MESSAGES.get(reason_code, "Money action evaluated."),
        metadata={
            "items": item_payload,
            "policy_checks": quote.policy_snapshot.get("checks", []),
            "limits": quote.policy_snapshot.get("limits", {}),
        },
    )


def _policy_lines(quote):
    items = list(quote.items.all())
    products = {
        product.pk: product
        for product in Product.objects.select_for_update()
        .select_related("merchant__owner")
        .filter(pk__in=[item.product_id for item in items])
        .order_by("pk")
    }
    if len(products) != len(items):
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    return [
        {
            "product": products[item.product_id],
            "quantity": item.quantity,
            "expected_unit_price": item.unit_price,
        }
        for item in items
    ]


def _block_quote(quote, result, *, approval=None):
    quote.policy_snapshot = result.snapshot()
    quote.status = Quote.Status.EXPIRED if result.reason_code == ReasonCode.QUOTE_EXPIRED else Quote.Status.BLOCKED
    quote.save(update_fields=["policy_snapshot", "status", "updated_at"])
    if quote.cart_id and result.reason_code == ReasonCode.QUOTE_EXPIRED:
        quote.cart.status = Cart.Status.EXPIRED
        quote.cart.save(update_fields=["status", "updated_at"])
    _record_audit(
        quote=quote,
        approval=approval,
        action=MoneyActionAudit.Action.MONEY_BLOCKED,
        outcome="BLOCKED",
        reason_code=result.reason_code,
    )


def _validate_decision_lines(user, lines):
    decision_ids = [line["decision_id"] for line in lines]
    decisions = {
        decision.pk: decision
        for decision in RecommendationDecision.objects.select_for_update(of=("self",))
        .select_related("session", "product__merchant__owner", "growth_offer")
        .filter(pk__in=decision_ids)
    }
    if len(decisions) != len(decision_ids):
        raise MoneyRequestError(ReasonCode.DECISION_INVALID, status.HTTP_404_NOT_FOUND)
    sessions = set()
    offer_ids = [line.get("growth_offer_id") for line in lines if line.get("growth_offer_id")]
    offers = {
        offer.pk: offer
        for offer in GrowthOffer.objects.select_for_update()
        .select_related("session", "product", "relationship")
        .filter(pk__in=offer_ids)
    }
    if len(offers) != len(offer_ids):
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    if offer_ids and CartItem.objects.filter(growth_offer_id__in=offer_ids).exists():
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    validated = []
    for line in lines:
        decision = decisions[line["decision_id"]]
        try:
            payload = read_decision_token(line["decision_token"])
        except (signing.BadSignature, signing.SignatureExpired):
            raise MoneyRequestError(ReasonCode.DECISION_INVALID)
        if (
            payload.get("decision_id") != str(decision.decision_id)
            or payload.get("session_id") != str(decision.session_id)
            or payload.get("product_id") != decision.product_id
        ):
            raise MoneyRequestError(ReasonCode.DECISION_INVALID)
        if decision.session.buyer_id not in (None, user.id):
            raise MoneyRequestError(ReasonCode.DECISION_INVALID, status.HTTP_403_FORBIDDEN)
        sessions.add(decision.session_id)
        offer = offers.get(line.get("growth_offer_id"))
        decision_offer = getattr(decision, "growth_offer", None)
        if decision_offer is not None and offer != decision_offer:
            raise MoneyRequestError(ReasonCode.CART_INVALID)
        if offer and (
            offer.addon_decision_id != decision.decision_id
            or offer.session_id != decision.session_id
            or offer.product_id != decision.product_id
            or offer.response != GrowthOffer.Response.ACCEPTED
            or offer.buyer_id != user.id
            or not offer.relationship.is_active
            or not offer.product.is_active
            or offer.product.stock_quantity < line["quantity"]
            or offer.incremental_cost != offer.product.price
        ):
            raise MoneyRequestError(ReasonCode.CART_INVALID)
        validated.append((decision, line["quantity"], offer))
    if len(sessions) != 1:
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    if any(offer and offer.primary_decision_id not in decision_ids for _, _, offer in validated):
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    session = validated[0][0].session
    if session.buyer_id is None:
        session.buyer = user
        session.save(update_fields=["buyer"])
    return session, validated


def _create_cart(user, lines):
    session, validated = _validate_decision_lines(user, lines)
    cart = Cart.objects.create(buyer=user, session=session)
    CartItem.objects.bulk_create(
        [
            CartItem(
                cart=cart,
                decision=decision,
                product=decision.product,
                growth_offer=offer,
                quantity=quantity,
            )
            for decision, quantity, offer in validated
        ]
    )
    return Cart.objects.prefetch_related("items__product__merchant").get(pk=cart.pk)


def _quote_locked_cart(cart):
    if cart.status != Cart.Status.DRAFT:
        raise MoneyRequestError(ReasonCode.CART_INVALID, status.HTTP_409_CONFLICT)
    cart_items = list(
        cart.items.select_related(
            "decision", "growth_offer", "product__merchant__owner"
        ).order_by("product_id")
    )
    if not cart_items:
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    locked_products = {
        product.pk: product
        for product in Product.objects.select_for_update()
        .select_related("merchant__owner")
        .filter(pk__in=[item.product_id for item in cart_items])
        .order_by("pk")
    }
    if len(locked_products) != len(cart_items):
        raise MoneyRequestError(ReasonCode.CART_INVALID)
    lines = [
        {"product": locked_products[item.product_id], "quantity": item.quantity}
        for item in cart_items
    ]
    result = evaluate_cart_lines(lines=lines, currency=settings.MONEY_SUPPORTED_CURRENCY)
    total = sum((line["product"].price * line["quantity"] for line in lines), start=0)
    first = cart_items[0]
    quote = Quote.objects.create(
        cart=cart,
        buyer=cart.buyer,
        session=cart.session,
        decision=first.decision,
        product=first.product,
        quantity=first.quantity,
        unit_price=locked_products[first.product_id].price,
        total_amount=total,
        currency=settings.MONEY_SUPPORTED_CURRENCY,
        expires_at=timezone.now() + timedelta(seconds=settings.MONEY_QUOTE_TTL_SECONDS),
        status=Quote.Status.ACTIVE if result.allowed else Quote.Status.BLOCKED,
        policy_snapshot=result.snapshot(),
    )
    QuoteItem.objects.bulk_create(
        [
            QuoteItem(
                quote=quote,
                decision=item.decision,
                product=locked_products[item.product_id],
                growth_offer=item.growth_offer,
                merchant=locked_products[item.product_id].merchant,
                product_title=locked_products[item.product_id].title,
                merchant_name=locked_products[item.product_id].merchant.name,
                quantity=item.quantity,
                unit_price=locked_products[item.product_id].price,
                line_total=locked_products[item.product_id].price * item.quantity,
                explanation=item.decision.explanation,
                trade_offs=item.decision.trade_offs,
            )
            for item in cart_items
        ]
    )
    cart.status = Cart.Status.QUOTED
    cart.save(update_fields=["status", "updated_at"])
    quote = Quote.objects.select_related("cart", "session").prefetch_related("items").get(pk=quote.pk)
    _record_audit(
        quote=quote,
        action=MoneyActionAudit.Action.QUOTE_ALLOWED if result.allowed else MoneyActionAudit.Action.MONEY_BLOCKED,
        outcome="ALLOWED" if result.allowed else "BLOCKED",
        reason_code=result.reason_code,
    )
    return quote, result


class CartCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "order_create"

    def post(self, request):
        serializer = CreateCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                cart = _create_cart(request.user, serializer.validated_data["items"])
        except MoneyRequestError as exc:
            return _error(exc.reason_code, http_status=exc.http_status)
        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)


class CartQuoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, cart_id):
        try:
            with transaction.atomic():
                cart = Cart.objects.select_for_update().get(pk=cart_id, buyer=request.user)
                quote, result = _quote_locked_cart(cart)
        except Cart.DoesNotExist:
            return Response({"detail": "Cart not found."}, status=status.HTTP_404_NOT_FOUND)
        except MoneyRequestError as exc:
            return _error(exc.reason_code, http_status=exc.http_status)
        return Response(
            {**QuoteSerializer(quote).data, "reason_code": result.reason_code, "detail": result.message},
            status=status.HTTP_201_CREATED if result.allowed else status.HTTP_409_CONFLICT,
        )


class CreateQuoteView(APIView):
    """Backward-compatible single-line adapter; the cart and quote rows are still authoritative."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "order_create"

    def post(self, request):
        serializer = CreateQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        line = serializer.validated_data
        try:
            with transaction.atomic():
                cart = _create_cart(request.user, [line])
                cart = Cart.objects.select_for_update().get(pk=cart.pk)
                quote, result = _quote_locked_cart(cart)
        except MoneyRequestError as exc:
            return _error(exc.reason_code, http_status=exc.http_status)
        return Response(
            {**QuoteSerializer(quote).data, "reason_code": result.reason_code, "detail": result.message},
            status=status.HTTP_201_CREATED if result.allowed else status.HTTP_409_CONFLICT,
        )


def _approval_payload(grant, *, retry=False):
    return {
        "approval_token": issue_approval_token(grant),
        "grant_id": str(grant.grant_id),
        "expires_at": grant.expires_at,
        "quote": QuoteSerializer(grant.quote).data,
        "idempotent_replay": retry,
    }


class ApproveQuoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, quote_id):
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _error(exc.reason_code, http_status=status.HTTP_400_BAD_REQUEST)
        serializer = ApproveQuoteSerializer(data=request.data)
        if not serializer.is_valid():
            return _error(ReasonCode.APPROVAL_REQUIRED, http_status=status.HTTP_400_BAD_REQUEST)
        fingerprint = request_fingerprint({"quote_id": str(quote_id), "confirmed": True})
        with transaction.atomic():
            get_user_model().objects.select_for_update().only("pk").get(pk=request.user.pk)
            try:
                quote = (
                    Quote.objects.select_for_update(of=("self",))
                    .select_related("cart", "session")
                    .prefetch_related("items__product__merchant__owner")
                    .get(pk=quote_id, buyer=request.user)
                )
            except Quote.DoesNotExist:
                return Response({"detail": "Quote not found."}, status=status.HTTP_404_NOT_FOUND)
            record = IdempotencyRecord.objects.select_for_update().filter(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.QUOTE_APPROVAL,
                key=key,
            ).first()
            if record:
                if record.request_hash != fingerprint or record.quote_id != quote.quote_id:
                    return _error(ReasonCode.IDEMPOTENCY_CONFLICT)
                grant = ApprovalGrant.objects.select_related("quote").prefetch_related("quote__items").get(
                    quote=quote
                )
                return Response(_approval_payload(grant, retry=True), status=record.response_status)
            if quote.status != Quote.Status.ACTIVE:
                return _error(ReasonCode.QUOTE_NOT_APPROVED)
            result = evaluate_cart_lines(
                lines=_policy_lines(quote), currency=quote.currency, expires_at=quote.expires_at
            )
            if not result.allowed:
                _block_quote(quote, result)
                return _error(result.reason_code)
            quote.policy_snapshot = result.snapshot()
            quote.status = Quote.Status.APPROVED
            quote.save(update_fields=["policy_snapshot", "status", "updated_at"])
            grant = ApprovalGrant(
                quote=quote,
                buyer=request.user,
                expires_at=min(
                    quote.expires_at,
                    timezone.now() + timedelta(seconds=settings.MONEY_APPROVAL_TTL_SECONDS),
                ),
            )
            grant.token_digest = token_digest(str(grant.grant_id))
            grant.save()
            grant.token_digest = token_digest(issue_approval_token(grant))
            grant.save(update_fields=["token_digest"])
            IdempotencyRecord.objects.create(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.QUOTE_APPROVAL,
                key=key,
                request_hash=fingerprint,
                quote=quote,
            )
            _record_audit(
                quote=quote,
                approval=grant,
                action=MoneyActionAudit.Action.APPROVAL_GRANTED,
                outcome="ALLOWED",
                reason_code=ReasonCode.ALLOWED,
                summary="Buyer explicitly approved the exact multi-line server quote.",
            )
        return Response(_approval_payload(grant), status=status.HTTP_201_CREATED)


def _order_payload(order, *, retry=False):
    payload = OrderSerializer(order).data
    payload.update(
        {
            "amount": amount_to_subunits(order.total_amount),
            "key": settings.RAZORPAY_KEY_ID,
            "correlation_id": str(order.quote.session_id) if order.quote_id else None,
            "idempotent_replay": retry,
        }
    )
    return payload


class CreateOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "order_create"

    def post(self, request):
        try:
            key = require_idempotency_key(request)
        except IdempotencyKeyError as exc:
            return _error(exc.reason_code, http_status=status.HTTP_400_BAD_REQUEST)
        serializer = CreateOrderSerializer(data=request.data)
        if not serializer.is_valid():
            try:
                quote = Quote.objects.prefetch_related("items").get(
                    pk=request.data.get("quote_id"), buyer=request.user
                )
            except (Quote.DoesNotExist, ValueError, TypeError):
                quote = None
            if quote:
                _record_audit(
                    quote=quote,
                    action=MoneyActionAudit.Action.MONEY_BLOCKED,
                    outcome="BLOCKED",
                    reason_code=ReasonCode.APPROVAL_REQUIRED,
                )
            return _error(ReasonCode.APPROVAL_REQUIRED, http_status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        fingerprint = request_fingerprint(
            {"quote_id": str(data["quote_id"]), "approval_digest": token_digest(data["approval_token"])}
        )
        try:
            payload = read_approval_token(data["approval_token"])
        except signing.BadSignature:
            try:
                quote = Quote.objects.prefetch_related("items").get(
                    pk=data["quote_id"], buyer=request.user
                )
            except Quote.DoesNotExist:
                quote = None
            if quote:
                _record_audit(
                    quote=quote,
                    action=MoneyActionAudit.Action.MONEY_BLOCKED,
                    outcome="BLOCKED",
                    reason_code=ReasonCode.APPROVAL_TAMPERED,
                )
            return _error(ReasonCode.APPROVAL_TAMPERED, http_status=status.HTTP_400_BAD_REQUEST)
        if payload.get("quote_id") != str(data["quote_id"]):
            return _error(ReasonCode.APPROVAL_TAMPERED, http_status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            get_user_model().objects.select_for_update().only("pk").get(pk=request.user.pk)
            try:
                quote = (
                    Quote.objects.select_for_update(of=("self",))
                    .select_related("cart", "session")
                    .prefetch_related("items__product__merchant__owner")
                    .get(pk=data["quote_id"], buyer=request.user)
                )
            except Quote.DoesNotExist:
                return _error(ReasonCode.APPROVAL_INVALID, http_status=status.HTTP_404_NOT_FOUND)
            record = IdempotencyRecord.objects.select_for_update().filter(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.PAYMENT_ORDER,
                key=key,
            ).first()
            if record:
                if record.request_hash != fingerprint or record.quote_id != quote.quote_id:
                    return _error(ReasonCode.IDEMPOTENCY_CONFLICT)
                order = Order.objects.prefetch_related("items").select_related("quote").get(pk=record.order_id)
                if record.error_code:
                    return _error(record.error_code, http_status=record.response_status)
                return Response(_order_payload(order, retry=True), status=record.response_status)
            try:
                grant = ApprovalGrant.objects.select_for_update().get(
                    pk=payload.get("grant_id"), quote=quote
                )
            except ApprovalGrant.DoesNotExist:
                return _error(ReasonCode.APPROVAL_INVALID, http_status=status.HTTP_404_NOT_FOUND)
            if grant.buyer_id != request.user.id or payload.get("buyer_id") != request.user.id:
                return _error(ReasonCode.APPROVAL_OWNER_MISMATCH, http_status=status.HTTP_403_FORBIDDEN)
            if grant.token_digest != token_digest(data["approval_token"]):
                return _error(ReasonCode.APPROVAL_TAMPERED, http_status=status.HTTP_400_BAD_REQUEST)
            if grant.used_at is not None:
                return _error(ReasonCode.APPROVAL_REPLAYED)
            if grant.expires_at <= timezone.now():
                return _error(ReasonCode.APPROVAL_EXPIRED)
            if quote.status != Quote.Status.APPROVED:
                return _error(ReasonCode.QUOTE_NOT_APPROVED)
            if payload.get("total_amount") != str(quote.total_amount) or payload.get("currency") != quote.currency:
                return _error(ReasonCode.APPROVAL_TAMPERED, http_status=status.HTTP_400_BAD_REQUEST)
            result = evaluate_cart_lines(
                lines=_policy_lines(quote), currency=quote.currency, expires_at=quote.expires_at
            )
            if not result.allowed:
                _block_quote(quote, result, approval=grant)
                return _error(result.reason_code)

            first = _primary_quote_item(quote)
            order = Order.objects.create(
                buyer=request.user,
                quote=quote,
                product=first.product,
                buyer_email=request.user.email,
                quantity=sum(item.quantity for item in quote.items.all()),
                total_amount=quote.total_amount,
                currency=quote.currency,
                status=Order.Status.PAYMENT_PENDING,
            )
            OrderItem.objects.bulk_create(
                [
                    OrderItem(
                        order=order,
                        product=item.product,
                        growth_offer=item.growth_offer,
                        merchant=item.merchant,
                        product_title=item.product_title,
                        merchant_name=item.merchant_name,
                        unit_price=item.unit_price,
                        quantity=item.quantity,
                        line_total=item.line_total,
                    )
                    for item in quote.items.all()
                ]
            )
            reservation_expiry = timezone.now() + timedelta(
                seconds=settings.ORDER_RESERVATION_TTL_SECONDS
            )
            try:
                reserve_order_inventory(order, expires_at=reservation_expiry)
            except LifecycleError as exc:
                transaction.set_rollback(True)
                return _error(exc.reason_code)
            grant.used_at = timezone.now()
            grant.save(update_fields=["used_at"])
            quote.status = Quote.Status.CONSUMED
            quote.save(update_fields=["status", "updated_at"])

            try:
                client = get_razorpay_client()
                gateway_order = create_razorpay_order(client, order)
                gateway_order_id = gateway_order["id"]
                expected_amount = amount_to_subunits(order.total_amount)
                if (
                    not isinstance(gateway_order_id, str)
                    or gateway_order.get("amount") != expected_amount
                    or gateway_order.get("currency") != quote.currency
                ):
                    raise ValueError("Razorpay returned an inconsistent order payload")
            except (PaymentConfigurationError,) + ORDER_CREATION_ERRORS as exc:
                logger.warning("Razorpay order creation failed for local order %s: %s", order.order_id, exc)
                release_reservations(order)
                transition_order(order, Order.Status.PAYMENT_FAILED)
                IdempotencyRecord.objects.create(
                    buyer=request.user,
                    operation=IdempotencyRecord.Operation.PAYMENT_ORDER,
                    key=key,
                    request_hash=fingerprint,
                    quote=quote,
                    order=order,
                    response_status=status.HTTP_502_BAD_GATEWAY,
                    error_code=ReasonCode.PAYMENT_PROVIDER_ERROR,
                )
                _record_audit(
                    quote=quote, approval=grant, order=order,
                    action=MoneyActionAudit.Action.MONEY_BLOCKED, outcome="FAILED",
                    reason_code=ReasonCode.PAYMENT_PROVIDER_ERROR,
                )
                return _error(ReasonCode.PAYMENT_PROVIDER_ERROR, http_status=status.HTTP_502_BAD_GATEWAY)

            order.razorpay_order_id = gateway_order_id
            order.save(update_fields=["razorpay_order_id", "updated_at"])
            IdempotencyRecord.objects.create(
                buyer=request.user,
                operation=IdempotencyRecord.Operation.PAYMENT_ORDER,
                key=key,
                request_hash=fingerprint,
                quote=quote,
                order=order,
            )
            _record_audit(
                quote=quote, approval=grant, order=order,
                action=MoneyActionAudit.Action.RESERVATION_CREATED, outcome="ALLOWED",
                reason_code=ReasonCode.ALLOWED,
                summary="Inventory was reserved atomically for the payment window.",
            )
            _record_audit(
                quote=quote, approval=grant, order=order,
                action=MoneyActionAudit.Action.ORDER_CREATED, outcome="ALLOWED",
                reason_code=ReasonCode.ALLOWED,
                summary="Razorpay test order created for the exact reserved basket.",
            )
            for merchant_id in {item.merchant_id for item in order.items.all()}:
                AgentTransactionAudit.objects.get_or_create(
                    order=order,
                    merchant_id=merchant_id,
                    conversion_status=AgentTransactionAudit.ConversionStatus.RECOMMENDED,
                    defaults={
                        "agent_thought_summary": "Buyer approved the exact basket and inventory was reserved."
                    },
                )
        order = Order.objects.select_related("quote").prefetch_related("items").get(pk=order.pk)
        return Response(_order_payload(order), status=status.HTTP_201_CREATED)


class OrderListView(ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Order.objects.select_related("buyer", "quote").prefetch_related("items")
        try:
            merchant = self.request.user.merchant_profile
        except Merchant.DoesNotExist:
            return queryset.filter(buyer=self.request.user)
        return queryset.filter(Q(items__merchant=merchant) | Q(product__merchant=merchant)).distinct()


class OrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, order_id):
        queryset = Order.objects.select_related("quote").prefetch_related("items")
        try:
            merchant = request.user.merchant_profile
        except Merchant.DoesNotExist:
            queryset = queryset.filter(buyer=request.user)
        else:
            queryset = queryset.filter(Q(items__merchant=merchant) | Q(product__merchant=merchant))
        try:
            order = queryset.distinct().get(pk=order_id)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order).data)


class CancelOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        with transaction.atomic():
            try:
                order = (
                    Order.objects.select_for_update(of=("self",))
                    .select_related("quote__session")
                    .prefetch_related("quote__items", "reservations")
                    .get(pk=order_id, buyer=request.user)
                )
            except Order.DoesNotExist:
                return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
            if order.status == Order.Status.CANCELLED:
                return Response(OrderSerializer(order).data)
            if order.status not in {Order.Status.PAYMENT_PENDING, Order.Status.PAYMENT_FAILED}:
                return _error(ReasonCode.ORDER_NOT_CANCELLABLE)
            released = release_reservations(order)
            transition_order(order, Order.Status.CANCELLED)
            _record_audit(
                quote=order.quote,
                approval=getattr(order.quote, "approval", None),
                order=order,
                action=MoneyActionAudit.Action.ORDER_CANCELLED,
                outcome="CANCELLED",
                reason_code="BUYER_CANCELLED",
                summary="Buyer cancelled an eligible order; active reservations were released once.",
            )
            if released:
                _record_audit(
                    quote=order.quote,
                    approval=getattr(order.quote, "approval", None),
                    order=order,
                    action=MoneyActionAudit.Action.RESERVATION_RELEASED,
                    outcome="RELEASED",
                    reason_code="BUYER_CANCELLED",
                )
        return Response(OrderSerializer(order).data)


class AgentTransactionAuditListView(ListAPIView):
    serializer_class = AgentTransactionAuditSerializer
    permission_classes = [IsMerchantUser]

    def get_queryset(self):
        queryset = AgentTransactionAudit.objects.select_related("merchant", "order").prefetch_related(
            "order__items"
        )
        try:
            merchant = self.request.user.merchant_profile
        except Merchant.DoesNotExist:
            return queryset.none()
        return queryset.filter(merchant=merchant)


class MoneyActionAuditListView(ListAPIView):
    serializer_class = MoneyActionAuditSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = MoneyActionAudit.objects.select_related("buyer", "merchant", "quote", "order")
        try:
            merchant = self.request.user.merchant_profile
        except Merchant.DoesNotExist:
            return queryset.filter(buyer=self.request.user)
        return queryset.filter(merchant=merchant)
