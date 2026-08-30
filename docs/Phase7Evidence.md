# P0.7 Public Deployment Evidence

Status: **public deployment and real Test webhook settlement verified; one Dashboard redelivery gate pending**

Checked on 2026-08-26 UTC against release
`7234e56760963c1d802a195e2a9e469f928ca74c`.

## Stable public endpoints

| Surface | Public URL | Verified result |
| --- | --- | --- |
| Nexora frontend | `https://nexora-agentic-commerce.vercel.app/` | HTTPS Nexora build marker reachable |
| Django API | `https://nexora-agentic-api.onrender.com/` | HTTPS health and readiness reachable |
| API readiness | `https://nexora-agentic-api.onrender.com/api/health/ready/` | `ready`, Razorpay test-only mode |
| Agent discovery | `https://nexora-agentic-api.onrender.com/.well-known/nexora-commerce.json` | Public capability JSON reachable |

The readiness response verified the expected Git release, PostgreSQL `18.6`, pgvector `0.8.6`,
current migrations, the product HNSW index, production security configuration, the exact Vercel
CORS/CSRF origin, and test-only Razorpay enforcement. It returned no credentials or buyer/provider
payloads.

The read-only public verifier passed every deployment/bootstrap check when explicitly allowing
pending scheduler heartbeats:

```bash
python backend/examples/deployment_smoke.py \
  --frontend-url https://nexora-agentic-commerce.vercel.app/ \
  --api-url https://nexora-agentic-api.onrender.com/api/ \
  --expected-release 7234e56760963c1d802a195e2a9e469f928ca74c \
  --allow-pending-schedulers
```

That waiver is not final operational acceptance. Running the same command without
`--allow-pending-schedulers` currently fails because both `expire_checkouts` and
`reconcile_razorpay` report `PENDING` with no successful heartbeat.

## Browser authentication boundary

The deployed frontend bundle currently calls the Render API directly. Login works only in browsers
that permit the resulting third-party session and CSRF cookies. A top-level website cannot reliably
request browser-wide third-party-cookie permission at startup; the Storage Access API is intended
for embedded third-party documents, requires user activation for a new grant, and remains subject to
browser policy.

The repository contains a safer Vercel `/api/*` reverse proxy and documents
`VITE_API_BASE_URL=/api/`. However, the live Vercel `/api/health/` path currently returns the SPA
HTML rather than Render health JSON, so same-origin authentication is not yet claimed as deployed.
Until that route is active, evaluators may need to allow third-party cookies for the two public
origins. This is a documented deployment limitation, not a disabled CSRF control.

## Repository-controlled evidence

- Runtime pins: Python `3.12.13`, Node repository/CI baseline `22.23.2` with Vercel `22.x`,
  PostgreSQL `18`, and pgvector `0.8.6`.
- Render pre-deploy migration/pgvector verification and readiness-gated rollout.
- Production security checks for explicit hosts, HTTPS CORS/CSRF, credential completeness, and
  Razorpay test-only keys; settings refuse to start with a configured live key.
- Sanitized readiness checks for migrations, database/vector versions, HNSW, release identity, and
  scheduler heartbeats.
- Durable count-only scheduler run evidence, a public smoke verifier, and deployment, rollback,
  rotation, reconciliation, and refund runbooks.
- A production frontend build guard, public build marker, and checked-in same-origin proxy route.

## Razorpay Test webhook acceptance — 2026-08-28 UTC

The account is configured with Test-only API credentials, and the deployed readiness guard rejects
live keys. The active Razorpay webhook uses a distinct secret, targets the exact public
`/api/orders/webhook/razorpay/` path, and subscribes only to Nexora's three supported payment events,
`payment.failed`, and three supported refund events.

A buyer-approved ₹8,498 two-line order completed through real Razorpay Test Checkout while the
browser settlement callback was withheld. Razorpay delivered signed `payment.authorized`,
`payment.captured`, and `order.paid` events to Render. The payload-free inbox recorded each as
`PROCESSED` on its first attempt. Sanitized linkage is local order `…1413dd`, provider order
`…rG2Llj`, and payment `…ZzjFS4`.

The authoritative result is `PAID` with both reservations `CONSUMED`, exactly one capture audit,
one merchant purchase conversion, one attributed add-on line, and ₹999.00 attributed revenue.
A separate captured order `…855d0b` demonstrated delayed recovery: strict reconciliation repaired
it once, a second reconciliation repaired zero, and all stock/audit/conversion/revenue counts stayed
at one. Three deliveries signed with the intentionally mismatched secret were rejected as
`SIGNATURE_INVALID` across retries and produced no money, order, inventory, audit, conversion, or
revenue mutation.

No raw provider body, signature, key, secret, cookie, full email/contact, payment instrument, or
full identifier is retained here. Full acceptance still requires an account owner to sign in to the
Razorpay Test Dashboard, capture a redacted successful delivery row, click **Redeliver** on the same
successful capture after this release is live, and record the `already_processed` response plus an
inbox attempt count of 2 with unchanged business counts. The current automation session reaches the
Razorpay login screen and cannot perform that account-owner action.

## External acceptance checklist

- [x] Record stable public frontend and API HTTPS URLs.
- [x] Verify the expected release, PostgreSQL/pgvector versions, HNSW index, current migrations,
  HTTPS configuration, exact frontend origin, test-only money mode, and public agent capability.
- [x] Run the public deployment smoke with the documented bootstrap-only scheduler waiver.
- [ ] Make `/api/health/` on the Vercel hostname return Render health JSON and verify login with
  default third-party-cookie blocking, or move both services under same-site custom subdomains.
- [ ] Run `deployment_smoke.py` without `--allow-pending-schedulers` after both scheduler heartbeats
  are fresh.
- [ ] Attach the redacted Razorpay Dashboard successful-delivery row and exact manual
  redelivery/idempotency result; registration and real signed delivery are verified.
- [x] Verify delayed webhook recovery and reconciliation retry on the deployed environment.
- [ ] Confirm Render health/deploy/scheduler alerts and operational admin visibility.
- [ ] Complete the deployed test-mode payment and graceful-failure acceptance checks described in
  the backend README and Phase 2–3 evidence.

P0.7 must not be labelled fully accepted until every unchecked operational item has deployment
evidence. The application is publicly deployed and connected; the remaining gap is production
operations evidence, not repository implementation.
