import hashlib
import json
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .lifecycle import LifecycleError, consume_reservations, release_reservations, transition_order
from .models import AgentTransactionAudit, MoneyActionAudit, Order, PaymentRefund, WebhookEvent
from .razorpay_gateway import SignatureVerificationError, Utility
from .services import amount_to_decimal, amount_to_subunits


logger = logging.getLogger("nexora.payments")

SUPPORTED_EVENTS = {
    "payment.authorized",
    "payment.captured",
    "order.paid",
    "payment.failed",
    "refund.created",
    "refund.processed",
    "refund.failed",
}


class WebhookPayloadError(ValueError):
    def __init__(self, error_code, message="Webhook payload could not be applied safely."):
        self.error_code = error_code
        super().__init__(message)


def _payment_entity(payload: dict) -> dict:
    try:
        payment = payload["payload"]["payment"]["entity"]
    except (KeyError, TypeError) as exc:
        raise WebhookPayloadError("PAYMENT_ENTITY_MISSING") from exc
    if not isinstance(payment, dict):
        raise WebhookPayloadError("PAYMENT_ENTITY_INVALID")
    return payment


def _refund_entity(payload: dict) -> dict:
    try:
        refund = payload["payload"]["refund"]["entity"]
    except (KeyError, TypeError) as exc:
        raise WebhookPayloadError("REFUND_ENTITY_MISSING") from exc
    if not isinstance(refund, dict):
        raise WebhookPayloadError("REFUND_ENTITY_INVALID")
    return refund


def _money_audit(order, *, action, outcome, reason_code, summary, metadata):
    if not order.quote_id or not order.buyer_id:
        return None
    primary = order.quote.items.select_related("merchant").first()
    if not primary:
        return None
    return MoneyActionAudit.objects.create(
        session=order.quote.session,
        quote=order.quote,
        approval=getattr(order.quote, "approval", None),
        order=order,
        merchant=primary.merchant,
        buyer=order.buyer,
        action=action,
        outcome=outcome,
        reason_code=reason_code,
        summary=summary,
        metadata=metadata,
    )


def _locked_order_for_payment(payment):
    razorpay_order_id = payment.get("order_id")
    if not razorpay_order_id:
        raise WebhookPayloadError("RAZORPAY_ORDER_ID_MISSING")
    try:
        return (
            Order.objects.select_for_update(of=("self",))
            .select_related("quote__session")
            .prefetch_related("quote__items__merchant", "items__merchant", "reservations")
            .get(razorpay_order_id=razorpay_order_id)
        )
    except Order.DoesNotExist as exc:
        raise WebhookPayloadError("UNKNOWN_ORDER") from exc


def _validate_payment_money(order, payment, *, require_captured=False):
    if require_captured and payment.get("status") != "captured":
        raise WebhookPayloadError("PAYMENT_NOT_CAPTURED")
    if payment.get("currency") != order.currency:
        raise WebhookPayloadError("CURRENCY_MISMATCH")
    if payment.get("amount") != amount_to_subunits(order.total_amount):
        raise WebhookPayloadError("AMOUNT_MISMATCH")


@transaction.atomic
def _capture_payment(payment: dict, webhook_signature: str = "", *, authority="WEBHOOK_VERIFIED") -> tuple[Order, bool]:
    payment_id = payment.get("id")
    if not payment_id:
        raise WebhookPayloadError("PAYMENT_ID_MISSING")
    order = _locked_order_for_payment(payment)
    _validate_payment_money(order, payment, require_captured=True)

    settled_states = {
        Order.Status.PAID,
        Order.Status.REFUND_PENDING,
        Order.Status.REFUNDED,
        Order.Status.MANUAL_REVIEW,
    }
    if order.status in settled_states:
        if order.razorpay_payment_id != payment_id:
            raise WebhookPayloadError("PAYMENT_LINK_CONFLICT")
        return order, False

    order.razorpay_payment_id = payment_id
    order.save(update_fields=["razorpay_payment_id", "updated_at"])
    try:
        consumed = consume_reservations(order)
    except LifecycleError:
        transition_order(order, Order.Status.REFUND_PENDING)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.MANUAL_REVIEW,
            outcome="REFUND_PENDING",
            reason_code="CAPTURE_WITHOUT_RESERVATION",
            summary="A verified capture arrived without an active reservation and requires a bounded operator refund.",
            metadata={"authority": authority, "inventory_mutated": False},
        )
        return order, True

    transition_order(order, Order.Status.PAID)
    for merchant_id in {item.merchant_id for item in order.items.all()}:
        AgentTransactionAudit.objects.get_or_create(
            order=order,
            merchant_id=merchant_id,
            conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED,
            defaults={"agent_thought_summary": "Verified capture consumed reserved inventory exactly once."},
        )
    _money_audit(
        order,
        action=MoneyActionAudit.Action.PAYMENT_CAPTURED,
        outcome="PAID",
        reason_code=authority,
        summary="Verified provider capture consumed the existing reservation; no second stock deduction occurred.",
        metadata={"authority": authority, "reservation_consumed": consumed, "inventory_mutated_at_capture": False},
    )
    return order, True


