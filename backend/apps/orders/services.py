from decimal import Decimal, ROUND_HALF_UP

import razorpay
from django.conf import settings


class PaymentConfigurationError(RuntimeError):
    pass


def get_razorpay_client() -> razorpay.Client:
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise PaymentConfigurationError("Razorpay API credentials are not configured")
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def amount_to_subunits(amount: Decimal) -> int:
    """Convert an INR Decimal amount to paise without binary float conversion."""

    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def amount_to_decimal(subunits: int) -> Decimal:
    """Convert INR paise to a two-decimal Decimal for durable records."""

    return (Decimal(subunits) / Decimal("100")).quantize(Decimal("0.01"))


def create_razorpay_order(client: razorpay.Client, order) -> dict:
    item_count = order.items.count() if hasattr(order, "items") else 1
    payload = {
        "amount": amount_to_subunits(order.total_amount),
        "currency": "INR",
        "receipt": f"nxr_{order.order_id.hex[:24]}",
        "notes": {
            "local_order_id": str(order.order_id),
            "item_count": str(item_count),
            "buyer_id": str(order.buyer_id) if order.buyer_id else "legacy",
        },
    }
    return client.order.create(data=payload)
