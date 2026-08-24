import json
import logging

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from razorpay.errors import SignatureVerificationError
from razorpay.utility.utility import Utility

from apps.merchants.models import Product

from .models import AgentTransactionAudit, Order
from .services import amount_to_subunits


logger = logging.getLogger(__name__)


class WebhookPayloadError(ValueError):
    pass


class InsufficientStockError(RuntimeError):
    pass


def _payment_entity(payload: dict) -> dict:
    try:
        payment = payload["payload"]["payment"]["entity"]
    except (KeyError, TypeError) as exc:
        raise WebhookPayloadError("Missing payment entity") from exc
    if not isinstance(payment, dict):
        raise WebhookPayloadError("Invalid payment entity")
    return payment


@transaction.atomic
def _capture_payment(payment: dict, webhook_signature: str) -> tuple[Order, bool]:
    razorpay_order_id = payment.get("order_id")
    payment_id = payment.get("id")
    if not razorpay_order_id or not payment_id:
        raise WebhookPayloadError("Payment identifiers are missing")

    try:
        order = Order.objects.select_for_update().select_related("product__merchant").get(
            razorpay_order_id=razorpay_order_id
        )
    except Order.DoesNotExist as exc:
        raise WebhookPayloadError("Unknown Razorpay order") from exc

    if order.status == Order.Status.PAID:
        if order.razorpay_payment_id != payment_id:
            raise WebhookPayloadError("Order is already linked to another payment")
        return order, False
    if order.status == Order.Status.CANCELLED:
        raise WebhookPayloadError(f"Order cannot transition from {order.status} to PAID")

    if payment.get("status") != "captured" or payment.get("currency") != "INR":
        raise WebhookPayloadError("Payment is not a captured INR payment")
    if payment.get("amount") != amount_to_subunits(order.total_amount):
        raise WebhookPayloadError("Payment amount does not match the local order")

    product = Product.objects.select_for_update().get(pk=order.product_id)
    if product.stock_quantity < order.quantity:
        raise InsufficientStockError("Captured order exceeds available stock")

    product.stock_quantity -= order.quantity
    product.save(update_fields=["stock_quantity", "updated_at"])

    order.status = Order.Status.PAID
    order.razorpay_payment_id = payment_id
    order.razorpay_signature = webhook_signature
    order.save(
        update_fields=[
            "status",
            "razorpay_payment_id",
            "razorpay_signature",
            "updated_at",
        ]
    )
    AgentTransactionAudit.objects.get_or_create(
        order=order,
        conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED,
        defaults={
            "merchant": product.merchant,
            "agent_thought_summary": (
                "Verified Razorpay payment captured; stock decremented and merchant purchase recorded."
            ),
        },
    )
    return order, True


@transaction.atomic
def _fail_payment(payment: dict) -> None:
    razorpay_order_id = payment.get("order_id")
    if not razorpay_order_id:
        return
    try:
        order = Order.objects.select_for_update().select_related("product__merchant").get(
            razorpay_order_id=razorpay_order_id
        )
    except Order.DoesNotExist:
        return
    if order.status != Order.Status.PENDING:
        return
    order.status = Order.Status.FAILED
    order.razorpay_payment_id = payment.get("id") or None
    order.save(update_fields=["status", "razorpay_payment_id", "updated_at"])
    AgentTransactionAudit.objects.get_or_create(
        order=order,
        conversion_status=AgentTransactionAudit.ConversionStatus.REJECTED,
        defaults={
            "merchant": order.product.merchant,
            "agent_thought_summary": "Razorpay reported a failed payment attempt; inventory was unchanged.",
        },
    )


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
                }
            )
        if event == "payment.failed":
            _fail_payment(_payment_entity(payload))
            return JsonResponse({"status": "processed"})
    except WebhookPayloadError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    except InsufficientStockError:
        logger.error("Captured Razorpay payment could not be fulfilled because stock is unavailable")
        return JsonResponse({"detail": "Captured payment requires manual stock reconciliation."}, status=409)

    return JsonResponse({"status": "ignored", "event": event})