@transaction.atomic
def _authorize_payment(payment: dict) -> tuple[Order, bool]:
    order = _locked_order_for_payment(payment)
    _validate_payment_money(order, payment)
    if order.status != Order.Status.PAYMENT_PENDING:
        return order, False
    _money_audit(
        order,
        action=MoneyActionAudit.Action.PAYMENT_AUTHORIZED,
        outcome="PENDING",
        reason_code="PAYMENT_AUTHORIZED",
        summary="Razorpay authorized the payment; capture verification is still pending.",
        metadata={"authority": "WEBHOOK_VERIFIED", "inventory_mutated": False},
    )
    return order, True


@transaction.atomic
def _fail_payment(payment: dict) -> tuple[Order, bool]:
    order = _locked_order_for_payment(payment)
    if order.status != Order.Status.PAYMENT_PENDING:
        return order, False
    released = release_reservations(order)
    payment_id = payment.get("id")
    if payment_id:
        order.razorpay_payment_id = payment_id
        order.save(update_fields=["razorpay_payment_id", "updated_at"])
    transition_order(order, Order.Status.PAYMENT_FAILED)
    for merchant_id in {item.merchant_id for item in order.items.all()}:
        AgentTransactionAudit.objects.get_or_create(
            order=order,
            merchant_id=merchant_id,
            conversion_status=AgentTransactionAudit.ConversionStatus.REJECTED,
            defaults={"agent_thought_summary": "Verified payment failure released reserved inventory exactly once."},
        )
    _money_audit(
        order,
        action=MoneyActionAudit.Action.PAYMENT_FAILED,
        outcome="FAILED",
        reason_code="PAYMENT_FAILED",
        summary="Razorpay reported payment failure; active reservations were released exactly once.",
        metadata={"authority": "WEBHOOK_VERIFIED", "reservation_released": released},
    )
    return order, True


@transaction.atomic
def _apply_refund(refund_entity: dict, event_type: str) -> tuple[Order, bool]:
    refund_id = refund_entity.get("id")
    payment_id = refund_entity.get("payment_id")
    if not refund_id or not payment_id:
        raise WebhookPayloadError("REFUND_IDENTIFIERS_MISSING")
    try:
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("quote__session")
            .prefetch_related("quote__items__merchant", "refunds")
            .get(razorpay_payment_id=payment_id)
        )
    except Order.DoesNotExist as exc:
        raise WebhookPayloadError("UNKNOWN_REFUND_PAYMENT") from exc

    amount = refund_entity.get("amount")
    currency = refund_entity.get("currency") or order.currency
    if amount != amount_to_subunits(order.total_amount) or currency != order.currency:
        refund_amount = order.total_amount
        if isinstance(amount, int) and amount >= 0:
            refund_amount = amount_to_decimal(amount)
        refund, _ = PaymentRefund.objects.get_or_create(
            razorpay_refund_id=refund_id,
            defaults={
                "order": order,
                "razorpay_payment_id": payment_id,
                "amount": refund_amount,
                "currency": currency[:3],
                "status": PaymentRefund.Status.FAILED,
                "reason_code": "REFUND_AMOUNT_MISMATCH",
                "error_code": "REFUND_AMOUNT_MISMATCH",
                "requested_by": "RAZORPAY",
            },
        )
        if order.status != Order.Status.MANUAL_REVIEW:
            transition_order(order, Order.Status.MANUAL_REVIEW)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.MANUAL_REVIEW,
            outcome="MANUAL_REVIEW",
            reason_code="REFUND_AMOUNT_MISMATCH",
            summary="A provider refund did not match the bounded full-order amount and needs operator review.",
            metadata={"authority": "WEBHOOK_VERIFIED", "inventory_mutated": False},
        )
        return order, True

    refund = PaymentRefund.objects.select_for_update().filter(razorpay_refund_id=refund_id).first()
    created = False
    if refund is None:
        refund = PaymentRefund.objects.select_for_update().filter(
            order=order,
            razorpay_payment_id=payment_id,
            razorpay_refund_id__isnull=True,
            status=PaymentRefund.Status.PENDING,
        ).first()
        if refund:
            refund.razorpay_refund_id = refund_id
            refund.save(update_fields=["razorpay_refund_id", "updated_at"])
        else:
            refund = PaymentRefund.objects.create(
                razorpay_refund_id=refund_id,
                order=order,
                razorpay_payment_id=payment_id,
                amount=order.total_amount,
                currency=order.currency,
                reason_code="PROVIDER_REPORTED_REFUND",
                requested_by="RAZORPAY",
            )
            created = True
    if refund.order_id != order.order_id or refund.razorpay_payment_id != payment_id:
        raise WebhookPayloadError("REFUND_LINK_CONFLICT")

    target = {
        "refund.created": PaymentRefund.Status.PENDING,
        "refund.processed": PaymentRefund.Status.PROCESSED,
        "refund.failed": PaymentRefund.Status.FAILED,
    }[event_type]
    if refund.status == PaymentRefund.Status.PROCESSED:
        return order, False
    if refund.status == PaymentRefund.Status.FAILED and target == PaymentRefund.Status.PENDING:
        return order, False
    if refund.status == target and not created:
        return order, False
    refund.status = target
    refund.error_code = "REFUND_PROVIDER_FAILED" if target == PaymentRefund.Status.FAILED else ""
    refund.processed_at = timezone.now() if target == PaymentRefund.Status.PROCESSED else None
    refund.save(update_fields=["status", "error_code", "processed_at", "updated_at"])

    if target == PaymentRefund.Status.PROCESSED:
        if order.status == Order.Status.PAID:
            transition_order(order, Order.Status.REFUND_PENDING)
        if order.status in {Order.Status.REFUND_PENDING, Order.Status.MANUAL_REVIEW}:
            transition_order(order, Order.Status.REFUNDED)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.REFUND_PROCESSED,
            outcome="REFUNDED",
            reason_code="REFUND_WEBHOOK_VERIFIED",
            summary="Razorpay confirmed the bounded full-order refund.",
            metadata={"authority": "WEBHOOK_VERIFIED", "inventory_mutated": False},
        )
    elif target == PaymentRefund.Status.FAILED:
        if order.status != Order.Status.MANUAL_REVIEW:
            transition_order(order, Order.Status.MANUAL_REVIEW)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.REFUND_FAILED,
            outcome="MANUAL_REVIEW",
            reason_code="REFUND_PROVIDER_FAILED",
            summary="Razorpay could not process the refund; an operator must resolve it.",
            metadata={"authority": "WEBHOOK_VERIFIED", "inventory_mutated": False},
        )
    elif order.status == Order.Status.PAID:
        transition_order(order, Order.Status.REFUND_PENDING)
    return order, True


