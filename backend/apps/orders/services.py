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


def create_razorpay_order(client: razorpay.Client, order) -> dict:
    payload = {
        "amount": amount_to_subunits(order.total_amount),
        "currency": "INR",
        "receipt": f"nxr_{order.order_id.hex[:24]}",
        "notes": {
            "local_order_id": str(order.order_id),
            "product_id": str(order.product_id),
            "buyer_email": order.buyer_email,
        },
    }
    return client.order.create(data=payload)
