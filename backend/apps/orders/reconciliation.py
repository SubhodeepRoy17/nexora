import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import MoneyActionAudit, Order, ReconciliationException
from .services import amount_to_subunits, get_razorpay_client
from .webhooks import WebhookPayloadError, _capture_payment, _money_audit


logger = logging.getLogger("nexora.payments")


def _record_exception(order, reason_code, provider_status=""):
    with transaction.atomic():
        existing = (
            ReconciliationException.objects.select_for_update()
            .filter(order=order, reason_code=reason_code, resolved_at__isnull=True)
            .first()
        )
        if existing:
            existing.provider_status = provider_status[:32]
            existing.occurrence_count = F("occurrence_count") + 1
            existing.save(update_fields=["provider_status", "occurrence_count", "last_seen_at"])
            existing.refresh_from_db()
            return existing
        return ReconciliationException.objects.create(
            order=order,
            reason_code=reason_code,
            provider_status=provider_status[:32],
        )


def _resolve_exceptions(order):
    ReconciliationException.objects.filter(order=order, resolved_at__isnull=True).update(
        resolved_at=timezone.now()
    )


def _payment_items(response):
    if isinstance(response, dict) and isinstance(response.get("items"), list):
        return response["items"]
    return response if isinstance(response, list) else []


def reconcile_order_capture(*, order_id, provider_payment_id=None, client=None):
    """Immediately reconcile one checkout using provider data, never browser claims.

    This is intentionally safe to call after a valid Checkout signature. The
    signature identifies the returned checkout, while the Razorpay API remains
    the settlement authority: an order changes state only when one exact,
    amount/currency-bound captured payment is returned by Razorpay.
    """

    order = Order.objects.get(pk=order_id)
    if order.status != Order.Status.PAYMENT_PENDING:
        return {
            "checked": False,
            "settled": order.status == Order.Status.PAID,
            "changed": False,
            "reason_code": "ORDER_ALREADY_FINAL",
            "order": order,
        }
    if not order.razorpay_order_id:
        return {
            "checked": False,
            "settled": False,
            "changed": False,
            "reason_code": "RAZORPAY_ORDER_ID_MISSING",
            "order": order,
        }

    client = client or get_razorpay_client()
    provider_status = ""
    try:
        provider_order = client.order.fetch(order.razorpay_order_id)
        provider_status = str(provider_order.get("status", ""))
        if (
            provider_order.get("id") != order.razorpay_order_id
            or provider_order.get("amount") != amount_to_subunits(order.total_amount)
            or provider_order.get("currency") != order.currency
        ):
            reason_code = "RECONCILIATION_ORDER_MISMATCH"
        else:
            payments = []
            if provider_payment_id:
                # The Checkout signature already bound this ID to the local
                # Razorpay order. Fetch it directly instead of waiting for the
                # order-payments collection to become consistent.
                provider_payment = client.payment.fetch(provider_payment_id)
                if isinstance(provider_payment, dict):
                    payments.append(provider_payment)
            if not any(payment.get("status") == "captured" for payment in payments):
                payments.extend(_payment_items(client.order.payments(order.razorpay_order_id)))
            payments = list(
                {
                    payment.get("id"): payment
                    for payment in payments
                    if payment.get("id")
                }.values()
            )
            captured = [
                payment
                for payment in payments
                if payment.get("status") == "captured"
                and payment.get("order_id") == order.razorpay_order_id
            ]
            if len(captured) == 1:
                settled_order, changed = _capture_payment(
                    captured[0], authority="RECONCILIATION_VERIFIED"
                )
                _resolve_exceptions(settled_order)
                if changed:
                    _money_audit(
                        settled_order,
                        action=MoneyActionAudit.Action.RECONCILED,
                        outcome=settled_order.status,
                        reason_code="RECONCILIATION_VERIFIED",
                        summary="Immediate server reconciliation confirmed a provider-proven captured payment.",
                        metadata={
                            "authority": "RAZORPAY_API",
                            "trigger": "VERIFIED_CHECKOUT_RETURN",
                            "inventory_mutated_at_capture": False,
                        },
                    )
                return {
                    "checked": True,
                    "settled": settled_order.status == Order.Status.PAID,
                    "changed": changed,
                    "reason_code": "RECONCILIATION_VERIFIED",
                    "order": settled_order,
                }
            if len(captured) > 1:
                reason_code = "MULTIPLE_CAPTURED_PAYMENTS"
            elif provider_status == "paid":
                reason_code = "PAID_WITHOUT_CAPTURE_ENTITY"
            else:
                reason_code = "CAPTURE_NOT_YET_VISIBLE"
    except WebhookPayloadError as exc:
        reason_code = exc.error_code
    except Exception:
        reason_code = "RAZORPAY_RECONCILIATION_ERROR"
        logger.exception(
            "razorpay_immediate_reconciliation_provider_error",
            extra={"security_event": {
                "event": "razorpay_immediate_reconciliation_provider_error",
                "reason_code": reason_code,
                "order_id": str(order.order_id),
            }},
        )

    order.refresh_from_db()
    logger.warning(
        "razorpay_immediate_reconciliation_pending",
        extra={"security_event": {
            "event": "razorpay_immediate_reconciliation_pending",
            "reason_code": reason_code,
            "provider_status": provider_status[:32],
            "order_id": str(order.order_id),
        }},
    )
    return {
        "checked": True,
        "settled": order.status == Order.Status.PAID,
        "changed": False,
        "reason_code": reason_code,
        "order": order,
    }


