# Nexora Track Completion Roadmap — AI Growth & Agentic Commerce

Last updated: 2026-08-26

This is the authoritative remaining-work plan for completing Nexora against the Razorpay track:

> Grow the merchant's revenue, and make them sellable to AI buyers.

The submission must prove both outcomes through one connected story:

1. A merchant publishes a structured, agent-readable catalog.
2. A buyer agent discovers and recommends live products from that catalog.
3. The agent offers a relevant, catalog-grounded add-on that can grow merchant revenue.
4. The buyer explicitly accepts or rejects every offer.
5. An exact, bounded quote is approved before Razorpay test Checkout opens.
6. A verified Razorpay result updates inventory, audit history, and merchant analytics exactly once.
7. At least one deliberate failure stops safely and is visible in the audit trail.

Nexora uses its own versioned commerce contract. It is conceptually aligned with the agent-commerce ecosystem, but it must not claim ACP, AP2, x402, UAP, or other protocol compliance unless that specification is separately implemented and verified.

## Current completion snapshot

The core product implementation is approximately 96% complete. The remaining work is public
deployment verification and submission packaging.

### Implemented

- Authenticated buyer and owner-scoped merchant sessions with CSRF protection.
- Tenant-scoped merchant catalog, relationship, order, audit, and analytics APIs.
- Structured catalog CRUD with stock, price, specifications, and licensing metadata.
- Gemini-assisted conversational search with deterministic hard constraints and safe catalog fallback.
- Durable agent sessions, recommendation decisions, signed decision tokens, and private conversation history.
- Deterministic accessory, complement, and bundle suggestions grounded in merchant-managed relationships.
- Explicit accept/reject recording for every displayed growth offer.
- Multi-line carts, server-created expiring quotes, and historical quote/order item snapshots.
- Deterministic policy for quantity, aggregate value, currency, product state, merchant state, stock, expiry, price, and Razorpay test mode.
- Exact quote approval with signed, short-lived, single-use grants and idempotency protection.
- Atomic stock reservation and release/consume behavior across payment, cancellation, and expiry states.
- Razorpay test-order creation, Checkout handoff, signed webhooks, deduplication, reconciliation, and bounded refunds.
- Immutable money-action audits and merchant-visible agent timelines.
- Real versus synthetic growth segmentation, paid attachment, and exact paid add-on line revenue.
- Public capability discovery, catalog, JSON Schema, OpenAPI, money policy, and an HTTP-only reference AI buyer.
- Buyer and merchant interfaces backed by live APIs, including blocked-action and recovery states.
- A deliberate UI failure path that requests a quantity above the configured limit.
- A locally verified quantity-limit failure with buyer recovery, zero provider/inventory side effects, an immutable owner-scoped audit, and redacted buyer/merchant captures.
- A real Razorpay Test Mode paid order containing an explicitly accepted ₹999 add-on, with strict provider reconciliation, consumed reservations, correlated audits, and paid attachment analytics.
- An idempotent reconciliation re-run that performed no duplicate mutation.
- A locally verified Playwright critical journey covering authentication, deterministic search,
  offer choice, safe failure/recovery, exact checkout, duplicate retry, pending refresh/resume,
  authoritative paid state, mobile interaction, merchant analytics, and the HTTP-only reference buyer.
- A clean-clone PostgreSQL/pgvector CI gate covering locked installs, migrations, backend/frontend
  tests, production build, critical E2E, dependency audits, secret scanning, and evidence artifacts.
- A rollback-only 56-intent evaluation covering constraints, grounding, relevance, safe no-result
  behavior, growth-offer compatibility/refusal, prompt injection, and forced-provider fallback.

### Not yet proven complete

- A verified public deployment with webhook, expiry scheduler, reconciliation scheduler, and environment safeguards.
- A root README, architecture diagrams, pitch script, demo recording, and final submission evidence package.

## Required end-to-end flow

