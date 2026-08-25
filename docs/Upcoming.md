# Nexora Upcoming Phases — Track 01 Submission Roadmap

This file contains copy-ready prompts for taking Nexora from the completed Phase 5 MVP to a submission-ready Track 01 project for the Razorpay AI Buildathon.

Official Track 01 reference: <https://razorpay.com/buildathon/>

## Current implementation audit

Nexora already demonstrates the core Track 01 direction:

- A Django/PostgreSQL merchant catalog with structured specifications and live CRUD APIs.
- Groq tool calling with validated output, grounded recommendations, and deterministic SQL fallback.
- Hybrid PostgreSQL/pgvector search with pgvector 0.8.6 and an HNSW index.
- Explicit buyer approval before Razorpay Checkout is opened.
- Server-authoritative Razorpay order creation and signed webhook processing.
- Atomic paid-order inventory updates, merchant audit events, and agent analytics.
- A working React buyer experience and merchant dashboard.
- Ten passing backend tests and a successful Vite production build as of 2026-08-24.

The project is a functional MVP, but it is not yet 100% submission-ready. Important remaining gaps include:

- All business APIs currently use `AllowAny`; merchant data and analytics are not authenticated or tenant-scoped.
- The UI still contains hard-coded buyer/merchant identities, mock overview metrics, mock fixtures, and obsolete mock checkout components.
- The documented cart hold is not implemented. Pending orders do not reserve stock, expire, or expose cancellation/status APIs.
- Checkout is single-product only and does not yet demonstrate a measurable upsell/cross-sell revenue-growth loop.
- Money-action explanations and approval evidence are generic; no immutable agent-session/action-policy ledger binds a recommendation, quote, approval, and payment.
- Webhook handling is status-idempotent but lacks a durable webhook-event inbox, reconciliation workflow, refund path, and automated recovery for post-capture fulfillment failures.
- No external AI buyer can discover a machine-readable catalog and complete a bounded checkout contract through a documented agent-facing API.
- Merchant overview metrics are partially mocked, and recommendation-to-order attribution is not joined through a durable session/decision identifier.
- Automated coverage is small and lacks full captured-payment, concurrency, frontend component, browser E2E, accessibility, and deployment smoke tests.
- A real Razorpay test-mode transaction, deployed webhook, public root README, architecture diagram, evaluation report, and five-minute pitch package are not yet recorded.

## Shared execution rules for every upcoming phase

Every phase prompt below must be executed with these rules:

1. Read the referenced project documents and inspect the existing implementation before editing.
2. Preserve the boundaries in `docs/Rules.md`: no autonomous payment, no raw LLM database mutation, no hidden chain-of-thought exposure, and no ungrounded product claims.
3. Extend existing services and components rather than creating a parallel implementation.
4. Keep secrets in environment variables. Never commit credentials, payment payloads containing sensitive data, or personal buyer information.
5. Add migrations and tests for every schema or state-machine change.
6. Do not mark a phase complete while its acceptance criteria are failing or merely mocked.
7. Run the relevant backend tests, migration checks, frontend tests, lint/type checks, and production build.
8. Update `docs/Memory.md` with files changed, verification commands, measured results, known limitations, and the next phase.

---

## Phase 6 Prompt — Identity, Tenant Isolation, and API Security

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 6 — Identity, Tenant Isolation, and API Security.

Task: Replace the unauthenticated prototype boundary with a secure buyer/merchant identity layer and enforce merchant ownership across the API without breaking the public buyer discovery flow.

1. Domain ownership and identity:
   - Link each Merchant to an authenticated Django user or explicit merchant membership model.
   - Add a minimal buyer identity/session strategy suitable for the demo. Buyers may search publicly, but order history and approval evidence must be attributable to a verified session or user.
   - Provide deterministic demo buyer and merchant accounts through an idempotent seed command; never hard-code credentials in source.

