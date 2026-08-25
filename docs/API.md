# Nexora API — Phase 9 Cart, Growth Offers, and Order Lifecycle

All unsafe browser requests require the Django session cookie and `X-CSRFToken`. Obtain both from `GET /api/auth/me/`. Money errors contain a safe `detail` and stable `reason_code`.

## Buyer registration

`POST /api/auth/register/` accepts `first_name`, `username`, `email`, `password`, and matching `password_confirm`. The CSRF-protected, throttled endpoint validates Django's username and password rules, rejects case-insensitive identity duplicates, creates only a buyer account, and returns the authenticated user plus a rotated CSRF token with `201`. Merchant ownership is never client-assignable through registration.

## 1. Recommendation lineage

`POST /api/agents/search/` returns grounded recommendations containing `decision_id` and a signed, time-limited `decision_token`. Multiple decisions from the same `agent_session_id` may form one cart. These tokens prove lineage; they do not approve payment.

The request accepts `query` plus optional `conversation_id`. An authenticated buyer supplies only the UUID and the server verifies ownership. A guest must supply both the UUID and its matching short-lived `conversation_token`; a new search returns both values. Only authenticated buyers may call `GET /api/agents/conversations/` and `GET /api/agents/conversations/{conversation_id}/`, and both endpoints return only the current buyer's records. Stored assistant metadata excludes signed decision and offer tokens.

The response identifies the first grounded result in `primary_recommendation_id` and may include up to `GROWTH_MAX_ADDON_OFFERS` entries in `add_on_suggestions`. Each contains a relationship ID/type, exact live incremental cost, compatibility facts, buyer-constraint evidence, merchant-provided benefit/trade-off, an offer ID/token, and an add-on decision ID/token. Missing valid relationships produces an empty list; the agent does not invent an offer.

## 2. Record add-on choice

`POST /api/agents/growth-offers/{offer_id}/respond/` requires an authenticated buyer:

```json
{ "offer_token": "signed-offer", "accepted": true }
```

Use `false` for an equally explicit rejection. The signed token binds offer, session, decision, and product. Exact response retries are safe; conflicting changes return `409`. An accepted add-on enters at most one cart, only when its line includes the matching `growth_offer_id` and primary decision. Nothing is added automatically.

## 3. Create a cart

`POST /api/orders/carts/` requires authentication.

```json
{
  "items": [
    { "decision_id": "uuid-1", "decision_token": "signed-1", "quantity": 2 },
    { "decision_id": "uuid-2", "decision_token": "signed-2", "growth_offer_id": "offer-uuid", "quantity": 1 }
  ]
}
```

The server validates each signed decision, common buyer session, product identity, duplicate lines, item count, and bounded quantity. The `201` result is a buyer-owned `DRAFT` cart. No inventory is reserved.

Changing any quantity or accepted add-on requires a new cart and server quote. An old approval never applies to changed contents.

## 4. Snapshot an exact quote

`POST /api/orders/carts/{cart_id}/quote/` requires ownership. It locks current product rows, runs deterministic policy checks, and returns `201` with an `ACTIVE` quote or `409` with a reason-coded blocked quote.

Each `items[]` entry contains immutable quote evidence: product/merchant IDs and names, recommendation decision, quantity, `unit_price`, `line_total`, explanation, and trade-offs. Aggregate fields include `total_amount`, `currency`, `expires_at`, and the disclosed `policy_snapshot`.

The single-line `POST /api/orders/quotes/` contract remains as a compatibility adapter and creates the same Cart, CartItem, Quote, and QuoteItem records.

## 5. Approve with idempotency

`POST /api/orders/quotes/{quote_id}/approve/` requires ownership and:

```http
Idempotency-Key: quote-approval-550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "confirmed": true }
```

Keys must be 8–128 characters using letters, digits, `.`, `_`, `:`, or `-`. Exact retries return the same deterministic approval token with `idempotent_replay: true`. Reusing the key for another quote or payload returns `409 IDEMPOTENCY_CONFLICT`.

## 6. Reserve stock and create payment order

`POST /api/orders/create/` requires a different idempotency key.

```http
Idempotency-Key: payment-order-550e8400-e29b-41d4-a716-446655440000

{
  "quote_id": "uuid",
  "approval_token": "signed-value"
}
```

Within one database transaction, the backend locks the quote, grant, and products; rechecks price, stock, expiry, ownership, policy limits, and test mode; creates historical `OrderItem` snapshots; and deducts all line quantities into `ACTIVE` reservations. If any line lacks stock, the complete transaction rolls back—there is no partial reservation or Razorpay order.

A successful `201` is `PAYMENT_PENDING` and includes `items`, exact total/currency, `reservation_expires_at`, Razorpay order ID/key/paise amount, correlation ID, and `cancellable`. Exact retries return the same order without a second provider call or reservation. Conflicting reuse returns `IDEMPOTENCY_CONFLICT`.

## 7. Authoritative order lifecycle

- `GET /api/orders/` — paginated buyer-owned orders or merchant-item-owned orders.
- `GET /api/orders/{order_id}/` — tenant-scoped detail for frontend polling.
- `POST /api/orders/{order_id}/cancel/` — buyer cancellation for `PAYMENT_PENDING` or `PAYMENT_FAILED`; repeat cancellation is safe.

Supported states are `DRAFT`, `QUOTED`, `APPROVED`, `PAYMENT_PENDING`, `PAID`, `PAYMENT_FAILED`, `CANCELLED`, `EXPIRED`, `REFUND_PENDING`, and `REFUNDED`. Invalid transitions return `ILLEGAL_STATE_TRANSITION` or `ORDER_NOT_CANCELLABLE`.

The Razorpay browser callback has no settlement authority. The frontend displays `PAYMENT_PENDING` and polls detail until a verified webhook changes the backend state.

## 8. Reservation and webhook behavior

- Reservation: available product stock decreases once.
- Verified capture: `ACTIVE -> CONSUMED`; stock does not decrease again.
- Verified failure, cancellation, or expiry: `ACTIVE -> RELEASED/EXPIRED`; stock increases once.
- Duplicate webhook or cleanup execution: no additional inventory mutation.
- Late verified capture after release: `REFUND_PENDING`, never a false fulfilled/paid state.

`POST /api/orders/webhook/razorpay/` remains signature-authenticated and amount/currency/order-bound.

## 9. Merchant relationship and analytics APIs

- `/api/merchants/product-relationships/` — owner-scoped CRUD for relationship type, compatibility object, benefit, trade-off, optional offer label, priority, and active state.
- `GET /api/merchants/analytics/` — includes `growth.real` and `growth.synthetic`, explicit denominators, top converting complements, rejected offers, compatibility gaps, and paid add-on line revenue.

`growth.real.incremental_paid_revenue` is the sum of attributed add-on order lines whose order is webhook-confirmed `PAID`. It does not claim the agent caused revenue that otherwise would not exist.

## 10. Expiry processing

`python manage.py expire_checkouts [--limit 500]` expires stale active quotes and payment-pending reservations. It is finite and idempotent, so local cron, Render cron, or another scheduler can run it every five minutes safely.

## 11. Audits and stable errors

`GET /api/orders/money-audits/` exposes a sanitized buyer/merchant trace. `GET /api/orders/audits/` exposes merchant conversion events. Neither returns secrets, approval tokens, full buyer email, or hidden reasoning.

Phase 7 reason codes remain stable. Phase 8 adds `CART_INVALID`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID`, `IDEMPOTENCY_CONFLICT`, `ILLEGAL_STATE_TRANSITION`, `RESERVATION_EXPIRED`, and `ORDER_NOT_CANCELLABLE`.