```text
MERCHANT SETUP
Merchant signs in
  -> creates structured products and live stock
  -> defines compatible accessories/complements/bundles
  -> catalog becomes available to Nexora and external AI clients

BUYER DISCOVERY
Buyer states intent, budget, and constraints
  -> deterministic parser retains hard constraints
  -> Gemini ranks/words results when available
  -> SQL/pgvector fallback remains available
  -> agent returns grounded recommendations with explanations and trade-offs

REVENUE GROWTH
Rules evaluate merchant-created product relationships
  -> incompatible, inactive, out-of-stock, or over-budget offers are removed
  -> buyer sees a small bounded set with exact incremental cost
  -> buyer explicitly accepts or rejects every offer
  -> nothing is preselected or silently added

BOUNDED CHECKOUT
Authenticated buyer creates a cart
  -> server snapshots an exact expiring quote
  -> deterministic policy evaluates every line and aggregate total
  -> buyer reviews items, prices, trade-offs, limits, and expiry
  -> buyer explicitly approves the exact quote
  -> signed single-use approval grant is issued

RAZORPAY TEST PAYMENT
Approved request is revalidated under row locks
  -> stock is reserved atomically
  -> exact Razorpay test order is created idempotently
  -> Razorpay Checkout opens
  -> browser callback remains non-authoritative
  -> signed webhook or strict reconciliation confirms the result
  -> reservation is consumed or released exactly once

MERCHANT OUTCOME
Paid order items update merchant revenue evidence
  -> accepted paid add-on updates attachment and add-on line revenue
  -> recommendation, offer, quote, approval, order, and payment stay correlated
  -> dashboard shows the audit trail and honest attribution denominators
```

## Required graceful-failure flow

Use the existing quantity-limit path as the primary demo failure:

```text
Buyer reviews a valid quote
  -> selects "Demo safe block: exceed quantity limit"
  -> QUANTITY_LIMIT_EXCEEDED is returned
  -> no approval or Razorpay order is created for the blocked quote
  -> no stock is reserved and no paid state is fabricated
  -> immutable MONEY_BLOCKED audit is visible to the merchant
  -> buyer returns to the basket and retries successfully
```

Keep expired quote, changed price, depleted stock, replayed approval, delayed webhook, and late capture as tested secondary failures. Do not depend on them for the live five-minute demo.

## Remaining work in execution order

### P0.1 — Deterministic demo data — IMPLEMENTED

Goal: reproduce the successful growth story and blocked-action story without manual database editing.

- Extend the current idempotent seeds or add a dedicated demo setup command.
- Create one polished primary product and one compatible, in-stock add-on owned by the same merchant.
- Include compatibility facts, benefit, trade-off, and exact incremental cost.
- Add comparison alternatives, one no-result intent, one out-of-stock item, and one incompatible relationship.
- Mark seeded records as demo or synthetic wherever supported.
- Never reset or overwrite non-demo data.
- Add tests proving idempotency and preservation of non-demo records.

Acceptance evidence:

- `python manage.py seed_track_demo` creates the login-ready merchant scenario without network access.
- Automated tests cover idempotency, preservation of non-demo records, the intended primary/add-on fallback result, incompatible and out-of-stock suppression, and the no-result prompt.
- `docs/CatalogData.md` and `backend/README.md` document the exact successful and no-result prompts.
- Clean-database execution still requires verification in the target PostgreSQL/pgvector environment before the final definition-of-done checkbox is marked.

### P0.2 — Prove one paid growth transaction — LOCALLY VERIFIED

Goal: demonstrate actual track value, not only payment code.

- Configure only `rzp_test_` credentials; register the public webhook URL when running on a public deployment.
- Search with the deterministic demo prompt and explicitly accept the add-on.
- Generate and approve the exact multi-line quote.
- Complete Razorpay test Checkout and wait for backend-authoritative `PAID` through a verified webhook or strict provider reconciliation.
- Confirm the reservation is consumed without a second stock deduction.
- Confirm the merchant sees the paid order and linked money-action timeline.
- Confirm paid attachment and add-on line revenue increase exactly once.
- Redeliver the webhook or rerun strict reconciliation and prove that stock, revenue, and audit mutations are not duplicated.

Acceptance evidence:

- Redacted capture of quote, Razorpay handoff, paid result, audit, and non-zero add-on revenue.
- Safe identifiers correlate session, decision, offer, quote, approval, order, and authoritative payment confirmation.
- No secrets, instrument data, raw webhook payload, or buyer PII appear in artifacts.

Verified local result:

- `docs/Phase2Evidence.md` records the safe correlation chain and exactly-once checks.
- Razorpay Test Mode captured the exact ₹8,498 order through hosted Checkout.
- Strict provider reconciliation established backend-authoritative `PAID`; two reservations became `CONSUMED`.
- The accepted ₹999 add-on is the only order line linked to the growth offer, and real-traffic analytics report one paid attachment with ₹999.00 attributed add-on revenue.
- Re-running reconciliation produced no new payment, stock, audit, or revenue mutation.
- A hosted Checkout authorization screenshot is stored without credentials, payment instrument data, or buyer PII.

Deployment caveat: this local environment has no public HTTPS webhook URL, so the proof used the already-implemented strict reconciliation path. Public webhook registration and real delivery/redelivery evidence remain explicitly gated under P0.7; they are not claimed here.

### P0.3 — Prove the graceful failure — LOCALLY VERIFIED

Goal: satisfy the requirement that a money failure stops safely and visibly.

- Trigger `QUANTITY_LIMIT_EXCEEDED` from the checkout demo control.
- Display its reason code and actionable explanation.
- Verify no Razorpay order, reservation, or stock mutation occurs.
- Verify a `MONEY_BLOCKED` audit is visible only to the owning buyer/merchant.
- Return to the basket and complete a valid retry.
- Test the API result, database invariants, UI block, and UI recovery.

Acceptance evidence:

- [Buyer capture](screenshots/p03-buyer-quantity-block.png) showing the exact limit, stable reason code, zero-side-effect statement, and recovery action.
- [Merchant capture](screenshots/p03-merchant-blocked-audit.png) showing the owner-scoped immutable audit entry.
- `docs/Phase3Evidence.md` records safe correlation IDs and authoritative database invariants.
- The focused backend test asserts that neither the Razorpay client nor provider order creation is called for the blocked request, while a fresh valid retry reaches the mocked provider exactly once.
- The checkout component test drives the actual demo control, verifies the reason and zero-side-effect UX, returns to the preserved basket, and completes a valid retry.

Deployment caveat: this is a deterministic local policy proof and intentionally does not call Razorpay. The public deployment and webhook evidence boundary remains P0.7.

### P0.4 — Full browser E2E coverage — LOCALLY VERIFIED

Goal: ensure the exact demo survives a clean browser session and refresh.

- Add Playwright coverage for authentication, search, recommendation, offer response, quote, approval, payment handoff, authoritative status, and merchant analytics.
- Stub only external Gemini/Razorpay edges where deterministic automation requires it; retain real Django/PostgreSQL policy, reservation, audit, and analytics behavior.
- Cover quantity-limit failure and successful retry.
- Cover refresh during `PAYMENT_PENDING` and resumption from server state.
- Cover duplicate submissions, keyboard checkout, dialog focus, and a mobile viewport.
- Test the reference AI buyer through published HTTP endpoints only.

Acceptance evidence:

- One command runs the critical browser suite.
- It asserts exactly-once stock, payment, audit, and add-on revenue outcomes.
- It does not depend on uncontrolled Gemini wording or a live payment network.

Verified local result:

- `cd frontend && npm run test:e2e` runs the Playwright critical path and the HTTP-only reference
  buyer against Django live servers and the configured PostgreSQL test database.
- Playwright covers session authentication, deterministic search, recommendation, explicit reject
  and accept responses, quantity blocking, fresh recovery, exact quote/approval, keyboard and focus
  behavior, duplicate order submission, `PAYMENT_PENDING` refresh/resume, authoritative `PAID`, a
  mobile viewport, and owner-scoped merchant analytics.
- Database assertions prove one provider order, one approval, one paid order, two exactly-once
  consumed reservations, one capture audit, one purchased audit, and exactly ₹999.00 of recorded
  paid add-on revenue. The blocked quote has no approval or order.
