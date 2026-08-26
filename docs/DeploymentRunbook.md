# Phase 7 Deployment and Operations Runbook

## Declared production topology

| Component | Host | Pinned version or contract |
| --- | --- | --- |
| Frontend | Vercel | Node `22.x`; repository/CI baseline `22.23.2` |
| API and schedulers | Render Oregon | Python `3.12.13` |
| Database | Neon Oregon | PostgreSQL `18`; verify the exact server value after every cutover |
| Semantic index | Neon PostgreSQL | pgvector `0.8.6`; HNSW index `product_embedding_hnsw` |

The deployed versions are evidence, not assumptions. `/api/health/ready/` reports the PostgreSQL
and pgvector versions, migration state, HNSW presence, release SHA, safe configuration flags, and
sanitized scheduler heartbeat state. It never returns credentials, provider payloads, buyer data, or
database connection details.

## First deployment

1. Create the three services from `backend/render.yaml`. Use one Neon direct `DATABASE_URL` for the
   API and both cron services. Keep it only in Render's secret manager.
2. Set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` on the API to the exact Vercel production
   origin, including `https://` and no trailing path. Do not use wildcards or preview origins for the
   production service.
3. Add only `rzp_test_...` Razorpay credentials. Use an independently generated webhook secret and
   keep all Razorpay and Gemini values in Render's secret manager.
4. Import `frontend/` as the Vercel project. The checked-in `vercel.json` reverse-proxies
   `/api/*` to the Render API so browser session and CSRF cookies remain first-party. Set
   `VITE_API_BASE_URL` to `/api/` in the Production environment before building and select Node
   22.x. The build intentionally fails when this variable is absent. If the Render hostname
   changes, update the proxy destination in `frontend/vercel.json` before deploying.
5. Deploy the API. Render's pre-deploy command runs the deployment checks, migrations, pgvector
   setup/backfill, and readiness verification before replacing the prior release.
6. Deploy the frontend and confirm `/nexora-deployment.json` identifies
   `nexora-agentic-commerce`. Confirm `/api/health/` on the Vercel hostname returns the Render
   health response before testing login. Do not configure the browser to call the `onrender.com`
   hostname directly: those cookies are third-party from a `vercel.app` page and may be blocked.
7. Register `https://<render-host>/api/orders/webhook/razorpay/` in the Razorpay Test Mode dashboard
   using the events and procedure in `docs/RazorpayRunbook.md`.
8. Wait for both five-minute cron services to complete at least once. Their sanitized outcomes are
   durable `ScheduledJobRun` rows and are visible in Django admin.
9. Run the read-only public verifier from the repository root:

   ```bash
   python backend/examples/deployment_smoke.py \
     --frontend-url https://<vercel-host>/ \
     --api-url https://<render-host>/api/ \
     --expected-release <full-git-commit>
   ```

10. Complete the deployed Razorpay evidence checklist in `docs/RazorpayRunbook.md`, including a
    successful test payment, dashboard webhook delivery/redelivery, a delayed-delivery recovery,
    an expired reservation, and an idempotent reconciliation retry.

No deploy or demo step requires a manual database edit. Catalog/demo setup uses
`python manage.py seed_track_demo`; all schema/index changes use the release command.

## Health, logs, and alerts

- `/api/health/` is a process liveness probe. `/api/health/ready/` is the deployment gate and returns
  503 when configuration, database connectivity, migrations, pgvector, or HNSW is not ready.
- `deployment_status` is the operator-side strict check. It also fails when either scheduler lacks a
  successful heartbeat within `OPS_SCHEDULER_MAX_AGE_MINUTES` (15 by default).
- Configure Render failure notifications for the web service and both cron services. Alert on any
  non-2xx health check, failed deploy, failed cron execution, and the structured events listed in
  `docs/RazorpayRunbook.md`.
- Review open `ReconciliationException`, failed `WebhookEvent`, and failed `ScheduledJobRun` rows in
  Django admin. Never repair an order, stock count, or revenue metric directly in SQL.

## Rollback

1. Stop money-path demonstration traffic and record the failing release SHA and UTC time.
2. If application code failed but the migration is backward compatible, redeploy the last known-good
   Render release and matching Vercel deployment. Confirm readiness reports the expected SHA.
3. If a database cutover failed, follow `docs/NeonRunbook.md` and restore the previous secret/database.
   Never allow both databases to accept writes.
4. Do not reverse a migration or delete operational rows without a reviewed data-recovery plan.
5. Rerun the public smoke verifier, then one test-mode failure and one successful transaction before
   reopening the demo.

## Secret rotation

Rotate one integration at a time. Update the host secret manager, redeploy, verify readiness and a
non-money request, then revoke the old credential. For Razorpay, coordinate the API key and webhook
secret separately: update the dashboard webhook secret and Render secret together, trigger a test
delivery, and confirm signature verification before retiring the old configuration. A secret must
never appear in Git, command output captured as evidence, screenshots, or support messages.

## Reconciliation and refunds

Use the finite, retry-safe reconciliation command and the bounded, double-confirmed refund command
exactly as documented in `docs/RazorpayRunbook.md`. Provider ambiguity goes to `MANUAL_REVIEW`; it
must never be resolved by guessing or a direct database update.
