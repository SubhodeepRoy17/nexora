# P0.4 Evidence — Critical Browser E2E

Verified on 2026-08-26 with Playwright driving the real React application against a Django
`LiveServerTestCase` and the configured PostgreSQL test database. Gemini and Razorpay are the only
provider edges replaced by deterministic doubles; catalog retrieval, identity, CSRF, policy,
quotes, approvals, idempotency, reservations, reconciliation, audits, and analytics execute through
production application code.

## One-command reproduction

```bash
cd frontend
npm run test:e2e
```

The command runs both `CriticalBrowserEndToEndTests` and the existing
`ReferenceBuyerEndToEndTests`. It creates the isolated PostgreSQL test database when absent and
reuses it non-interactively on later runs. Vite and Django use dynamically isolated local ports;
the harness shuts Vite and Chrome down even when an assertion fails.

## Browser journey

The Playwright scenario proves:

- published capability and catalog discovery through HTTP;
- buyer session/CSRF authentication and private deterministic catalog search;
- grounded recommendation rendering and an explicit, equally accessible add-on rejection;
- `QUANTITY_LIMIT_EXCEEDED`, visible reason/zero-side-effect copy, and recovery through a fresh
  attributable intent;
- explicit acceptance of a fresh compatible ₹999 add-on;
- exact multi-line quote review and keyboard-only checkbox/approval submission;
- dialog initial focus, tab containment, mobile sizing, `Escape` close, and mobile navigation;
- an exact duplicate order POST returning the same idempotent result;
- refresh while the order is `PAYMENT_PENDING`, reconstruction from buyer order APIs, and Razorpay
  handoff resumption from server state;
- backend-authoritative `PAID` only after exact provider reconciliation; and
- merchant login plus owner-scoped paid attachment analytics.

The external reference buyer remains a separate HTTP-only client: it imports no Django model or
private service and reaches a human-approved test checkout using only the published capability,
catalog, authentication, quote, approval, checkout, and status endpoints.

## Authoritative exactly-once assertions

After the browser completes, Django asserts directly against PostgreSQL that:

- exactly one order exists and is `PAID` for the exact ₹8,498 basket;
- the provider order initializer ran once despite the duplicate browser submission;
- exactly one approval and payment-order idempotency record exist;
- both one-unit reservations are `CONSUMED`, while primary and add-on available stock each fell by
  exactly one and capture caused no second deduction;
- exactly one `PAYMENT_CAPTURED` money audit and one merchant `PURCHASED` audit exist;
- the blocked quote has no approval or order and has one immutable
  `QUANTITY_LIMIT_EXCEEDED` audit;
- one offer is explicitly rejected and the fresh offer is explicitly accepted; and
- real analytics report one paid attachment and exactly ₹999.00 attributed add-on revenue.

No live Gemini request, Razorpay network request, secret, payment instrument, or buyer PII is needed
or emitted by this deterministic suite. Public deployment webhook delivery/redelivery remains the
separate P0.7 evidence boundary.