def _dispatch_event(payload, event_type):
    if event_type == "payment.authorized":
        return _authorize_payment(_payment_entity(payload))
    if event_type in {"payment.captured", "order.paid"}:
        return _capture_payment(_payment_entity(payload))
    if event_type == "payment.failed":
        return _fail_payment(_payment_entity(payload))
    if event_type in {"refund.created", "refund.processed", "refund.failed"}:
        return _apply_refund(_refund_entity(payload), event_type)
    return None, False


def _linked_order(payload, event_type):
    """Resolve only provider identifiers; never retain payload content."""

    try:
        if event_type.startswith("payment.") or event_type == "order.paid":
            razorpay_order_id = payload["payload"]["payment"]["entity"].get("order_id")
            return Order.objects.filter(razorpay_order_id=razorpay_order_id).first()
        if event_type.startswith("refund."):
            payment_id = payload["payload"]["refund"]["entity"].get("payment_id")
            return Order.objects.filter(razorpay_payment_id=payment_id).first()
    except (AttributeError, KeyError, TypeError):
        return None
    return None


def _event_key(razorpay_event_id, payload_hash, *, verified):
    if verified and razorpay_event_id:
        return f"event:{hashlib.sha256(razorpay_event_id.encode('utf-8')).hexdigest()}"
    return f"{'payload' if verified else 'invalid'}:{payload_hash}"


