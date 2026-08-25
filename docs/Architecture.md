# System Architecture & File Structure - Nexora

## 1. Tech Stack

- **Frontend:** React (Vite), TailwindCSS, Axios
- **Backend:** Python, Django, Django REST Framework
- **Database:** PostgreSQL with `pgvector`
- **LLM:** Apache-2.0 open-weight GPT-OSS through a Groq inference endpoint, with validated tool calling and deterministic fallback
- **Payment Gateway:** Razorpay API and signed webhooks
- **Deployment:** Vercel frontend, Render/Railway backend, managed PostgreSQL

## 2. Identity and Trust Boundaries

- Django session cookies are the browser authentication credential. They are `HttpOnly`, `Secure` outside development, and configurable for same-site or cross-site deployment.
- React bootstraps identity and a CSRF token from `GET /api/auth/me/`. Every unsafe browser request sends the token in `X-CSRFToken` and includes credentials.
- `POST /api/auth/login/` is CSRF-protected before authentication. Login rotates the session and CSRF token. `POST /api/auth/logout/` requires an authenticated session and CSRF validation.
- A `Merchant` has exactly one Django user owner. Merchant profile, product, audit, order, and analytics querysets derive scope from `request.user`; client-provided merchant IDs never grant access.
- Buyers may call bounded catalog-agent search without authentication. Every result is persisted as an `AgentSession` and grounded `RecommendationDecision`; its signed decision token can be claimed only through a verified buyer session.
- `ProductRelationship` stores merchant-owned accessory, complement, substitute, bundle, compatibility, benefit, trade-off, and optional offer-label facts. The growth service evaluates these relationships deterministically and Pydantic-validates a maximum of `GROWTH_MAX_ADDON_OFFERS`; LLM output cannot invent an add-on.
- Every displayed add-on creates a durable `GrowthOffer` impression. Its signed token binds session, decision, and product. The authenticated buyer records one explicit accept or reject before an accepted offer can enter a cart.
- Checkout is cart- and quote-bound. `CartItem`, `QuoteItem`, and `OrderItem` support multi-product baskets while snapshotting product title, merchant, unit price, quantity, and line total. A short-lived `ApprovalGrant` is signed for the exact aggregate quote.
- `Product.stock_quantity` means currently available stock. Entering `PAYMENT_PENDING` locks products in deterministic order and deducts an exact `StockReservation`; capture consumes that reservation without a second deduction, while eligible failure/cancellation/expiry restores it once.
- Razorpay webhooks remain outside browser session/CSRF authentication and are trusted only after untouched raw-body HMAC verification. A payload-free `WebhookEvent` inbox records the provider event ID, body hash, verification result, attempts, state, linked order, and sanitized error code.

## 3. Application Flow

```text
Public buyer prompt
  -> throttled POST /api/agents/search/
  -> validated open-model tool call or deterministic fallback
  -> active catalog search in PostgreSQL/pgvector
  -> grounded recommendations
  -> deterministic compatibility/budget/availability rules
  -> zero to GROWTH_MAX_ADDON_OFFERS optional suggestions
  -> durable AgentSession + RecommendationDecision correlation
  -> durable GrowthOffer impression -> explicit ACCEPTED / REJECTED response
  -> authenticated buyer creates a multi-line cart from signed decisions
  -> server snapshots an exact expiring Quote + QuoteItems
  -> deterministic policy checks currency, quantity, value, merchant/product state,
     stock, price, expiry, and Razorpay test mode
  -> buyer sees exact amount, explanation, trade-offs, expiry, and limits
  -> explicit confirmation + Idempotency-Key issues a short-lived ApprovalGrant
  -> payment-order Idempotency-Key + signed grant
  -> lock products -> revalidate -> snapshot OrderItems -> reserve available stock
  -> PAYMENT_PENDING order + exact Razorpay test order
  -> Razorpay Checkout
  -> signed Razorpay webhook
  -> transactional WebhookEvent deduplication by x-razorpay-event-id (body hash fallback)
  -> consume existing reservations exactly once -> PAID (no capture-time deduction)
  -> paid OrderItem.growth_offer attributes exact incremental add-on revenue
  -> immutable MoneyActionAudit trace for allowed, blocked, and webhook outcomes
  -> buyer-scoped receipt and owner-scoped merchant timeline
```

An external buyer uses the same trust boundary through the published contract:

```text
/.well-known/nexora-commerce.json
  -> versioned public catalog + JSON Schema/OpenAPI
  -> external client selects public product IDs
  -> authenticated, idempotent server-side quote
  -> exact quote presented to human
  -> explicit single-use approval grant
  -> policy revalidation + atomic stock reservation
  -> Razorpay test Checkout handoff
  -> authoritative order polling -> verified webhook settlement
```

The reference client imports no Django models or private services. External-agent calls do not bypass Phase 7 policy, buyer ownership, approval, expiry, idempotency, or webhook authority.

## 4. API Access Matrix

| Surface | Access | Server-enforced scope |
| --- | --- | --- |
| `GET /api/health/` | Public, throttled | No business data |
| `GET /api/auth/me/` | Public/session-aware, throttled | Current session only |
| `POST /api/auth/login/` | Public, CSRF-protected, throttled | Submitted credentials |
| `POST /api/auth/logout/` | Authenticated + CSRF | Current session only |
| `POST /api/agents/search/` | Public, throttled | Active, in-stock discovery catalog |
| `GET /.well-known/nexora-commerce.json` | Public | Versioned capabilities and policy/schema links |
| `GET /api/commerce/v1/catalog/*` | Public, throttled, read-only | Active, in-stock public catalog fields only |
| `GET /api/commerce/v1/openapi.json` and `/schemas/*` | Public | Machine contract only |
| `POST /api/commerce/v1/quotes/` | Authenticated buyer + idempotency key | Server-selected current catalog facts and buyer session |
| `POST /api/commerce/v1/quotes/{id}/approve/` | Authenticated buyer + idempotency key | Exact buyer-owned, unexpired quote |
| `POST /api/commerce/v1/checkout-orders/` | Authenticated buyer + idempotency key | Single-use approval, policy revalidation, exact reservation |
| `GET /api/commerce/v1/orders/{id}/` | Authenticated | Buyer-owned authoritative status |
| `POST /api/agents/growth-offers/{id}/respond/` | Authenticated buyer | Signed offer from the buyer's session; one final accept/reject |
| `/api/merchants/` | Merchant only | Owned merchant profile |
| `/api/merchants/products/` | Merchant only | Products owned by current merchant |
| `/api/merchants/product-relationships/` | Merchant only | Relationships whose source and target are owned by current merchant |
| `GET /api/merchants/analytics/` | Merchant only | Current merchant; query IDs ignored |
| `GET /api/orders/audits/` | Merchant only | Current merchant |
| `GET /api/orders/` | Authenticated | Buyer-owned orders or merchant-owned product orders |
| `POST /api/orders/carts/` | Authenticated, throttled | Signed decisions belonging to one buyer session |
| `POST /api/orders/carts/{id}/quote/` | Authenticated | Buyer-owned draft cart |
| `POST /api/orders/quotes/` | Authenticated, throttled | Signed recommendation and current buyer |
| `POST /api/orders/quotes/{id}/approve/` | Authenticated + idempotency key | Exact buyer-owned active quote |
| `POST /api/orders/create/` | Authenticated + idempotency key, throttled | Signed approval, server total, atomic reservation |
| `GET /api/orders/{id}/` | Authenticated | Buyer-owned or merchant-item-owned order |
| `POST /api/orders/{id}/cancel/` | Authenticated buyer | Eligible buyer-owned order; releases active hold |
| `POST /api/orders/{id}/payment-status/` | Authenticated buyer | Verifies Checkout proof for feedback; cannot settle or store proof |
| `GET /api/orders/money-audits/` | Authenticated | Buyer-owned or merchant-owned trace events |
| `POST /api/orders/webhook/razorpay/` | Razorpay signature | Matching local Razorpay order |

Missing identity returns 401, an authenticated but disallowed role returns 403, an object outside an owned queryset returns 404, and exceeded DRF limits return 429.

## 5. Order State and Inventory Invariants

```text
DRAFT -> QUOTED -> APPROVED -> PAYMENT_PENDING -> PAID
                                  |      |          |
                                  |      |          -> REFUND_PENDING -> REFUNDED
                                  |      |                    |
                                  |      -> PAYMENT_FAILED    -> MANUAL_REVIEW
                                  -> CANCELLED / EXPIRED              |
                                                   late capture -------+
```

