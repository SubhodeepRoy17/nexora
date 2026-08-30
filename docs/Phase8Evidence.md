# P0.8 Evidence — Final Submission Package

Implemented on 2026-08-26. This phase packages existing verified product evidence for an evaluator;
it does not convert an unrecorded video, private repository, or pending deployment operation into a
completed claim.

## Evaluator entry points

- `README.md` — problem, Track thesis, live URLs, screenshots, connected revenue/safety proof,
  architecture, measured results, setup, verification, and limitations.
- `docs/ArchitectureDiagrams.md` — system authority boundaries, successful payment, deliberate
  failure, and order/inventory state diagrams.
- `LICENSE` — MIT project license. Catalog records retain their own source and license metadata.

The package links rather than duplicates the authoritative paid transaction, graceful failure,
browser E2E, CI, evaluation, and deployment evidence in Phases 2–7.

## Official-source audit

The Razorpay Buildathon page and its linked Google Form were fetched on 2026-08-26. The page confirms
the public-repository, five-minute-video, architecture, Track 01, bounded-money, audit, and graceful-
failure requirements. The form requests applicant identity/eligibility, Track, project title and
objectives, repository, video, technical obstacles, and final confirmation.

Neither rendered source displayed a deadline, so a fresh official check is required immediately
before submission; aggregator dates must not be promoted as official facts.

## Hygiene and claim-boundary changes

- Recording binaries are ignored so a large or unredacted video cannot enter Git history.
- The backend environment example now includes scheduler-heartbeat readiness configuration; the
  frontend example distinguishes local direct API access from the Vercel same-origin proxy.
- `docs/Rules.md` reflects the audited `httpx` Razorpay adapter after removal of the SDK.
- Agent-commerce and prior payment evidence now consistently recognize both signed webhooks and
  strict exact provider reconciliation as backend settlement authority.
- The package names recorded paid add-on line revenue as attribution, never causal lift, and retains
  the no-third-party-protocol-compliance boundary.

## Local verification

- Django system checks passed and `makemigrations --check --dry-run` reported no model drift.
- The full 94-test backend run passed 93 tests and exposed one mobile critical-E2E hit-target bug:
  the backdrop's center was underneath the higher-layer 272px sidebar. Buyer and merchant backdrops
  now begin after the sidebar, leaving both the backdrop and in-panel close button genuinely
  clickable. The critical Playwright/PostgreSQL test then passed from a freshly recreated test
  database, including its exactly-once assertions.
- All 12 frontend tests passed after the navigation correction.
- The Vite production build passed with 1,661 transformed modules.
- Diff validation passed, and a local checker confirmed balanced code fences plus resolvable local
  links across the ten touched submission/evidence documents.
- A focused secret/PII scan found only documented placeholder database URLs; no named user password,
  private key, live provider key, or credential-bearing connection string was introduced.

## External acceptance still required

- Make the GitHub repository public and verify it in a signed-out browser. An unauthenticated GitHub
  API request returned 404 during this phase.
- Record, upload, and link the five-minute video. No placeholder is submission-ready.
- Deploy and verify the checked-in Vercel `/api/*` proxy; the public `/api/health/` path returned SPA
  HTML during this phase.
- Complete P0.7 scheduler, Razorpay webhook/redelivery, restart/recovery, and alert evidence.
- Recheck the live official page/form and let the applicant review and submit personal fields.

P0.8 is repository-package complete, not final-submission complete, until those gates are satisfied.