2. Authentication API:
   - Implement a documented authentication mechanism appropriate for the React SPA (secure cookie/session or short-lived token with rotation).
   - Add login, logout, current-user, and authorization-error handling.
   - Configure CSRF, CORS, secure cookies, trusted origins, and production proxy settings consistently with the chosen mechanism.

3. Authorization and tenant scoping:
   - Remove `AllowAny` from merchant catalog mutation, merchant analytics, and merchant audit endpoints.
   - Ensure merchants can read and mutate only their own products, orders, analytics, and audit events.
   - Keep only the minimum catalog/search/checkout surfaces public, and never accept a client-provided merchant scope without checking ownership.
   - Prevent mass assignment of `merchant`, payment status, price, stock ownership, or audit fields.

4. Abuse controls:
   - Add DRF throttles for agent search, authentication, order creation, and other public endpoints.
   - Add bounded request sizes, pagination limits, safe error responses, and structured security logging without secrets or full buyer emails.
   - Return consistent 401, 403, 404, and 429 responses.

5. Frontend integration:
   - Replace hard-coded buyer and merchant identities with authenticated profile data.
   - Add guarded merchant routes, login/logout UX, expired-session handling, and accessible loading/error states.

6. Tests and acceptance criteria:
   - Add tests proving cross-merchant catalog, audit, order, and analytics access is denied.
   - Test CSRF/authentication behavior, throttling, object ownership, and public buyer search boundaries.
   - Acceptance: no merchant business endpoint remains globally readable or writable, and the buyer demo still reaches search and approval through an intentional identity boundary.

7. Update docs/Architecture.md, backend/README.md, environment examples, and docs/Memory.md upon completion.
```

---

## Phase 7 Prompt — Explainable, Bounded, and Approval-Gated Money Actions

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 7 — Explainable, Bounded, and Approval-Gated Money Actions.

Task: Make the complete recommendation-to-payment decision trace satisfy the Track 01 bar: every money action must be explainable, bounded, gated, and auditable.

1. Agent session and decision models:
   - Add durable models such as AgentSession, RecommendationDecision, ApprovalGrant, and MoneyActionAudit, using UUID correlation IDs.
   - Record the buyer request, parsed constraints, catalog candidate IDs, chosen recommendation IDs, concise evidence-based explanation, trade-offs, fallback/provider source, policy result, and timestamps.
   - Store high-level decision summaries only. Never store or display hidden chain-of-thought.

2. Deterministic money-action policy:
   - Implement a non-LLM policy service that enforces supported currency, maximum item quantity, maximum order value, allowed merchant/product state, stock availability, quote expiry, and test-mode-only operation for the buildathon.
   - Make limits environment-configurable with conservative defaults and expose the applicable limits to the buyer before approval.
   - Return stable reason codes for every allowed or blocked action.

3. Quote-bound approval:
   - Generate a server-side quote containing exact products, quantities, unit prices, total, currency, expiry, and correlation ID.
   - Issue a short-lived, single-use signed approval grant only after the buyer explicitly confirms the exact quote.
   - Require that approval grant when creating a Razorpay order. Reject missing, expired, replayed, altered, or cross-user approvals.
   - Do not let the browser submit an authoritative amount or payment status.

4. Audit API and UI:
   - Expose a sanitized buyer receipt/audit view and merchant action timeline linking intent -> recommendation -> quote -> approval -> Razorpay order -> webhook result.
   - Show why the product was recommended, what amount was approved, which guardrails ran, and why a failure stopped safely.
   - Mask buyer PII and prevent one user or merchant from viewing another party's audit data.

5. Failure demonstration:
   - Add one deterministic demo scenario where a money action is blocked gracefully, such as an expired quote, changed price, exceeded spending limit, depleted stock, or replayed approval.
   - Ensure no Razorpay order, stock mutation, or paid audit is produced for the blocked action.

6. Tests and acceptance criteria:
   - Test approval tampering, replay, expiry, ownership, price changes, stock changes, and policy limits.
   - Acceptance: every order can be traced to an exact recommendation and explicit approval, and every blocked money action has a user-safe explanation and immutable audit entry.

7. Update docs/Architecture.md, docs/Rules.md, API documentation, and docs/Memory.md upon completion.
```

