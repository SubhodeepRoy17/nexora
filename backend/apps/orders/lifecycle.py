from django.db import transaction
from django.utils import timezone

from apps.merchants.models import Product

from .models import Order, StockReservation
from .policy import ReasonCode


ORDER_TRANSITIONS = {
    Order.Status.DRAFT: {Order.Status.QUOTED, Order.Status.CANCELLED, Order.Status.EXPIRED},
    Order.Status.QUOTED: {Order.Status.APPROVED, Order.Status.CANCELLED, Order.Status.EXPIRED},
    Order.Status.APPROVED: {Order.Status.PAYMENT_PENDING, Order.Status.CANCELLED, Order.Status.EXPIRED},
    Order.Status.PAYMENT_PENDING: {
        Order.Status.PAID,
        Order.Status.PAYMENT_FAILED,
        Order.Status.CANCELLED,
        Order.Status.EXPIRED,
        Order.Status.REFUND_PENDING,
        Order.Status.MANUAL_REVIEW,
    },
    Order.Status.PAYMENT_FAILED: {
        Order.Status.CANCELLED,
        Order.Status.REFUND_PENDING,
        Order.Status.MANUAL_REVIEW,
    },
    Order.Status.PAID: {Order.Status.REFUND_PENDING, Order.Status.MANUAL_REVIEW},
    Order.Status.REFUND_PENDING: {Order.Status.REFUNDED, Order.Status.MANUAL_REVIEW},
    Order.Status.MANUAL_REVIEW: {Order.Status.REFUND_PENDING, Order.Status.REFUNDED},
    Order.Status.CANCELLED: {Order.Status.REFUND_PENDING, Order.Status.MANUAL_REVIEW},
    Order.Status.EXPIRED: {Order.Status.REFUND_PENDING, Order.Status.MANUAL_REVIEW},
    Order.Status.REFUNDED: set(),
}


class LifecycleError(RuntimeError):
    def __init__(self, reason_code):
        self.reason_code = reason_code
        super().__init__(reason_code)


def transition_order(order, target_status, *, now=None):
    if target_status == order.status:
        return order
    if target_status not in ORDER_TRANSITIONS.get(order.status, set()):
        raise LifecycleError(ReasonCode.ILLEGAL_STATE_TRANSITION)
    now = now or timezone.now()
    order.status = target_status
    order.state_updated_at = now
    update_fields = ["status", "state_updated_at", "updated_at"]
    if target_status == Order.Status.PAID:
        order.paid_at = now
        update_fields.append("paid_at")
    if target_status == Order.Status.CANCELLED:
        order.cancelled_at = now
        update_fields.append("cancelled_at")
    order.save(update_fields=update_fields)
    return order


def reserve_order_inventory(order, *, expires_at):
    """Deduct available stock while holding product rows; caller owns the transaction."""

    items = list(order.items.order_by("product_id"))
    products = {
        product.pk: product
        for product in Product.objects.select_for_update()
        .select_related("merchant")
        .filter(pk__in=[item.product_id for item in items])
        .order_by("pk")
    }
    if len(products) != len(items):
        raise LifecycleError(ReasonCode.CART_INVALID)
    for item in items:
        if products[item.product_id].stock_quantity < item.quantity:
            raise LifecycleError(ReasonCode.INSUFFICIENT_STOCK)
    for item in items:
        product = products[item.product_id]
        product.stock_quantity -= item.quantity
        product.save(update_fields=["stock_quantity", "updated_at"])
        StockReservation.objects.create(
            order=order,
            product=product,
            quantity=item.quantity,
            expires_at=expires_at,
        )
    order.reservation_expires_at = expires_at
    order.save(update_fields=["reservation_expires_at", "updated_at"])
    return list(order.reservations.all())


def consume_reservations(order, *, now=None):
    now = now or timezone.now()
    reservations = list(order.reservations.select_for_update().order_by("product_id"))
    if not reservations or any(item.status != StockReservation.Status.ACTIVE for item in reservations):
        if reservations and all(item.status == StockReservation.Status.CONSUMED for item in reservations):
            return False
        raise LifecycleError(ReasonCode.RESERVATION_EXPIRED)
    for reservation in reservations:
        reservation.status = StockReservation.Status.CONSUMED
        reservation.consumed_at = now
        reservation.save(update_fields=["status", "consumed_at"])
    return True


