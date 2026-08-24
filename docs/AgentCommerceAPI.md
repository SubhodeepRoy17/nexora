# Nexora Agent Commerce API v1

Nexora publishes a native, versioned HTTP contract that lets an external AI buyer discover eligible merchant products and reach a human-approved Razorpay test checkout without importing Nexora code or accessing private models.

## Discovery and contracts

Start with:

```http
GET /.well-known/nexora-commerce.json
```

The capability document advertises contract/API versions, absolute catalog and transaction URLs, INR and policy limits, session/CSRF authentication, idempotency requirements, Razorpay handoff type, order-status authority, stable error codes, and policy/schema links.

- OpenAPI 3.1: `GET /api/commerce/v1/openapi.json`
- Catalog Product JSON Schema (draft 2020-12): `GET /api/commerce/v1/schemas/catalog-product.json`
- Money-action policy: `GET /api/commerce/v1/policies/money-actions/`
- Every contract response includes `X-Nexora-Contract-Version: 1.0.0`.

Clients must reject unsupported major contract versions. Additive fields may appear within a compatible major version.

## Public catalog

```http
GET /api/commerce/v1/catalog/products/
GET /api/commerce/v1/catalog/products/{product_id}/
GET /api/commerce/v1/catalog/merchants/
```

Product responses contain public merchant identity, title/description/category, exact INR price, structured specifications and tags, updated time, availability, and eligible relationships/offers with compatibility evidence and incremental cost. Inactive or out-of-stock products and relationships are excluded. Merchant emails/API keys, buyers, analytics, internal embeddings, and mutation fields are never serialized.

Product filters are bounded to `q`, `category`, `merchant_id`, `min_price`, `max_price`, and ISO-8601 `updated_after`. Results use opaque cursor pagination (`page_size` 1-50). Follow the returned `next` URL; do not construct cursors. `ETag` and `Last-Modified` support conditional GETs and a valid cache hit returns `304`.

Catalog methods are read-only. `POST`, `PUT`, `PATCH`, and `DELETE` are not exposed.

## Transaction sequence

1. Discover capability and catalog documents publicly.
2. Bootstrap a cookie/CSRF session with `GET /api/auth/me/`, then sign in through the advertised login URL.
3. Create an exact server-side quote:

   ```http
   POST /api/commerce/v1/quotes/
   Idempotency-Key: caller-generated-key
   X-CSRFToken: session-token

   {"intent":"quiet USB-C keyboard","items":[{"product_id":42,"quantity":1}]}
   ```

4. Present the returned products, quantities, prices, total, expiry, limits, evidence, and `correlation_id` to the human. No payment operation is allowed yet.
5. Only after exact confirmation, call `POST /api/commerce/v1/quotes/{quote_id}/approve/` with `{"confirmed":true}` and a new idempotency key.
6. Pass the returned single-use approval token to `POST /api/commerce/v1/checkout-orders/` with a third idempotency key. Nexora revalidates ownership, quote contents/expiry, policy, prices, stock, test-mode configuration, and reserves stock before creating the exact Razorpay order.
7. Open Razorpay Checkout with the returned `key`, `razorpay_order_id`, `amount`, and `currency` handoff fields.
8. Poll `GET /api/commerce/v1/orders/{order_id}/`. A browser callback is not settlement evidence; only a verified Razorpay webhook can make the order `PAID`.

All money-adjacent requests are bound to the authenticated buyer. Quote, approval, and checkout retries with the same key and same payload return the existing result. Reusing a key for a different payload returns `IDEMPOTENCY_CONFLICT`. Correlation IDs join the external request to recommendation, quote, approval, order, webhook, and audit records. Quote and approval expiry is server-authoritative.

Errors use a stable machine code where the endpoint contract permits it, normally as `{"error":{"code":"...","message":"...","correlation_id":null}}`; inherited money-action endpoints expose the same stable value as `reason_code`. HTTP status remains authoritative: 400 invalid input, 401 missing identity, 403 forbidden, 404 unavailable/out of scope, 409 state/policy conflict, and 429 throttled.

## Reference external buyer

The standard-library client in `backend/examples/reference_ai_buyer.py` consumes only the published HTTP contract. It has no Django or internal service imports. Set credentials in the process environment, start Django, then run:

```bash
cd backend
export NEXORA_BUYER_USERNAME='demo-buyer'
export NEXORA_BUYER_PASSWORD='set-this-outside-source'
python -m examples.reference_ai_buyer --base-url http://127.0.0.1:8000 --query 'USB-C keyboard'
```

The client prints the exact quote and pauses until the human types `APPROVE <quote_id>`. It then opens Razorpay Checkout in test mode and polls the authoritative order status. `--no-browser` and `--no-poll` are available for controlled diagnostics.

## Protocol positioning

This is a Nexora-native commerce contract. Its discovery, structured catalog, quote, explicit human authorization, idempotency, payment handoff, and status concepts are directionally related to patterns discussed in agentic-commerce protocols. Nexora does **not** claim ACP, AP2, x402, UAP, or any other protocol compliance because their exact public specifications and conformance suites have not been implemented and verified here.

## Verification

Run the contract suite with:

```bash
cd backend
python manage.py test apps.commerce
```

It covers capability/schema/version behavior, cursor pagination, public-field isolation, conditional caching, unsupported mutation, authentication/idempotency, and an HTTP-only end-to-end reference client reaching a human-approved Razorpay test handoff.