---

## Phase 8 Prompt — Cart, Inventory Reservation, and Complete Order Lifecycle

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 8 — Cart, Inventory Reservation, and Complete Order Lifecycle.

Task: Replace the single-product pending-order shortcut with a safe cart, quote, stock-reservation, and order lifecycle that remains correct under expiry, cancellation, concurrency, and webhook retries.

1. Order schema evolution:
   - Introduce Cart/Quote and OrderItem models so an order can contain multiple products while preserving historical unit price, quantity, merchant, and line total.
   - Migrate existing single-product Order records without data loss before removing or deprecating the old direct product fields.
   - Define and validate explicit state transitions such as DRAFT, QUOTED, APPROVED, PAYMENT_PENDING, PAID, PAYMENT_FAILED, CANCELLED, EXPIRED, REFUND_PENDING, and REFUNDED as appropriate.

2. Stock reservations:
   - Reserve stock atomically when an approved quote becomes payment-pending.
   - Add reservation expiry and release behavior for abandoned, failed, cancelled, or expired checkouts.
   - Consume the reservation exactly once on verified payment capture so a paid order cannot fail merely because another pending checkout took the same stock.
   - Use row locks and database constraints to prevent overselling and negative stock.

3. Idempotent APIs:
   - Add cart/quote creation, approval, order status, buyer order list/detail, and eligible cancellation endpoints.
   - Require idempotency keys for quote approval and payment-order creation.
   - Return the same safe result on retries and reject conflicting payload reuse.

4. Expiry processing:
   - Implement an idempotent service and management command or scheduled worker to expire quotes/reservations and release stock.
   - Document how the job runs locally and in the deployed environment.

5. Frontend lifecycle:
   - Add a real cart/quote review UI with quantities, exact totals, expiry countdown, approval checkbox/action, cancellation, and order-status polling or server events.
   - Never label an order paid from the browser Razorpay callback; show pending verification until the backend confirms it.

6. Tests and acceptance criteria:
   - Test concurrent reservation attempts, expiry release, cancellation, duplicate requests, webhook retries, illegal transitions, and historical price preservation.
   - Acceptance: inventory remains correct through every supported order outcome and the buyer can always see the authoritative backend status.

7. Update docs/Architecture.md, backend/README.md, API documentation, and docs/Memory.md upon completion.
```

---

## Phase 9 Prompt — Grounded Upsell/Cross-Sell Revenue Growth Loop

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 9 — Grounded Upsell/Cross-Sell Revenue Growth Loop.

Task: Add the merchant-revenue-growth half of Track 01 through relevant, explainable, and measurable upsell/cross-sell recommendations without dark patterns or ungrounded claims.

1. Catalog relationships:
   - Add structured product relationship data for accessories, complements, substitutes, bundles, compatibility, and optional merchant-defined offers.
   - Validate that linked products are active, in stock, compatible, and owned by an eligible merchant.
   - Provide merchant CRUD controls for managing these relationships and offers.

2. Growth recommendation service:
   - Extend the buyer agent response with an optional primary recommendation plus bounded add-on suggestions.
   - Ground every suggestion in catalog facts, compatibility rules, buyer constraints, incremental cost, and a concise benefit/trade-off explanation.
   - Enforce a small maximum number of offers and never add an item automatically.
   - Prefer deterministic compatibility/rules before LLM wording; validate all model output with Pydantic.

3. Human choice and quote updates:
   - Let the buyer explicitly accept or reject each add-on.
   - Recalculate the quote server-side and require a fresh approval whenever cart contents or total price change.
   - Make rejecting an upsell as easy as accepting it and do not use countdown pressure or misleading savings.

4. Revenue attribution:
   - Correlate search session, recommendation decision, offered add-on, buyer response, order item, and paid webhook.
   - Track offer impressions, accepts, rejects, paid attachment rate, incremental order value, and revenue attributed to agent suggestions.
   - Separate real paid metrics from synthetic/demo data.

5. Merchant analytics:
   - Replace mock overview funnel/growth metrics with backend data.
   - Add top converting complements, rejected offers, compatibility gaps, and incremental revenue cards with honest denominators.

6. Evaluation and acceptance criteria:
   - Create a synthetic scenario set demonstrating relevant accepts and appropriate no-offer decisions.
   - Acceptance: the demo proves one paid basket with a buyer-approved add-on and reports its incremental revenue without claiming causality beyond recorded attribution.

7. Update docs/PRD.md, docs/Architecture.md, analytics definitions, and docs/Memory.md upon completion.
```