def release_reservations(order, *, expired=False, now=None):
    """Return reserved quantities exactly once. Caller owns the transaction."""

    now = now or timezone.now()
    reservations = list(
        order.reservations.select_for_update()
        .filter(status=StockReservation.Status.ACTIVE)
        .order_by("product_id")
    )
    if not reservations:
        return False
    products = {
        product.pk: product
        for product in Product.objects.select_for_update()
        .filter(pk__in=[item.product_id for item in reservations])
        .order_by("pk")
    }
    for reservation in reservations:
        product = products[reservation.product_id]
        product.stock_quantity += reservation.quantity
        product.save(update_fields=["stock_quantity", "updated_at"])
        reservation.status = (
            StockReservation.Status.EXPIRED if expired else StockReservation.Status.RELEASED
        )
        reservation.released_at = now
        reservation.save(update_fields=["status", "released_at"])
    order.reservation_released_at = now
    order.save(update_fields=["reservation_released_at", "updated_at"])
    return True


def expire_stale_checkouts(*, now=None, limit=500):
    """Idempotently expire quotes and payment-pending reservations."""

    from .models import Cart, MoneyActionAudit, Quote

    now = now or timezone.now()
    expired_quotes = 0
    released_orders = 0
    quote_ids = list(
        Quote.objects.filter(status=Quote.Status.ACTIVE, expires_at__lte=now)
        .order_by("expires_at")
        .values_list("pk", flat=True)[:limit]
    )
    for quote_id in quote_ids:
        with transaction.atomic():
            # PostgreSQL rejects FOR UPDATE when select_related() introduces the
            # nullable Quote.cart side through an outer join. Lock the quote row
            # by itself and fetch the cart lazily inside this transaction.
            quote = Quote.objects.select_for_update().get(pk=quote_id)
            if quote.status != Quote.Status.ACTIVE or quote.expires_at > now:
                continue
            quote.status = Quote.Status.EXPIRED
            quote.save(update_fields=["status", "updated_at"])
            if quote.cart_id and quote.cart.status == Cart.Status.QUOTED:
                quote.cart.status = Cart.Status.EXPIRED
                quote.cart.save(update_fields=["status", "updated_at"])
            primary = quote.items.select_related("merchant").first()
            if primary:
                MoneyActionAudit.objects.create(
                    session=quote.session,
                    quote=quote,
                    merchant=primary.merchant,
                    buyer=quote.buyer,
                    action=MoneyActionAudit.Action.MONEY_BLOCKED,
                    outcome="EXPIRED",
                    reason_code=ReasonCode.QUOTE_EXPIRED,
                    summary="The unapproved quote expired without reserving inventory.",
                    metadata={"inventory_mutated": False},
                )
            expired_quotes += 1

    order_ids = list(
        Order.objects.filter(
            status=Order.Status.PAYMENT_PENDING,
            reservation_expires_at__lte=now,
        )
        .order_by("reservation_expires_at")
        .values_list("pk", flat=True)[:limit]
    )
    for order_id in order_ids:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order_id)
            if order.status != Order.Status.PAYMENT_PENDING or order.reservation_expires_at > now:
                continue
            release_reservations(order, expired=True, now=now)
            transition_order(order, Order.Status.EXPIRED, now=now)
            if order.quote_id and order.buyer_id:
                primary = order.quote.items.select_related("merchant").first()
                if primary:
                    MoneyActionAudit.objects.create(
                        session=order.quote.session,
                        quote=order.quote,
                        approval=getattr(order.quote, "approval", None),
                        order=order,
                        merchant=primary.merchant,
                        buyer=order.buyer,
                        action=MoneyActionAudit.Action.ORDER_EXPIRED,
                        outcome="EXPIRED",
                        reason_code=ReasonCode.RESERVATION_EXPIRED,
                        summary="The payment window expired and reserved stock was released exactly once.",
                        metadata={"reservation_released": True},
                    )
            released_orders += 1
    return {"expired_quotes": expired_quotes, "released_orders": released_orders}
