# P0.7 Public Deployment Evidence

Status: **public deployment verified; operational acceptance pending**

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

## External acceptance checklist

- [x] Record stable public frontend and API HTTPS URLs.
- [x] Verify the expected release, PostgreSQL/pgvector versions, HNSW index, current migrations,
  HTTPS configuration, exact frontend origin, test-only money mode, and public agent capability.
- [x] Run the public deployment smoke with the documented bootstrap-only scheduler waiver.
- [ ] Make `/api/health/` on the Vercel hostname return Render health JSON and verify login with
  default third-party-cookie blocking, or move both services under same-site custom subdomains.
- [ ] Run `deployment_smoke.py` without `--allow-pending-schedulers` after both scheduler heartbeats
  are fresh.
- [ ] Register the Razorpay Test Mode webhook and attach a redacted successful delivery plus exact
  redelivery/idempotency result.
- [ ] Verify restart recovery, delayed webhook recovery, reservation expiry, and reconciliation retry
  on the deployed environment.
- [ ] Confirm Render health/deploy/scheduler alerts and operational admin visibility.
- [ ] Complete the deployed test-mode payment and graceful-failure checklist in
  `docs/RazorpayRunbook.md`.

P0.7 must not be labelled fully accepted until every unchecked operational item has deployment
evidence. The application is publicly deployed and connected; the remaining gap is production
operations evidence, not repository implementation.