- Terminal or backward transitions are rejected with `ILLEGAL_STATE_TRANSITION`.
- Product rows are locked in ascending primary-key order. All lines are checked before any deduction, preventing partial reservation and reducing deadlock risk.
- An active reservation owns units already removed from available stock. `ACTIVE -> CONSUMED` never changes stock; `ACTIVE -> RELEASED/EXPIRED` adds the units back once.
- A verified capture after release enters `REFUND_PENDING` with an immutable audit instead of claiming fulfillment.
- `payment.failed` is ignored after a verified capture. A capture arriving after failure/cancellation/expiry is financially authoritative but cannot reclaim released stock, so it enters `REFUND_PENDING`.
- Only a verified `payment.captured`/`order.paid` webhook or a Razorpay API reconciliation with one exact captured payment may mark an order `PAID`. Checkout browser proof remains non-authoritative.
- Refund initiation is a test-mode-only operator command, permits only enumerated fulfillment reasons, always sends the exact full order amount, and is capped by `RAZORPAY_REFUND_MAX_AMOUNT`. Verified refund webhooks determine final state.
- Idempotency records are unique per buyer, operation, and key. Exact retries reconstruct the same grant/order; conflicting reuse returns `IDEMPOTENCY_CONFLICT`.
- Migration `orders.0004` backfills legacy `QuoteItem` and `OrderItem` snapshots. Legacy unreserved pending orders become `PAYMENT_FAILED`; paid and cancelled history remains intact.

## 6. Growth Attribution Invariants

- Relationship CRUD requires both products to be active, the target to be in stock, the products to differ, structured compatibility to be a JSON object, and both products to belong to the authenticated merchant.
- Only `ACCESSORY`, `COMPLEMENT`, and `BUNDLE` links may become add-ons; `SUBSTITUTE` remains discovery metadata. Invalid, inactive, incompatible, over-budget, or out-of-stock links produce no offer.
- An add-on decision cannot enter a cart without its matching accepted `GrowthOffer`. Each offer can enter at most one cart, and rejected offers cannot be replayed as accepted cart lines.
- Quote and order snapshots retain the growth-offer correlation. A paid attachment exists only when Razorpay's verified webhook marks the containing order `PAID`.
- Analytics expose real and synthetic segments independently. Paid add-on revenue is a recorded attribution total and is never described as causal revenue lift.

## 7. Folder and File Structure

```text
nexora/
├── backend/
│   ├── manage.py
│   ├── nexora_core/          # Settings, URLs, bounded pagination, logging
│   ├── apps/
│   │   ├── accounts/         # Session auth, CSRF, roles, demo account seeding
│   │   ├── agents/           # Open-model orchestration, conversations, grounded decisions
│   │   ├── merchants/        # Owned merchant profile and product catalog
│   │   ├── orders/           # Carts, state machine, reservations, expiry, Razorpay
│   │   ├── commerce/         # Public v1 capability, catalog, schemas, and adapters
│   │   └── analytics/        # Owner-scoped conversion insights
│   ├── examples/             # HTTP-only reference external AI buyer
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/auth/  # Protected merchant route boundary
│   │   ├── context/          # Session/CSRF and application state
│   │   ├── pages/            # Buyer, login, and merchant experiences
│   │   └── services/         # Credentialed Axios and Razorpay loader
│   └── vite.config.js
└── docs/
```

## 8. Deployment Security Notes

- Prefer serving frontend and API under the same registrable site. If they are on different sites, use HTTPS and set `SESSION_COOKIE_SAMESITE=None` and `CSRF_COOKIE_SAMESITE=None`; browsers that block third-party cookies may still require a same-site reverse proxy or custom subdomains.
- Keep `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` explicit. Wildcard origins are not used for credentialed requests.
- Public and authenticated rates, request-body limits, and maximum page size are environment-configurable and bounded server-side.
- Security events are JSON logged with event, outcome, user ID, client IP, and safe reason code. Passwords, tokens, secrets, and full buyer emails are excluded.
- `MONEY_*` limits are environment-configurable but default conservatively. Buildathon deployments reject non-`rzp_test_` keys when test-mode enforcement is enabled.
- `MoneyActionAudit` stores concise evidence and policy results, never prompts containing secrets or hidden chain-of-thought. Its model and queryset reject mutation/deletion through the application ORM.
- `python manage.py expire_checkouts` is safe to retry and must run at least every five minutes. The Render Blueprint declares a UTC cron job; another platform may invoke the same finite command from its scheduler.
- `python manage.py reconcile_razorpay` checks stale pending orders every five minutes. It repairs only an exact single captured payment; ambiguous, mismatched, or provider-error outcomes become durable `ReconciliationException` rows and structured alerts.
- Agent commerce v1 uses cursor pagination capped at 50 and public conditional caching. Catalog serialization excludes credentials, buyers, private analytics, inactive inventory, and internal search vectors.
- The published interface is a Nexora-native contract. It does not claim conformance with ACP, AP2, x402, UAP, or another third-party protocol.