---

## Phase 10 Prompt — Agent-Readable Catalog and External AI Buyer Contract

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 10 — Agent-Readable Catalog and External AI Buyer Contract.

Task: Make a Nexora merchant discoverable and transactable by an external AI buyer through a documented, bounded, end-to-end commerce API.

1. Capability discovery:
   - Publish a machine-readable capability document, for example `/.well-known/nexora-commerce.json`, with API version, catalog URL, supported currency, quote/approval flow, payment handoff type, authentication requirements, limits, and policy URLs.
   - Version the contract and provide stable machine-readable error codes.

2. Agent catalog API:
   - Add read-only endpoints for product discovery, filtering, availability, structured specifications, compatibility, offers, merchant identity, and updated timestamps.
   - Add cursor pagination, ETag/Last-Modified caching, bounded filters, and an explicit JSON Schema/OpenAPI contract.
   - Exclude inactive products, internal fields, secrets, buyer data, and merchant-private analytics.

3. Agent transaction flow:
   - Expose a documented sequence for discover -> quote -> present to human -> approval grant -> Razorpay Checkout handoff -> order status.
   - Require human approval and the Phase 7 policy checks even when the caller is another agent.
   - Add idempotency, correlation IDs, expiry, and safe retry behavior to every money-adjacent operation.

4. Reference AI buyer:
   - Build a small reference client or scripted demo that consumes only the public machine contract, finds a product, requests a quote, pauses for human approval, opens the Razorpay test-mode checkout handoff, and polls the verified order result.
   - Do not let the reference client use internal Django models or private service calls.

5. Protocol positioning:
   - Document how the design relates conceptually to agentic-commerce protocols mentioned by Track 01.
   - Do not claim ACP, AP2, x402, UAP, or any other protocol compliance unless the exact public specification has been implemented and verified.

6. Tests and acceptance criteria:
   - Add contract/schema tests, cache/version tests, unauthorized mutation tests, and an end-to-end reference-client test.
   - Acceptance: a separate client can discover a merchant and reach a human-approved Razorpay test checkout using only published APIs and documentation.

