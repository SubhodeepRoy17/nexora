from dataclasses import asdict, dataclass
from decimal import Decimal

from django.conf import settings
from django.utils import timezone


class ReasonCode:
    ALLOWED = "ALLOWED"
    UNSUPPORTED_CURRENCY = "UNSUPPORTED_CURRENCY"
    QUANTITY_LIMIT_EXCEEDED = "QUANTITY_LIMIT_EXCEEDED"
    ORDER_VALUE_LIMIT_EXCEEDED = "ORDER_VALUE_LIMIT_EXCEEDED"
    MERCHANT_INACTIVE = "MERCHANT_INACTIVE"
    PRODUCT_INACTIVE = "PRODUCT_INACTIVE"
    OUT_OF_STOCK = "OUT_OF_STOCK"
    INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK"
    QUOTE_EXPIRED = "QUOTE_EXPIRED"
    PRICE_CHANGED = "PRICE_CHANGED"
    TEST_MODE_REQUIRED = "TEST_MODE_REQUIRED"
    DECISION_INVALID = "DECISION_INVALID"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    APPROVAL_INVALID = "APPROVAL_INVALID"
    APPROVAL_TAMPERED = "APPROVAL_TAMPERED"
    APPROVAL_EXPIRED = "APPROVAL_EXPIRED"
    APPROVAL_REPLAYED = "APPROVAL_REPLAYED"
    APPROVAL_OWNER_MISMATCH = "APPROVAL_OWNER_MISMATCH"
    QUOTE_NOT_APPROVED = "QUOTE_NOT_APPROVED"
    PAYMENT_PROVIDER_ERROR = "PAYMENT_PROVIDER_ERROR"
    CART_INVALID = "CART_INVALID"
    IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED"
    IDEMPOTENCY_KEY_INVALID = "IDEMPOTENCY_KEY_INVALID"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    ILLEGAL_STATE_TRANSITION = "ILLEGAL_STATE_TRANSITION"
    RESERVATION_EXPIRED = "RESERVATION_EXPIRED"
    ORDER_NOT_CANCELLABLE = "ORDER_NOT_CANCELLABLE"


MESSAGES = {
    ReasonCode.ALLOWED: "This exact purchase is within the configured safety limits.",
    ReasonCode.UNSUPPORTED_CURRENCY: "This currency is not supported for checkout.",
    ReasonCode.QUANTITY_LIMIT_EXCEEDED: "The requested quantity exceeds the per-item limit.",
    ReasonCode.ORDER_VALUE_LIMIT_EXCEEDED: "The purchase exceeds the configured order-value limit.",
    ReasonCode.MERCHANT_INACTIVE: "The merchant is not currently eligible for checkout.",
    ReasonCode.PRODUCT_INACTIVE: "This product is no longer available.",
    ReasonCode.OUT_OF_STOCK: "This product is out of stock.",
    ReasonCode.INSUFFICIENT_STOCK: "The requested quantity is no longer in stock.",
    ReasonCode.QUOTE_EXPIRED: "The quote expired. Request a fresh quote before approving.",
    ReasonCode.PRICE_CHANGED: "The product price changed. Review and approve a fresh quote.",
    ReasonCode.TEST_MODE_REQUIRED: "Checkout is blocked because the payment provider is not in test mode.",
    ReasonCode.DECISION_INVALID: "This recommendation can no longer be used for checkout.",
    ReasonCode.APPROVAL_REQUIRED: "Explicit approval of the exact quote is required.",
    ReasonCode.APPROVAL_INVALID: "The approval could not be verified.",
    ReasonCode.APPROVAL_TAMPERED: "The approval was altered and has been rejected.",
    ReasonCode.APPROVAL_EXPIRED: "The approval expired. Review a fresh quote to continue.",
    ReasonCode.APPROVAL_REPLAYED: "This approval has already been used.",
    ReasonCode.APPROVAL_OWNER_MISMATCH: "This approval belongs to a different buyer.",
    ReasonCode.QUOTE_NOT_APPROVED: "The quote is not in an approved state.",
    ReasonCode.PAYMENT_PROVIDER_ERROR: "The payment provider could not initialize checkout.",
    ReasonCode.CART_INVALID: "The cart is invalid or can no longer be quoted.",
    ReasonCode.IDEMPOTENCY_KEY_REQUIRED: "An Idempotency-Key header is required for this action.",
    ReasonCode.IDEMPOTENCY_KEY_INVALID: "The Idempotency-Key header is invalid.",
    ReasonCode.IDEMPOTENCY_CONFLICT: "This idempotency key was already used for a different request.",
    ReasonCode.ILLEGAL_STATE_TRANSITION: "This order cannot move to the requested state.",
    ReasonCode.RESERVATION_EXPIRED: "The inventory reservation is no longer active.",
    ReasonCode.ORDER_NOT_CANCELLABLE: "This order is no longer eligible for cancellation.",
}