## 9. Buyer Search and Conversation Pipeline

```text
buyer text -> deterministic hard constraints -> open-model structured intent
           -> bounded SQL/pgvector retrieval -> relaxed retry when empty
           -> grounded top 1-3 recommendations -> immutable decision trace
           -> UUID conversation + user/assistant messages
```

The deterministic parser retains authoritative category and budget constraints while treating prose and optional preferences as ranking evidence. Model-produced specifications may narrow the first retrieval, but an empty result triggers a safe retry using only the deterministic hard constraints. Final product identity, price, stock, merchant, and specifications are overwritten from the database.

`ChatConversation` owns ordered `ChatMessage` records and links every `AgentSession` search run through a UUID. Authenticated list/detail querysets filter by `buyer=request.user`; cross-buyer IDs return 404. Anonymous rows have no list/detail surface and continuation requires a short-lived Django-signed token matching the conversation UUID. No hidden chain-of-thought or approval tokens are stored in message metadata.

## 10. Razorpay Reliability Boundary

The supported test-mode webhook subset is `payment.authorized`, `payment.captured`, `order.paid`, `payment.failed`, `refund.created`, `refund.processed`, and `refund.failed`. Unsupported verified events are durably marked `IGNORED`. Invalid signatures are recorded only as an SHA-256 body hash plus safe failure metadata; full provider payloads, card details, emails, contacts, signatures, keys, and secrets are never retained.

`WebhookEvent` row locks serialize concurrent deliveries. Completed/ignored events acknowledge safely without replaying order, stock, audit, or revenue mutations. Permanent validation failures are quarantined with 2xx acknowledgement and operator-visible codes; unexpected processing failures return 5xx for provider retry and emit structured alerts.

The reconciliation worker fetches the Razorpay order and its payments without holding a database transaction, validates provider order ID, paise amount, and currency, and then reuses the same locked capture service as webhooks. It never turns `created`, `attempted`, multiple-capture, missing-entity, or mismatched results into a guessed local outcome.

## 11. Phase 12 Live Experience Boundary

The browser contains no transaction-authoritative persistence. Authenticated refresh recovery is rebuilt from `GET /api/agents/conversations/`, `GET /api/orders/`, and `GET /api/orders/{id}/`; local storage is not used for identity, approval, checkout, payment, refund, or merchant state. The latest buyer conversation restores as a historical snapshot without decision tokens, while pending orders return a buyer-only Razorpay handoff payload so an interrupted Checkout can be reopened against the existing provider order.

Merchant surfaces join these owner-scoped sources:

| Source | Visible use |
|---|---|
| `GET /api/merchants/workspace/` | Authenticated profile, calculated catalog health, order-state counts, webhook inbox counts, reconciliation exceptions |
| `GET /api/merchants/products/` | Catalog plus annotated recorded impressions and paid conversions |
| `GET /api/merchants/product-relationships/` | Deterministic compatibility/offers |
| `GET /api/merchants/analytics/` | Search, paid conversion, loss, and add-on attribution with defined denominators |
| `GET /api/orders/` | Immutable paid/pending/refund order snapshots |
| `GET /api/orders/money-audits/` | Intent-to-settlement action timeline |

Catalog health is computed server-side as five equally weighted checks per product: active, in stock, non-empty description, non-empty structured specifications, and non-empty search tags. An empty catalog has no numeric score. No client-supplied merchant identifier changes scope.

All real-time views use sequential bounded polling: no second request starts while the previous request is active, timers pause while the document is hidden, each resource has a finite cycle budget, and abort controllers/timers are cleaned up on unmount. Buyer payment status polls every 2.5 seconds for at most five minutes; merchant timeline, operations, and analytics use separate 5/10/15-second cadences and show their own last-successful update/stale state.