def reconcile_stale_orders(*, client=None, now=None, stale_minutes=None, limit=250):
    """Repair only provider-proven captures; quarantine every ambiguous mismatch."""

    now = now or timezone.now()
    stale_minutes = stale_minutes or settings.RAZORPAY_RECONCILIATION_STALE_MINUTES
    cutoff = now - timedelta(minutes=stale_minutes)
    client = client or get_razorpay_client()
    order_ids = list(
        Order.objects.filter(
            status=Order.Status.PAYMENT_PENDING,
            state_updated_at__lte=cutoff,
            razorpay_order_id__isnull=False,
        )
        .order_by("state_updated_at")
        .values_list("pk", flat=True)[:limit]
    )
    result = {"checked": 0, "repaired": 0, "exceptions": []}
    for order_id in order_ids:
        order = Order.objects.get(pk=order_id)
        result["checked"] += 1
        reason_code = ""
        provider_status = ""
        try:
            provider_order = client.order.fetch(order.razorpay_order_id)
            provider_status = str(provider_order.get("status", ""))
            if (
                provider_order.get("id") != order.razorpay_order_id
                or provider_order.get("amount") != amount_to_subunits(order.total_amount)
                or provider_order.get("currency") != order.currency
            ):
                reason_code = "RECONCILIATION_ORDER_MISMATCH"
            else:
                payments = _payment_items(client.order.payments(order.razorpay_order_id))
                captured = [
                    payment
                    for payment in payments
                    if payment.get("status") == "captured"
                    and payment.get("order_id") == order.razorpay_order_id
                ]
                if len(captured) == 1:
                    repaired_order, changed = _capture_payment(
                        captured[0], authority="RECONCILIATION_VERIFIED"
                    )
                    _resolve_exceptions(repaired_order)
                    if changed:
                        _money_audit(
                            repaired_order,
                            action=MoneyActionAudit.Action.RECONCILED,
                            outcome=repaired_order.status,
                            reason_code="RECONCILIATION_VERIFIED",
                            summary="Server reconciliation repaired a provider-proven captured payment.",
                            metadata={"authority": "RAZORPAY_API", "inventory_mutated_at_capture": False},
                        )
                        result["repaired"] += 1
                    continue
                if len(captured) > 1:
                    reason_code = "MULTIPLE_CAPTURED_PAYMENTS"
                elif provider_status == "paid":
                    reason_code = "PAID_WITHOUT_CAPTURE_ENTITY"
                else:
                    reason_code = "STALE_PAYMENT_PENDING"
        except WebhookPayloadError as exc:
            reason_code = exc.error_code
        except Exception:
            reason_code = "RAZORPAY_RECONCILIATION_ERROR"
            logger.exception(
                "razorpay_reconciliation_provider_error",
                extra={"security_event": {"event": "razorpay_reconciliation_provider_error", "reason_code": reason_code, "order_id": str(order.order_id)}},
            )

        exception = _record_exception(order, reason_code, provider_status)
        result["exceptions"].append(
            {"order_id": str(order.order_id), "reason_code": reason_code, "provider_status": provider_status}
        )
        logger.error(
            "razorpay_reconciliation_exception",
            extra={"security_event": {
                "event": "razorpay_reconciliation_exception",
                "reason_code": reason_code,
                "order_id": str(order.order_id),
                "occurrence_count": exception.occurrence_count,
            }},
        )
    return result