7. Update docs/Architecture.md, create dedicated agent-commerce API documentation, and update docs/Memory.md upon completion.
```

---

## Phase 11 Prompt — Razorpay Reliability, Webhook Inbox, Reconciliation, and Refund Safety

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 11 — Razorpay Reliability, Webhook Inbox, Reconciliation, and Refund Safety.

Task: Harden the Razorpay test-mode transaction loop so duplicates, delayed/out-of-order events, browser interruptions, stock anomalies, and partial failures resolve safely and visibly.

1. Durable webhook inbox:
   - Add a WebhookEvent model with a unique Razorpay event identifier when available, event type, payload hash, signature-verification result, processing state, attempt count, timestamps, linked order, and sanitized error code.
   - Verify the raw body before parsing or processing, deduplicate transactionally, and acknowledge already-processed events safely.
   - Do not persist secrets, card data, or unnecessary full payloads.

2. Event/state handling:
   - Support the exact Razorpay test events required by the checkout lifecycle and handle delayed or out-of-order delivery deterministically.
   - Keep verified webhook/server reconciliation authoritative; the browser callback must not mark orders paid.
   - Add a backend payment-signature verification/status endpoint if needed for fast buyer feedback while retaining webhook authority.

3. Reconciliation:
   - Add an idempotent management command or scheduled job that checks stale payment-pending orders against Razorpay and repairs safe local state mismatches.
   - Produce an operator-visible exception list rather than silently guessing.

4. Refund/manual-resolution safety:
   - Define behavior for a captured payment that cannot be fulfilled. Prefer preventing it through reservations, then support bounded refund initiation or a clearly gated manual-resolution workflow.
   - Record refund identifiers, states, reasons, and audit events; never initiate an unbounded refund from LLM output.

5. Failure UX and operations:
   - Surface payment pending, failed, cancelled, expired, refund pending, refunded, and manual-review states to buyer and merchant.
   - Add structured logs and alerts for signature failures, repeated processing errors, stale pending orders, and reconciliation exceptions.

6. Razorpay test-mode evidence:
   - Register the deployed webhook URL, complete at least one successful test payment and one graceful failure, and capture redacted evidence for the submission.
   - Verify amount, currency, order linkage, inventory result, audit trail, and duplicate webhook behavior.

7. Tests and acceptance criteria:
   - Test valid/invalid signatures, duplicate and out-of-order events, amount mismatch, unknown order, stale pending reconciliation, refund gating, and concurrent processing.
   - Acceptance: each test-mode money outcome converges to one correct local state with no duplicate stock or revenue mutation.

8. Update docs/Architecture.md, the Razorpay runbook, environment documentation, and docs/Memory.md upon completion.
```

---

## Phase 12 Prompt — Complete Live Buyer and Merchant Experience

```text
Read docs/PRD.md, docs/Architecture.md, docs/Design.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 12 — Complete Live Buyer and Merchant Experience.

Task: Remove prototype-only UI paths and make every visible Track 01 demo state come from authenticated backend data or an explicitly labelled deterministic demo fixture.

1. Remove stale mocks:
   - Replace mock merchant overview metrics, funnels, lost-deal cards, hard-coded profiles, fabricated catalog health, and local-only status labels with API data.
   - Delete unused mock checkout components/data after confirming no active import depends on them.
   - Keep only onboarding/sample prompts that are clearly labelled as examples.

2. Buyer journey:
   - Implement live session history, recommendations, explanation/trade-offs, optional add-ons, cart, exact quote, policy limits, explicit approval, Razorpay handoff, authoritative status, receipt, cancellation, and graceful retry.
   - Preserve chat state safely across refreshes without trusting local storage for authorization or payment state.
   - Make provider fallback and no-result states honest and actionable.

3. Merchant journey:
   - Add real merchant selection/profile, catalog health calculation, inventory relationships/offers, paid orders, agent action timeline, webhook/reconciliation state, and live growth analytics.
   - Add empty, loading, stale, permission-denied, and recoverable error states for every panel.

4. Real-time behavior:
   - Use bounded polling, Server-Sent Events, or WebSockets for order/timeline status; prevent duplicate requests and clean up connections/timers.
   - Display last-updated and stale-data indicators.

5. Accessibility and responsive quality:
   - Ensure keyboard-only checkout, visible focus, dialog focus trapping, semantic labels, screen-reader status announcements, reduced motion, contrast, mobile layouts, and error association.
   - Prevent double submission and preserve user input across recoverable errors.

6. Tests and acceptance criteria:
   - Add frontend component/integration tests for search, approval, blocked policy action, checkout failure, webhook-confirmed success, merchant scoping, and empty states.
   - Acceptance: no demo-critical number or event is fabricated, and the complete buyer-to-merchant story works after a clean browser refresh.

7. Update docs/Design.md, frontend/README.md, screenshots, and docs/Memory.md upon completion.
```