def _record_invalid_signature(payload_hash):
    now = timezone.now()
    event, created = WebhookEvent.objects.get_or_create(
        deduplication_key=_event_key(None, payload_hash, verified=False),
        defaults={
            "payload_hash": payload_hash,
            "signature_verified": False,
            "processing_state": WebhookEvent.ProcessingState.FAILED,
            "error_code": "SIGNATURE_INVALID",
            "last_attempt_at": now,
            "attempt_count": 1,
        },
    )
    if not created:
        WebhookEvent.objects.filter(pk=event.pk).update(
            attempt_count=F("attempt_count") + 1,
            last_attempt_at=now,
            processing_state=WebhookEvent.ProcessingState.FAILED,
            error_code="SIGNATURE_INVALID",
        )


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    signature = request.headers.get("X-Razorpay-Signature", "")
    raw_body = request.body
    payload_hash = hashlib.sha256(raw_body).hexdigest()
    if not webhook_secret:
        return JsonResponse({"detail": "Webhook verification is not configured."}, status=503)
    if not signature:
        _record_invalid_signature(payload_hash)
        return JsonResponse({"detail": "Missing Razorpay signature."}, status=400)
    try:
        raw_text = raw_body.decode("utf-8")
        Utility().verify_webhook_signature(raw_text, signature, webhook_secret)
    except (UnicodeDecodeError, SignatureVerificationError):
        _record_invalid_signature(payload_hash)
        logger.warning(
            "razorpay_webhook_signature_failed",
            extra={"security_event": {"event": "razorpay_webhook_signature_failed", "reason_code": "SIGNATURE_INVALID"}},
        )
        return JsonResponse({"detail": "Invalid webhook signature."}, status=400)

    razorpay_event_id = request.headers.get("X-Razorpay-Event-Id", "")[:128] or None
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        payload = None
    event_type = payload.get("event", "UNKNOWN") if isinstance(payload, dict) else "UNKNOWN"
    key = _event_key(razorpay_event_id, payload_hash, verified=True)
    event, _ = WebhookEvent.objects.get_or_create(
        deduplication_key=key,
        defaults={
            "razorpay_event_id": razorpay_event_id,
            "event_type": event_type,
            "payload_hash": payload_hash,
            "signature_verified": True,
        },
    )
    if event.payload_hash != payload_hash:
        WebhookEvent.objects.filter(pk=event.pk).update(
            processing_state=WebhookEvent.ProcessingState.FAILED,
            error_code="EVENT_ID_PAYLOAD_MISMATCH",
            last_attempt_at=timezone.now(),
            attempt_count=F("attempt_count") + 1,
        )
        logger.error(
            "razorpay_webhook_event_id_reused",
            extra={"security_event": {"event": "razorpay_webhook_event_id_reused", "reason_code": "EVENT_ID_PAYLOAD_MISMATCH"}},
        )
        return JsonResponse({"status": "rejected", "error_code": "EVENT_ID_PAYLOAD_MISMATCH"}, status=409)

    try:
        with transaction.atomic():
            event = WebhookEvent.objects.select_for_update().get(pk=event.pk)
            if event.processing_state in {WebhookEvent.ProcessingState.PROCESSED, WebhookEvent.ProcessingState.IGNORED}:
                return JsonResponse({"status": "already_processed"})
            event.attempt_count += 1
            event.last_attempt_at = timezone.now()
            event.processing_state = WebhookEvent.ProcessingState.PROCESSING
            event.error_code = ""
            event.save(update_fields=["attempt_count", "last_attempt_at", "processing_state", "error_code"])
            if payload is None:
                raise WebhookPayloadError("INVALID_JSON")
            if event_type not in SUPPORTED_EVENTS:
                event.processing_state = WebhookEvent.ProcessingState.IGNORED
                event.processed_at = timezone.now()
                event.save(update_fields=["processing_state", "processed_at"])
                return JsonResponse({"status": "ignored", "event": event_type})
            order, processed = _dispatch_event(payload, event_type)
            event.order = order
            event.processing_state = WebhookEvent.ProcessingState.PROCESSED
            event.processed_at = timezone.now()
            event.save(update_fields=["order", "processing_state", "processed_at"])
            return JsonResponse({
                "status": "processed" if processed else "already_processed",
                "order_id": str(order.order_id),
                "order_status": order.status,
            })
    except WebhookPayloadError as exc:
        with transaction.atomic():
            event = WebhookEvent.objects.select_for_update().get(pk=event.pk)
            event.order = _linked_order(payload, event_type) if payload else None
            event.attempt_count += 1
            event.last_attempt_at = timezone.now()
            event.processing_state = WebhookEvent.ProcessingState.FAILED
            event.error_code = exc.error_code
            event.save(update_fields=["order", "attempt_count", "last_attempt_at", "processing_state", "error_code"])
        level = logging.ERROR if event.attempt_count >= settings.RAZORPAY_WEBHOOK_ALERT_ATTEMPTS else logging.WARNING
        logger.log(
            level,
            "razorpay_webhook_processing_failed",
            extra={"security_event": {"event": "razorpay_webhook_processing_failed", "reason_code": exc.error_code, "attempt_count": event.attempt_count}},
        )
        return JsonResponse({"status": "failed", "error_code": exc.error_code}, status=202)
    except Exception:
        WebhookEvent.objects.filter(pk=event.pk).update(
            attempt_count=F("attempt_count") + 1,
            last_attempt_at=timezone.now(),
            processing_state=WebhookEvent.ProcessingState.FAILED,
            error_code="PROCESSING_ERROR",
        )
        logger.exception(
            "razorpay_webhook_processing_error",
            extra={"security_event": {"event": "razorpay_webhook_processing_error", "reason_code": "PROCESSING_ERROR"}},
        )
        return JsonResponse({"detail": "Webhook processing failed safely."}, status=500)
