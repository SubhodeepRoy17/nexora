# P0.7 Public Deployment Evidence

Status: **implementation complete; public acceptance blocked on deployment access**

Checked at 2026-08-26 UTC against commit `6e636ed` before the Phase 7 implementation:

- `https://nexora-api.onrender.com/api/health/` returned no response within 90 seconds.
- `https://nexora-api.onrender.com/.well-known/nexora-commerce.json` also timed out.
- `https://nexora.vercel.app/` returned a different application titled “Nexora Consulting”; it did
  not contain this repository's agentic-commerce build marker.
- The GitHub repository exposed no deployment records and this workspace has no Render/Vercel
  project connection or deployment token.

Consequently, this document does **not** claim stable public URLs, a clean public smoke test, or real
webhook/cron delivery. Those are external acceptance gates and must be filled only after the services
are connected and deployed.

## Repository-controlled evidence added

- Runtime pins: Python `3.12.13`, Node repository/CI baseline `22.23.2` with Vercel `22.x`,
  PostgreSQL `18`, and pgvector `0.8.6`.
- Render pre-deploy migration/pgvector verification and readiness-gated rollout.
- Production security checks for explicit hosts, HTTPS CORS/CSRF, credential completeness, and
  Razorpay test-only keys; settings refuse to start with a configured live key.
- A sanitized readiness endpoint that verifies migrations, PostgreSQL/pgvector versions, the HNSW
  index, configuration, release identity, and both scheduler heartbeats.
- Durable scheduler run evidence that records counts and exception classes but no order/provider
  identifiers, payloads, messages, or secrets.
- A production frontend build guard requiring `VITE_API_BASE_URL` and a unique public build marker.
- A read-only public smoke verifier and a deployment/rollback/rotation/operations runbook.

## Local verification

The Phase 7 implementation passed:

- Django system checks, production deployment checks under production-shaped settings, migration
  drift detection, Python compilation, Render YAML parsing, and diff validation;
- six focused deployment/scheduler tests, including a real PostgreSQL readiness query reporting
  PostgreSQL `18.6`, pgvector `0.8.6`, current migrations, and the HNSW index;
- all 12 frontend tests and a Vite production build with an explicit HTTPS API URL; and
- sanitized success/failure scheduler logging and persistent count-only summaries.

The required GitHub gate reruns the full backend, frontend, critical-browser, dependency, and secret
checks from clean pinned PostgreSQL/pgvector services after this change is pushed.

## External acceptance checklist

- [ ] Record stable public frontend and API HTTPS URLs.
- [ ] Run `deployment_smoke.py` without `--allow-pending-schedulers` and attach its output.
- [ ] Record the readiness response showing the expected release, PostgreSQL/pgvector versions,
  HNSW, current migrations, and two fresh scheduler heartbeats.
- [ ] Register the Razorpay Test Mode webhook and attach a redacted successful delivery plus exact
  redelivery/idempotency result.
- [ ] Verify restart recovery, delayed webhook recovery, reservation expiry, and reconciliation retry
  on the deployed environment.
- [ ] Confirm Render health/deploy/cron alerts and operational admin visibility.
- [ ] Complete the deployed test-mode payment and graceful-failure checklist in
  `docs/RazorpayRunbook.md`.

P0.7 may be marked complete only after every checkbox above has deployment evidence.