---

## Phase 13 Prompt — Evaluation, Analytics Integrity, and Observability

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 13 — Evaluation, Analytics Integrity, and Observability.

Task: Produce honest, repeatable evidence that Nexora recommends accurately, respects constraints, improves merchant revenue opportunities, and remains observable when AI or payments fail.

1. Offline agent evaluation set:
   - Create a versioned synthetic catalog and at least 50 representative buyer intents covering budgets, categories, required specs, ambiguous requests, incompatible add-ons, no-result cases, prompt injection attempts, and Indian currency phrasing.
   - Keep an expected-result/constraint rubric separate from implementation code to reduce accidental leakage.

2. Metrics and evaluator:
   - Measure constraint satisfaction, catalog groundedness, unsupported-claim rate, top-k relevance, correct no-result behavior, add-on compatibility, fallback success, and p50/p95 latency.
   - Report Groq and deterministic fallback results separately.
   - Make failures inspectable and never hide or cherry-pick them.

3. Analytics integrity:
   - Correlate sessions, impressions, decisions, offers, approvals, orders, paid webhooks, cancellations, and refunds by stable IDs.
   - Define denominators for conversion rate, offer attachment, incremental paid revenue, and lost opportunities.
   - Exclude seeded/test traffic from production-style merchant metrics or label it explicitly.

4. Operational observability:
   - Add request/correlation IDs, structured JSON logs, health/readiness endpoints, database/pgvector/provider/payment dependency checks, and latency/error counters.
   - Add optional error reporting with PII scrubbing and environment-safe configuration.
   - Define alerts/runbook steps for elevated agent failure, webhook rejection, stale reservations, and reconciliation exceptions.

5. Evidence report:
   - Generate a reproducible `docs/Evaluation.md` containing dataset version, commands, environment, metrics, known limitations, and representative failures.
   - Include before/after or rules-only versus agent-assisted comparisons only when they are measured fairly.

6. Tests and acceptance criteria:
   - Test metric calculations, correlation integrity, health checks, PII redaction, and evaluator reproducibility.
   - Acceptance: one command reproduces the evaluation report and the submission can state concrete measured results with honest limitations.

7. Update docs/Architecture.md, analytics documentation, operational runbook, and docs/Memory.md upon completion.
```

---

## Phase 14 Prompt — Comprehensive Testing, Security, Performance, and CI

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 14 — Comprehensive Testing, Security, Performance, and CI.

Task: Establish a submission-grade quality gate covering the full agentic-commerce path, security boundaries, concurrency, accessibility, and repeatable continuous integration.

1. Backend test expansion:
   - Add model, serializer, service, permission, API, state-machine, database transaction, pgvector/fallback, Razorpay signature, webhook, reconciliation, reservation, refund, analytics, and tenant-isolation tests.
   - Cover the actual successful payment-capture path and assert exactly-once stock, revenue, and audit mutations.
   - Add concurrency tests for competing reservations and duplicate webhook workers.

2. Frontend tests:
   - Configure Vitest and React Testing Library for components and API-integrated flows.
   - Add Playwright browser tests for buyer search -> recommendation -> quote -> approval -> mocked/sandbox Razorpay handoff -> backend-confirmed order, plus the required graceful failure.
   - Test merchant catalog, timeline, analytics, authentication, responsive layouts, and keyboard navigation.

3. Security validation:
   - Test IDOR/tenant isolation, CSRF, CORS, authentication expiry, approval replay/tampering, idempotency conflicts, webhook spoofing, prompt injection, input size limits, secret leakage, unsafe logging, and rate limits.
   - Run dependency and secret scans; remediate critical/high findings or document justified exceptions.

4. Performance and resilience:
   - Measure agent search, catalog API, quote creation, order status, analytics, and webhook processing at realistic demo volumes.
   - Add query-count assertions for hot paths and verify indexes with PostgreSQL query plans.
   - Test Groq timeout/rate limit, pgvector absence, Razorpay timeout, duplicate client submission, and database retry behavior.

5. CI quality gate:
   - Add CI that provisions PostgreSQL with pgvector, installs locked dependencies, checks migrations, runs backend and frontend tests, builds the frontend, performs lint/static checks, and scans for committed secrets.
   - Cache dependencies safely and fail on test/build/migration drift.

6. Acceptance criteria:
   - All critical flows and Track 01 safety invariants have automated coverage.
   - CI passes from a clean clone and publishes test/evaluation artifacts.
   - No unresolved critical/high security issue or flaky critical-path test remains.

7. Create docs/Testing.md and docs/Security.md, then update docs/Memory.md upon completion.
```

