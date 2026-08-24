import json
import logging

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from razorpay.errors import SignatureVerificationError
from razorpay.utility.utility import Utility

from .lifecycle import LifecycleError, consume_reservations, release_reservations, transition_order
from .models import AgentTransactionAudit, MoneyActionAudit, Order
from .services import amount_to_subunits


logger = logging.getLogger(__name__)


class WebhookPayloadError(ValueError):
    pass


def _payment_entity(payload: dict) -> dict:
    try:
        payment = payload["payload"]["payment"]["entity"]
    except (KeyError, TypeError) as exc:
        raise WebhookPayloadError("Missing payment entity") from exc
    if not isinstance(payment, dict):
        raise WebhookPayloadError("Invalid payment entity")
    return payment


def _money_audit(order, *, action, outcome, reason_code, summary, metadata):
    quote = order.quote
    primary = quote.items.first()
    MoneyActionAudit.objects.create(
        session=quote.session,
        quote=quote,
        approval=getattr(quote, "approval", None),
        order=order,
        merchant=primary.merchant,
        buyer=order.buyer,
        action=action,
        outcome=outcome,
        reason_code=reason_code,
        summary=summary,
        metadata=metadata,
    )


@transaction.atomic
def _capture_payment(payment: dict, webhook_signature: str) -> tuple[Order, bool]:
    razorpay_order_id = payment.get("order_id")
    payment_id = payment.get("id")
    if not razorpay_order_id or not payment_id:
        raise WebhookPayloadError("Payment identifiers are missing")
    try:
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("quote__session")
            .prefetch_related("quote__items__merchant", "items__merchant", "reservations")
            .get(razorpay_order_id=razorpay_order_id)
        )
    except Order.DoesNotExist as exc:
        raise WebhookPayloadError("Unknown Razorpay order") from exc

    if order.status in {Order.Status.PAID, Order.Status.REFUND_PENDING}:
        if order.razorpay_payment_id != payment_id:
            raise WebhookPayloadError("Order is already linked to another payment")
        return order, False
    if payment.get("status") != "captured" or payment.get("currency") != order.currency:
        raise WebhookPayloadError("Payment is not a captured payment in the order currency")
    if payment.get("amount") != amount_to_subunits(order.total_amount):
        raise WebhookPayloadError("Payment amount does not match the local order")

    order.razorpay_payment_id = payment_id
    order.razorpay_signature = webhook_signature
    order.save(update_fields=["razorpay_payment_id", "razorpay_signature", "updated_at"])
    try:
        consumed = consume_reservations(order)
    except LifecycleError:
        transition_order(order, Order.Status.REFUND_PENDING)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.MONEY_BLOCKED,
            outcome="REFUND_PENDING",
            reason_code="CAPTURE_WITHOUT_RESERVATION",
            summary="A verified late capture arrived after inventory release and requires bounded refund handling.",
            metadata={"signature_verified": True, "inventory_mutated": False},
        )
        return order, True

    transition_order(order, Order.Status.PAID)
    for merchant_id in {item.merchant_id for item in order.items.all()}:
        AgentTransactionAudit.objects.get_or_create(
            order=order,
            merchant_id=merchant_id,
            conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED,
            defaults={
                "agent_thought_summary": (
                    "Verified Razorpay capture consumed reserved inventory exactly once."
                )
            },
        )
    _money_audit(
        order,
        action=MoneyActionAudit.Action.PAYMENT_CAPTURED,
        outcome="PAID",
        reason_code="WEBHOOK_VERIFIED",
        summary="Verified Razorpay capture consumed the existing reservation; no second stock deduction occurred.",
        metadata={
            "signature_verified": True,
            "reservation_consumed": consumed,
            "inventory_mutated_at_capture": False,
        },
    )
    return order, True


@transaction.atomic
def _fail_payment(payment: dict) -> bool:
    razorpay_order_id = payment.get("order_id")
    if not razorpay_order_id:
        return False
    try:
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("quote__session")
            .prefetch_related("quote__items__merchant", "items__merchant", "reservations")
            .get(razorpay_order_id=razorpay_order_id)
        )
    except Order.DoesNotExist:
        return False
    if order.status != Order.Status.PAYMENT_PENDING:
        return False
    released = release_reservations(order)
    order.razorpay_payment_id = payment.get("id") or None
    order.save(update_fields=["razorpay_payment_id", "updated_at"])
    transition_order(order, Order.Status.PAYMENT_FAILED)
    for merchant_id in {item.merchant_id for item in order.items.all()}:
        AgentTransactionAudit.objects.get_or_create(
            order=order,
            merchant_id=merchant_id,
            conversion_status=AgentTransactionAudit.ConversionStatus.REJECTED,
            defaults={
                "agent_thought_summary": "Verified payment failure released reserved inventory exactly once."
            },
        )
    _money_audit(
        order,
        action=MoneyActionAudit.Action.PAYMENT_FAILED,
        outcome="FAILED",
        reason_code="PAYMENT_FAILED",
        summary="Razorpay reported payment failure; active reservations were released exactly once.",
        metadata={
            "signature_verified": True,
            "reservation_released": released,
            "inventory_available_again": released,
        },
    )
    return True


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not webhook_secret:
        return JsonResponse({"detail": "Webhook verification is not configured."}, status=503)
    if not signature:
        return JsonResponse({"detail": "Missing Razorpay signature."}, status=400)
    try:
        raw_body = request.body.decode("utf-8")
    except UnicodeDecodeError:
        return JsonResponse({"detail": "Webhook body must be valid UTF-8."}, status=400)
    try:
        Utility().verify_webhook_signature(raw_body, signature, webhook_secret)
    except SignatureVerificationError:
        logger.warning("Rejected Razorpay webhook with an invalid signature")
        return JsonResponse({"detail": "Invalid webhook signature."}, status=400)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid webhook JSON."}, status=400)

    event = payload.get("event")
    try:
        if event == "payment.captured":
            order, processed = _capture_payment(_payment_entity(payload), signature)
            return JsonResponse(
                {
                    "status": "processed" if processed else "already_processed",
                    "order_id": str(order.order_id),
                    "order_status": order.status,
                }
            )
        if event == "payment.failed":
            processed = _fail_payment(_payment_entity(payload))
            return JsonResponse({"status": "processed" if processed else "already_processed"})
    except WebhookPayloadError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    return JsonResponse({"status": "ignored", "event": event, "received_at": timezone.now().isoformat()})