- `docs/Phase4Evidence.md` documents the harness, trust boundary, browser journey, and invariants.

Deployment caveat: Gemini and Razorpay are deterministic provider doubles in this repeatable suite.
Public HTTPS webhook delivery/redelivery remains P0.7 and is not claimed by P0.4.

### P0.5 — Clean CI quality gate — IMPLEMENTED

Goal: make completion reproducible instead of relying on local claims.

- Provision PostgreSQL with pgvector.
- Install locked backend and frontend dependencies.
- Run Django checks and migration drift checks.
- Run all backend and frontend tests plus the production build.
- Run the critical Playwright suite.
- Run secret and dependency/security scans.
- Publish test and evaluation summaries as artifacts.

Required clean-run commands:

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test

cd ../frontend
npm ci
npm test
npm run build
```

Acceptance evidence:

- `.github/workflows/ci.yml` is the canonical clean-clone gate for pushes to `main`, pull requests,
  and manual runs. It provisions `pgvector/pgvector:0.8.6-pg16-bookworm`, installs both lockfiles,
  runs migration and application checks, runs all backend/frontend/browser suites, performs secret
  and dependency scans, and publishes per-gate artifacts.
- `docs/Phase5Evidence.md` records the gate design, reproducible local commands, dependency audit
  remediation, and the evidence boundary.
- No critical/high security issue or flaky critical-path test remains unresolved.

### P0.6 — Reproducible evaluation report — IMPLEMENTED

Goal: prove recommendation quality and safe refusal of irrelevant growth offers.

- Expand the versioned set to at least 50 buyer intents.
- Cover Indian currency phrasing, budgets, required specs, ambiguity, no results, incompatible/out-of-stock add-ons, prompt injection, Gemini failure, and fallback.
- Measure constraint satisfaction, catalog groundedness, top-k relevance, unsupported-claim rate, correct no-result behavior, add-on compatibility, and fallback success.
- Record p50/p95 latency for Gemini and fallback separately.
- Define every analytics denominator and separate real and synthetic traffic.
- Generate `docs/Evaluation.md` with commands, environment, results, representative failures, and limitations.

Acceptance evidence:

- `cd backend && python manage.py evaluate_agent` runs the versioned intent set through both
  provider-success and forced-fallback pathways, rolls back every fixture/analytics write, and
  regenerates `docs/Evaluation.md` plus the machine-readable `docs/evaluation/results.json`.
- The required CI gate reruns the evaluator against PostgreSQL/pgvector, enforces its quality
  thresholds, and publishes the Markdown, JSON, and command log as `phase6-evaluation-*` evidence.
- Measured latency explicitly excludes public Gemini network time. All growth figures remain
  labelled as recorded attribution rather than causal revenue lift.

### P0.7 — Public deployment and operations — DEPLOYED; ACCEPTANCE PENDING

Goal: make the complete path reliable on public HTTPS URLs.

Status: the Nexora frontend and API are live at stable public HTTPS URLs on release `7234e56`.
Readiness, production configuration, PostgreSQL 18.6, pgvector 0.8.6, HNSW, exact CORS origin,
test-only money mode, and public agent discovery are verified. Final acceptance remains pending on
fresh expiry/reconciliation scheduler heartbeats, deployed webhook/payment/failure evidence, and
browser authentication that does not rely on third-party cookies. See `docs/Phase7Evidence.md`.

- Pin Python, Node, PostgreSQL, and pgvector versions.
- Verify the deployed pgvector extension and HNSW index.
- Configure hosts, CORS/CSRF, secure cookies, proxy headers, and frontend API URL.
- Keep Gemini, Neon, and Razorpay credentials in the host secret manager.
- Confirm live Razorpay keys are rejected.
- Run migrations as a release step.
- Schedule `expire_checkouts` and `reconcile_razorpay` at the documented interval.
- Verify health checks, structured logs, alerts, and reconciliation visibility.
- Test restart recovery, delayed webhook, reservation expiry, and retry behavior.
- Document deployment, rollback, rotation, reconciliation, and refund procedures.

Acceptance evidence:

- Stable public frontend and API URLs over HTTPS.
- Successful clean deployment smoke test.
- Verified webhook, expiry scheduler, and reconciliation scheduler.
- No critical demo step depends on localhost or manual database edits.

### P0.8 — Final submission package

Goal: let an evaluator understand and verify Nexora quickly.

- Create a root `README.md` with the problem, track thesis, users, differentiator, live links, screenshots, architecture, safety model, test-mode payment flow, external buyer contract, measured results, setup, tests, limitations, and roadmap.
- Add architecture, successful-payment, and graceful-failure diagrams.
- Create `docs/Pitch.md` with a timed five-minute script.
- Record a fallback demo video for external-service failure.
- Confirm license, `.gitignore`, environment examples, and public permissions.
- Remove obsolete docs, dead code, generated artifacts, debug logs, secrets, PII, and misleading claims.
- Verify submission fields and deadline from the official Razorpay source immediately before submission.

Acceptance evidence:

- Repository, deployed product, five-minute video, architecture, and project-description artifacts are ready.
- A new evaluator can run the project using only repository documentation.

## Optional post-submission enhancements

These must not delay required track proof:

- A verified adapter for one specific ACP, AP2, x402, or UAP specification.
- A campaign orchestrator with explicit budget, audience, channel, approval, and rollback gates.
- Cross-merchant bundles with defined settlement and ownership rules.
- Server-sent events or WebSockets after bounded polling is proven reliable.
- Controlled experiments for causal lift; current add-on revenue remains attribution only.
- A multi-product external buyer planner that preserves exact human approval.

## Five-minute demo

1. **Problem — 20s:** AI buyers need structured discovery, bounded transaction APIs, and trustworthy payment authority.
2. **Merchant setup — 30s:** show inventory and the verified primary-to-add-on relationship.
3. **Discovery — 45s:** enter the demo intent and show grounded results, evidence, trade-offs, and provider/fallback status.
4. **Growth — 35s:** show the optional add-on, incremental price, compatibility, benefit, and trade-off; accept it explicitly.
5. **Safety gate — 40s:** show quote lines, total, policy limits, expiry, and exact approval.
6. **Failure — 35s:** trigger the quantity block and show that no payment action occurred.
7. **Payment — 55s:** retry, approve, open Razorpay test Checkout, and show authoritative payment confirmation.
8. **Merchant result — 40s:** show paid order, audit, paid attachment, and add-on revenue with attribution disclaimer.
9. **External buyer — 25s:** show capability discovery, schema/OpenAPI, and reference-client flow.
10. **Close — 15s:** Nexora makes merchants understandable and safely transactable by AI while creating buyer-approved revenue opportunities.

## Final definition of done

Nexora is 100% track-ready only when every item has current evidence:

- [ ] A clean database can be migrated and seeded without manual editing.
- [ ] The demo intent returns a grounded primary recommendation and compatible add-on.
- [ ] The buyer explicitly accepts or rejects every displayed offer.
- [ ] The buyer sees and approves an exact, bounded, expiring quote.
- [ ] Razorpay test Checkout completes and only verified backend evidence marks it paid.
- [ ] Stock reservation and paid consumption occur exactly once.
- [ ] The merchant sees the correlated order and immutable audit timeline.
- [ ] Paid attachment and add-on revenue update once and are labelled as attribution.
- [ ] The quantity-limit failure creates no provider order or stock mutation and appears in the audit.
- [ ] The reference AI buyer reaches approved checkout using only the public contract.
- [ ] Backend, frontend, E2E, migration, security, and build gates pass in CI.
- [ ] Evaluation is reproducible and submission claims match measured results.
- [ ] Deployment, webhook, expiry processing, and reconciliation are verified.
- [ ] The repository is documented, reproducible, secret-free, and makes no misleading claims.
- [ ] The video demonstrates successful revenue growth and graceful failure.
- [ ] Every submission URL and permission is verified before submission.

Do not mark this roadmap complete because a capability exists in source. Mark it complete only after its acceptance evidence is captured and reproducible.