---

## Phase 15 Prompt — Deployment, Demo Data, and Operational Readiness

```text
Read docs/PRD.md, docs/Architecture.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, and docs/Upcoming.md. Transitioning to Phase 15 — Deployment, Demo Data, and Operational Readiness.

Task: Deploy a reproducible public demo with PostgreSQL/pgvector, Groq, and Razorpay test mode, and prove that it survives a clean setup and realistic end-to-end smoke test.

1. Reproducible environments:
   - Pin or lock backend and frontend dependencies and document supported Python, Node, PostgreSQL, and pgvector versions.
   - Add a local one-command setup using Docker Compose or an equally reproducible documented workflow with PostgreSQL/pgvector, backend, frontend, and any worker/scheduler.
   - Keep production and demo configuration environment-driven.

2. Deployment pipeline:
   - Finalize the frontend and backend deployment manifests, migration/release command, static assets, health checks, worker/scheduled jobs, and rollback procedure.
   - Use a managed PostgreSQL instance with pgvector enabled and verify the extension/index after deployment.
   - Configure correct HTTPS hosts, CORS/CSRF origins, secure cookies, HSTS after HTTPS verification, API base URL, and trusted proxies.

3. External services:
   - Configure Groq and Razorpay test-mode credentials through the host secret manager.
   - Register the exact public Razorpay webhook URL and secret.
   - Confirm no live-mode key or real charge can be used in the demo environment.

4. Demo dataset:
   - Add an idempotent seed/reset command that creates polished synthetic merchants, products, compatibility relationships, buyer intents, and clearly labelled demo analytics.
   - Never reset or overwrite non-demo production data.
   - Include enough catalog variety to demonstrate comparison, no-result, cross-sell, stock failure, and fallback behavior.

5. Smoke and recovery checks:
   - From a clean environment, run migrations, seed data, verify pgvector/HNSW, authenticate, search, approve, complete a Razorpay test payment, receive the webhook, observe paid inventory/audit/analytics, and execute the graceful failure scenario.
   - Test service restart, delayed webhook, expired reservation cleanup, and documented rollback/recovery steps.

6. Acceptance criteria:
   - Public frontend and API URLs are stable over HTTPS and pass health checks.
   - At least one redacted successful test-mode transaction and one safe failure are recorded end to end.
   - A new evaluator can start the project locally from documentation without private assistance.

7. Create docs/Deployment.md and docs/Runbook.md, update all environment examples, and update docs/Memory.md upon completion.
```

---

## Phase 16 Prompt — Buildathon Submission Package and Final Go/No-Go Audit

