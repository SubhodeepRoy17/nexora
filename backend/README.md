# Nexora Backend

Django REST Framework backend for Nexora's merchant catalog, buyer agents, orders, and merchant analytics.

## Local setup

1. Create and activate a Python 3.12+ virtual environment.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and provide PostgreSQL credentials.
4. Create the configured PostgreSQL database, then run:

   ```bash
   python manage.py migrate
   python manage.py runserver
   ```

5. Configure the `DEMO_BUYER_*` and `DEMO_MERCHANT_*` values in `.env`, then create deterministic demo identities:

   ```bash
   python manage.py seed_demo_accounts
   ```

   The command is idempotent. Passwords are read from the environment and are never embedded in source or printed.

6. Load the attributed demo catalog:

   ```bash
   python manage.py seed_open_catalog --external-limit 60
   ```

   The command imports a pinned MIT-licensed DummyJSON subset and the CC0 Nexora keyboard scenarios documented in `docs/CatalogData.md`. It is idempotent; `--skip-external` works offline.

## Browser authentication and CSRF

Nexora uses Django session authentication for the React SPA:

1. `GET /api/auth/me/` returns the current user (or `null`) and a CSRF token while setting the CSRF cookie.
2. The browser sends that token in `X-CSRFToken` for login and every unsafe request.
3. `POST /api/auth/login/` accepts `{"username": "...", "password": "..."}` and rotates the session and CSRF token.
4. `POST /api/auth/register/` creates a buyer account after username, email, and Django password validation, then starts a rotated authenticated session. It never creates a merchant membership.
5. `POST /api/auth/logout/` invalidates the authenticated session.

The Axios client performs this bootstrap automatically. Merchant routes require a signed-in user who owns a `Merchant`. Product ownership is always assigned server-side; a submitted `merchant` field cannot change scope. Buyers can search publicly but must sign in before requesting a quote. Buyer identity and email are derived from the authenticated account.

For cross-site HTTPS deployments, configure `SESSION_COOKIE_SAMESITE=None` and `CSRF_COOKIE_SAMESITE=None`. Prefer same-site frontend/API domains or a reverse proxy because some browsers block third-party cookies entirely.

## API limits and responses

- Public agent search, login, auth bootstrap, order creation, anonymous traffic, user traffic, and health checks have separately configurable rates.
- JSON request bodies default to a 1 MiB maximum.
- Pagination defaults to 25 records and is capped at 100 records per page.
- Missing authentication returns 401, insufficient role returns 403, out-of-scope objects return 404, and exceeded rates return 429.
- Authentication security events are JSON logged without credentials, tokens, or full email addresses.

Authenticated merchant product CRUD is available at `http://localhost:8000/api/merchants/products/` and is restricted to the signed-in owner.
Merchant relationship/offer CRUD is available at `http://localhost:8000/api/merchants/product-relationships/`. Both products must belong to the merchant; active add-on targets must be active and in stock.

The buyer-agent endpoint accepts `{"query": "..."}` at
`http://localhost:8000/api/agents/search/`. It uses the Apache-2.0 open-weight
GPT-OSS model for structured tool calling when `GROQ_API_KEY` is configured and
falls back to deterministic ORM retrieval if the provider is unavailable or
over-constrains the catalog. `OPEN_MODEL_NAME` selects the model.
Each response includes a UUID `conversation_id`. Logged-in buyers can list and
open only their own history at `GET /api/agents/conversations/` and
`GET /api/agents/conversations/{id}/`. Anonymous searches receive a short-lived,
signed continuation token but cannot use either history endpoint; guest browser
transcripts are memory-only.
It may also return up to `GROWTH_MAX_ADDON_OFFERS` deterministic, Pydantic-validated add-ons. The buyer records an explicit accept or reject through `POST /api/agents/growth-offers/{offer_id}/respond/`; accepted offers still require a fresh exact quote and approval.

Catalog search applies indexed SQL constraints before hybrid ranking. If the
PostgreSQL server provides pgvector, `python manage.py migrate` creates and
backfills an HNSW cosine index automatically. On servers without the extension,
the application remains operational through indexed SQL search. After adding
pgvector binaries to an existing server, run:

```bash
python manage.py setup_pgvector
```

Payment endpoints:

- `GET /api/orders/` returns buyer-owned orders or orders for products owned by the signed-in merchant.
- `POST /api/orders/carts/` accepts one or more signed recommendation decisions and requested quantities.
- `POST /api/orders/carts/{cart_id}/quote/` snapshots every line's product, merchant, quantity, unit price, and total. The legacy single-line `POST /api/orders/quotes/` adapter uses the same cart implementation.
- `POST /api/orders/quotes/{quote_id}/approve/` requires `{ "confirmed": true }` and an `Idempotency-Key` header. Exact retries return the same deterministic approval token.
- `POST /api/orders/create/` requires a separate `Idempotency-Key`, `quote_id`, and `approval_token`. It locks products, revalidates, snapshots `OrderItem` rows, reserves inventory, and creates the exact Razorpay order.
- `GET /api/orders/{order_id}/` returns authoritative status and historical lines for bounded frontend polling.
- `POST /api/orders/{order_id}/cancel/` cancels eligible buyer orders and releases active inventory exactly once.
- `POST /api/orders/{order_id}/payment-status/` verifies browser Checkout proof for feedback but never settles the order or stores the signature.
- `POST /api/orders/webhook/razorpay/` verifies the untouched raw body, writes a payload-free deduplicated inbox record, and applies deterministic payment/refund transitions.
- `GET /api/orders/audits/` returns only the signed-in merchant's webhook-backed timeline records.
- `GET /api/orders/money-audits/` returns a sanitized intent-to-payment trace scoped to the current buyer or merchant.

Analytics endpoint:

- `GET /api/merchants/analytics/` aggregates the signed-in merchant's impressions, paid conversion rate,
  attributed revenue, trends, price/stock losses, real versus synthetic offer metrics, paid attachment, top complements, rejections, compatibility gaps, and exact paid add-on line revenue. This is recorded attribution, not causal lift.

Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and
`RAZORPAY_WEBHOOK_SECRET` in `.env`. Also configure `RAZORPAY_WEBHOOK_ALERT_ATTEMPTS`, `RAZORPAY_RECONCILIATION_STALE_MINUTES`, and a full-order cap in `RAZORPAY_REFUND_MAX_AMOUNT`. Only use Razorpay test-mode keys during
local development. The buildathon guardrail rejects live keys by default. Configure conservative limits with the documented `MONEY_*` variables in `.env.example`.

`Product.stock_quantity` is available inventory: reservation creation deducts it, capture only consumes the hold, and failed/cancelled/expired checkouts restore it. The browser Razorpay callback never marks an order paid. Order responses expose pending, failed, cancelled, expired, refund-pending, refunded, and manual-review outcomes plus sanitized refund records.

## Expiry worker

Run the idempotent cleanup locally whenever needed:

```bash
python manage.py expire_checkouts
```

For continuous local development, invoke it every minute with your OS scheduler. The Render Blueprint runs `python manage.py expire_checkouts --limit 1000` every five minutes as a finite UTC cron job. Other hosts should schedule the same command at a five-minute interval. Configure hold duration using `ORDER_RESERVATION_TTL_SECONDS`; only `ACTIVE` reservations release stock, so retries are safe.

Run stale-payment reconciliation separately:

```bash
python manage.py reconcile_razorpay --stale-minutes 10 --limit 250
```

It is idempotent and repairs only one exact Razorpay-captured payment. Its JSON output and admin `ReconciliationException` list expose ambiguous cases. For an already captured order that cannot be fulfilled, follow `docs/RazorpayRunbook.md`; the refund command requires the order UUID twice, an enumerated reason, test credentials, exact full amount, and the configured cap.

See `docs/API.md` for request/response contracts and stable money-action reason codes.

## External agent commerce API

`GET /.well-known/nexora-commerce.json` is the machine-readable entry point for the versioned external buyer contract. It links the read-only public catalog, OpenAPI 3.1 document, Catalog Product JSON Schema, money policy, and authenticated quote/approval/Razorpay handoff/status sequence. Catalog pages use opaque cursors capped at 50 and support `ETag`/`Last-Modified` revalidation.

Run the HTTP-only reference buyer after exporting `NEXORA_BUYER_USERNAME` and `NEXORA_BUYER_PASSWORD`:

```bash
python -m examples.reference_ai_buyer --base-url http://127.0.0.1:8000 --query "USB-C keyboard"
```

The client pauses for exact human approval, never imports Django internals, and treats the verified backend order status—not the Razorpay browser callback—as authoritative. See `docs/AgentCommerceAPI.md` for the complete contract and the explicit no-third-party-protocol-compliance statement.

## Production

WhiteNoise serves compressed, hashed Django static assets. `render.yaml` and
`Procfile` provide Render/Gunicorn commands, while all hosts, origins, database,
Groq, and Razorpay values remain environment-driven. Set the frontend's
`VITE_API_BASE_URL` to the deployed API URL ending in `/api/`.

## Catalog JSON schema

`Product.specifications` is validated with Pydantic. Unknown fields and invalid types are rejected. Supported fields currently include switches, connectivity, battery life, dimensions, layout, keycaps, hot-swap support, color, material, and warranty duration.
