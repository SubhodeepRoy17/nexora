from django.conf import settings
from django.db import transaction

from .lifecycle import transition_order
from .models import MoneyActionAudit, Order, PaymentRefund
from .services import amount_to_subunits, get_razorpay_client
from .webhooks import _money_audit


ALLOWED_REFUND_REASONS = {"CAPTURE_WITHOUT_RESERVATION", "FULFILLMENT_IMPOSSIBLE"}


class RefundSafetyError(RuntimeError):
    def __init__(self, reason_code):
        self.reason_code = reason_code
        super().__init__(reason_code)


def initiate_bounded_refund(*, order_id, reason_code, requested_by="OPERATOR", client=None):
    if reason_code not in ALLOWED_REFUND_REASONS:
        raise RefundSafetyError("REFUND_REASON_NOT_ALLOWED")
    if not settings.RAZORPAY_KEY_ID.startswith("rzp_test_"):
        raise RefundSafetyError("TEST_MODE_REQUIRED")

    with transaction.atomic():
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("quote__session")
            .prefetch_related("quote__items__merchant", "refunds")
            .get(pk=order_id)
        )
        if order.status not in {Order.Status.REFUND_PENDING, Order.Status.MANUAL_REVIEW}:
            raise RefundSafetyError("REFUND_STATE_NOT_ALLOWED")
        if not order.razorpay_payment_id:
            raise RefundSafetyError("REFUND_PAYMENT_MISSING")
        if order.currency != settings.MONEY_SUPPORTED_CURRENCY:
            raise RefundSafetyError("UNSUPPORTED_CURRENCY")
        if order.total_amount <= 0 or order.total_amount > settings.RAZORPAY_REFUND_MAX_AMOUNT:
            raise RefundSafetyError("REFUND_LIMIT_EXCEEDED")
        existing = order.refunds.filter(status__in=[PaymentRefund.Status.PENDING, PaymentRefund.Status.PROCESSED]).first()
        if existing:
            return existing, False
        refund = PaymentRefund.objects.create(
            order=order,
            razorpay_payment_id=order.razorpay_payment_id,
            amount=order.total_amount,
            currency=order.currency,
            reason_code=reason_code,
            requested_by=requested_by[:64],
        )

    client = client or get_razorpay_client()
    try:
        response = client.payment.refund(
            order.razorpay_payment_id,
            data={
                "amount": amount_to_subunits(order.total_amount),
                "speed": "normal",
                "receipt": f"nxr_ref_{order.order_id.hex[:24]}",
                "notes": {"local_order_id": str(order.order_id), "reason_code": reason_code},
            },
        )
        if (
            not isinstance(response, dict)
            or not isinstance(response.get("id"), str)
            or response.get("payment_id") != order.razorpay_payment_id
            or response.get("amount") != amount_to_subunits(order.total_amount)
        ):
            raise RefundSafetyError("REFUND_RESPONSE_MISMATCH")
    except Exception as exc:
        with transaction.atomic():
            refund = PaymentRefund.objects.select_for_update().get(pk=refund.pk)
            refund.status = PaymentRefund.Status.FAILED
            refund.error_code = getattr(exc, "reason_code", "REFUND_PROVIDER_ERROR")
            refund.save(update_fields=["status", "error_code", "updated_at"])
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status != Order.Status.MANUAL_REVIEW:
                transition_order(order, Order.Status.MANUAL_REVIEW)
            _money_audit(
                order,
                action=MoneyActionAudit.Action.REFUND_FAILED,
                outcome="MANUAL_REVIEW",
                reason_code=refund.error_code,
                summary="The bounded refund request did not receive a safe provider confirmation.",
                metadata={"authority": "OPERATOR", "inventory_mutated": False},
            )
        raise RefundSafetyError(refund.error_code) from exc

    with transaction.atomic():
        refund = PaymentRefund.objects.select_for_update().get(pk=refund.pk)
        refund.razorpay_refund_id = response["id"]
        refund.save(update_fields=["razorpay_refund_id", "updated_at"])
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status == Order.Status.MANUAL_REVIEW:
            transition_order(order, Order.Status.REFUND_PENDING)
        _money_audit(
            order,
            action=MoneyActionAudit.Action.REFUND_INITIATED,
            outcome="REFUND_PENDING",
            reason_code=reason_code,
            summary="An operator initiated one exact, bounded full-order refund; webhook confirmation is pending.",
            metadata={"authority": "OPERATOR", "amount": str(order.total_amount), "currency": order.currency},
        )
    return refund, True