```text
Read docs/PRD.md, docs/Architecture.md, docs/Design.md, docs/Rules.md, docs/Phases.md, docs/Memory.md, docs/Upcoming.md, and every report/runbook created in Phases 6-15. Transitioning to Phase 16 — Buildathon Submission Package and Final Go/No-Go Audit.

Task: Turn the verified project into a concise public submission that proves Track 01 fit in five minutes and can be evaluated from a clean clone.

1. Public repository presentation:
   - Create a root README with the problem, Track 01 thesis, target users, differentiator, live links, screenshots/GIF, architecture, agent flow, safety model, Razorpay test flow, measured results, setup, demo accounts, test commands, limitations, and roadmap.
   - Add an appropriate license, contribution/security notes if desired, `.env.example` files with placeholders, and a complete `.gitignore`.
   - Remove dead code, obsolete mocks, generated artifacts, debug logs, local paths, secrets, personal data, and misleading claims.

2. Architecture evidence:
   - Create a readable architecture diagram showing buyer/merchant clients, authenticated API boundaries, Groq tool loop, PostgreSQL/pgvector, policy/approval gate, quote/reservation/order state machine, Razorpay Checkout, verified webhook inbox, reconciliation, audit ledger, and analytics.
   - Add a money-action sequence diagram and a graceful-failure sequence diagram.

3. Five-minute pitch package:
   - Write `docs/Pitch.md` with a timed script: problem and thesis, live buyer intent, grounded comparison, explainable upsell, exact approval gate, Razorpay test checkout, verified merchant audit/revenue result, graceful failure, architecture/evaluation proof, and closing impact.
   - Keep the live demo path deterministic and prepare a short fallback recording or screenshots in case an external service fails.
   - Never expose keys, buyer PII, hidden chain-of-thought, or real payment information in the video.

4. Track 01 proof checklist:
   - Prove merchant revenue growth with measured paid add-on/incremental value or clearly scoped test evidence.
   - Prove an external AI buyer can discover and transact through the published agent-readable contract.
   - Prove every money action is explainable, bounded, explicitly approved, and audited.
   - Show at least one failure that stops or recovers gracefully without incorrect stock, revenue, or payment state.

5. Final clean-clone audit:
   - Clone the public repository into a new directory and follow only the README.
   - Run secret/history scans, dependency installation, migrations, seed setup, backend/frontend tests, evaluation, production build, deployment smoke tests, and the complete demo script.
   - Check every public link, mobile layout, accessibility-critical path, API document, and video permission.

6. Submission artifacts:
   - Prepare the public repository URL, deployed product URL, five-minute public video URL, architecture link/image, concise project description, team/student details required by the application, and measured evidence summary.
   - Verify current submission form fields and deadline directly on the official Razorpay page/form before submitting; do not rely on stale copied dates.

7. Final acceptance criteria:
   - No critical demo step depends on local-only state or manual database editing.
   - CI and the clean-clone setup pass.
   - The deployed successful-payment and graceful-failure stories both pass.
   - The five-minute video clearly demonstrates Track 01 value and safety.
   - The repository is public, documented, secret-free, and reproducible.
   - All application fields and links are ready for submission.

8. Update docs/Memory.md to Phase 16 COMPLETE only after every acceptance criterion has evidence. Record any honest limitation in the README and submission rather than marking an unverified capability complete.
```

## Final definition of 100% submission-ready

Nexora is ready to submit only when all of the following are true:

- The public demo completes an end-to-end Razorpay test-mode transaction through an explicit, quote-bound human approval.
- The same flow produces correct order, inventory, webhook, merchant timeline, and analytics state exactly once.
- A deliberate failure is handled gracefully and is visible in the audit trail.
- Merchant revenue-growth evidence is measured and honestly labelled.
- An external reference AI buyer can use the published machine-readable commerce contract.
- Authentication, tenant isolation, throttling, PII protection, and payment guardrails are enforced and tested.
- Agent quality and failure behavior are measured on a reproducible evaluation set.
- Backend, frontend, E2E, security, migration, and production-build gates pass in CI.
- The hosted app, webhook, worker/scheduler, PostgreSQL/pgvector, and operational runbooks are verified.
- The public repository, architecture, five-minute pitch video, and application links are complete and secret-free.