@dataclass(frozen=True)
class PolicyResult:
    allowed: bool
    reason_code: str
    message: str
    checks: list[dict]
    limits: dict

    def snapshot(self) -> dict:
        return asdict(self)


def configured_limits() -> dict:
    return {
        "supported_currency": settings.MONEY_SUPPORTED_CURRENCY,
        "max_item_quantity": settings.MONEY_MAX_ITEM_QUANTITY,
        "max_order_value": str(settings.MONEY_MAX_ORDER_VALUE),
        "quote_ttl_seconds": settings.MONEY_QUOTE_TTL_SECONDS,
        "approval_ttl_seconds": settings.MONEY_APPROVAL_TTL_SECONDS,
        "test_mode_required": settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE,
    }


def _result(reason_code: str, checks: list[dict]) -> PolicyResult:
    return PolicyResult(
        allowed=reason_code == ReasonCode.ALLOWED,
        reason_code=reason_code,
        message=MESSAGES[reason_code],
        checks=checks,
        limits=configured_limits(),
    )


def evaluate_money_action(
    *,
    product,
    quantity: int,
    currency: str,
    expected_unit_price: Decimal | None = None,
    expires_at=None,
) -> PolicyResult:
    """Evaluate only deterministic server state, in a stable fail-fast order."""

    checks = []

    def check(name: str, passed: bool) -> None:
        checks.append({"check": name, "passed": passed})

    check("supported_currency", currency == settings.MONEY_SUPPORTED_CURRENCY)
    if not checks[-1]["passed"]:
        return _result(ReasonCode.UNSUPPORTED_CURRENCY, checks)

    check("quantity_limit", 1 <= quantity <= settings.MONEY_MAX_ITEM_QUANTITY)
    if not checks[-1]["passed"]:
        return _result(ReasonCode.QUANTITY_LIMIT_EXCEEDED, checks)

    merchant_active = bool(product.merchant.owner.is_active)
    check("merchant_active", merchant_active)
    if not merchant_active:
        return _result(ReasonCode.MERCHANT_INACTIVE, checks)

    check("product_active", product.is_active)
    if not product.is_active:
        return _result(ReasonCode.PRODUCT_INACTIVE, checks)

    check("stock_available", product.stock_quantity > 0)
    if not checks[-1]["passed"]:
        return _result(ReasonCode.OUT_OF_STOCK, checks)

    check("quantity_in_stock", product.stock_quantity >= quantity)
    if not checks[-1]["passed"]:
        return _result(ReasonCode.INSUFFICIENT_STOCK, checks)

    if expires_at is not None:
        unexpired = expires_at > timezone.now()
        check("quote_unexpired", unexpired)
        if not unexpired:
            return _result(ReasonCode.QUOTE_EXPIRED, checks)

    if expected_unit_price is not None:
        unchanged = product.price == expected_unit_price
        check("price_unchanged", unchanged)
        if not unchanged:
            return _result(ReasonCode.PRICE_CHANGED, checks)

    total = product.price * quantity
    within_value_limit = total <= settings.MONEY_MAX_ORDER_VALUE
    check("order_value_limit", within_value_limit)
    if not within_value_limit:
        return _result(ReasonCode.ORDER_VALUE_LIMIT_EXCEEDED, checks)

    test_mode = settings.RAZORPAY_KEY_ID.startswith("rzp_test_")
    test_mode_allowed = not settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE or test_mode
    check("razorpay_test_mode", test_mode_allowed)
    if not test_mode_allowed:
        return _result(ReasonCode.TEST_MODE_REQUIRED, checks)

    return _result(ReasonCode.ALLOWED, checks)


def evaluate_cart_lines(*, lines, currency: str, expires_at=None) -> PolicyResult:
    """Evaluate every line and the aggregate value without any LLM involvement."""

    checks = []
    total = Decimal("0")
    for line in lines:
        result = evaluate_money_action(
            product=line["product"],
            quantity=line["quantity"],
            currency=currency,
            expected_unit_price=line.get("expected_unit_price"),
            expires_at=expires_at,
        )
        checks.extend(
            {**check, "product_id": line["product"].pk} for check in result.checks
        )
        if not result.allowed:
            return PolicyResult(False, result.reason_code, result.message, checks, configured_limits())
        total += line["product"].price * line["quantity"]
    aggregate_allowed = total <= settings.MONEY_MAX_ORDER_VALUE
    checks.append({"check": "aggregate_order_value_limit", "passed": aggregate_allowed})
    if not aggregate_allowed:
        return _result(ReasonCode.ORDER_VALUE_LIMIT_EXCEEDED, checks)
    return _result(ReasonCode.ALLOWED, checks)
