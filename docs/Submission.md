# Nexora Submission Checklist

Last official-source audit: **2026-08-26 UTC**. Deployed payment acceptance evidence updated
**2026-08-28 UTC**.

- Official program page: <https://razorpay.com/buildathon/>
- Official application form linked by that page:
  <https://forms.gle/d9r2gvxp8cmoZhon9>
- Selected track: **Track 1 — AI Growth & Agentic Commerce**

The official page currently requires builders to show a public repository, a five-minute pitch
video, and the architecture. Track 01 asks builders to grow merchant revenue or make a merchant
transactable by an AI buyer through Razorpay test-mode APIs, with explainable, bounded, gated money
actions, an audit trail, and one graceful failure.

Neither the official page nor the currently rendered form displayed a submission deadline during
this audit. Re-open both official links immediately before submission and follow the live form; do
not rely on an aggregator, cached social post, or a date copied into this repository.

## Copy-ready form content

### Project name / title

```text
Nexora — Intent to Order
```

### Project objectives / what it solves

```text
Nexora makes a merchant discoverable and safely transactable by human and external AI buyers. A
buyer states an intent; Nexora grounds recommendations in live structured catalog facts, offers a
small compatible add-on with exact incremental cost, and requires explicit choice plus approval of
an exact expiring quote before opening Razorpay Test Checkout. Deterministic server policy—not the
LLM—enforces ownership, currency, price, quantity, order value, stock, expiry, idempotency, and test
mode. Signed webhooks or exact provider reconciliation own settlement, while immutable audits and
merchant analytics trace the complete decision and attribute buyer-approved add-on revenue without
claiming causal lift. A published v1 HTTP contract lets a separate AI buyer complete the same
human-approved flow.
```

### GitHub repository URL

```text
https://github.com/SubhodeepRoy17/nexora
```

Before pasting it, verify that the URL returns HTTP 200 in a signed-out/private browser. The GitHub
API returned 404 during the 2026-08-26 audit, so public readability is **not yet verified**.

### Five-minute pitch video link

```text
PENDING — record from docs/Pitch.md, upload, and verify signed-out access
```

Do not submit while this placeholder remains.

### Build challenges and technical obstacles

```text
The hardest boundary was keeping a conversational experience fast without giving probabilistic
model output authority over catalog or money. Nexora parses hard constraints deterministically,
validates Gemini structured output, overwrites product facts from PostgreSQL, and falls back to the
same grounded candidates on provider failure. Checkout then snapshots an exact quote, issues a
short-lived signed single-use approval, and reserves stock under row locks before creating an exact
Razorpay test order. Webhook retries and delayed delivery required a payload-free deduplicated inbox,
idempotent settlement service, and strict reconciliation that repairs only one captured payment with
matching order, amount, and currency. A PostgreSQL nullable-join locking issue in expiry processing
was fixed by locking the quote without joining its nullable cart. Browser refresh and retry storms
were handled with server-state reconstruction, bounded sequential polling, abort cleanup, and
idempotency keys. The result is covered by clean PostgreSQL/pgvector CI, a full Playwright journey,
56 versioned evaluation intents, and one zero-side-effect quantity-limit failure.
```

## Official form fields observed

The linked form currently requests:

- email;
- full name;
- college name;
- graduation year;
- in-person internship availability starting September;
- preferred internship duration;
- selected track;
- project name/title;
- project objectives;
- GitHub repository URL;
- five-minute pitch video link;
- build challenges and technical obstacles; and
- final submission confirmation.

Identity, college, graduation year, availability, and duration are personal choices and must be
entered by the applicant. This repository must not store them unless the applicant intentionally
chooses to publish them.

## Final signed-out verification

- [ ] Official page and form are still open; current deadline and eligibility were read directly.
- [ ] Repository URL is public and readable without a GitHub session.
- [ ] `main` contains the exact commit demonstrated in the video.
- [ ] CI required gate is green for that commit.
- [ ] Frontend, API readiness, capability, OpenAPI, and JSON Schema URLs return expected content.
- [ ] Vercel `/api/health/` returns Render JSON and login works with default browser privacy settings.
- [ ] Both scheduler heartbeats are fresh and the smoke verifier passes without a waiver.
- [ ] Attach the redacted Razorpay Dashboard delivery row and manually redeliver that exact event;
  real signed delivery, delayed reconciliation, invalid-signature rejection, and exactly-once state
  are already verified in `Phase7Evidence.md`.
- [x] Successful ₹8,498 payment and `QUANTITY_LIMIT_EXCEEDED` failure are demonstrated honestly.
- [ ] Video is at most five minutes, accessible signed out, and contains no secrets or buyer/payment
  PII.
- [ ] Architecture and project-objective links render correctly.
- [ ] No ACP/AP2/x402/UAP compliance or causal-lift claim appears in the form or video.
- [ ] Final form confirmation is made by the applicant only after reviewing every submitted field.

## Submission links

| Artifact | Link/status |
| --- | --- |
| Live product | <https://nexora-agentic-commerce.vercel.app/> |
| Public API readiness | <https://nexora-agentic-api.onrender.com/api/health/ready/> |
| Agent capability | <https://nexora-agentic-api.onrender.com/.well-known/nexora-commerce.json> |
| Architecture | [ArchitectureDiagrams.md](ArchitectureDiagrams.md) |
| Five-minute pitch script | [Pitch.md](Pitch.md) |
| Paid transaction evidence | [Phase2Evidence.md](Phase2Evidence.md) |
| Graceful-failure evidence | [Phase3Evidence.md](Phase3Evidence.md) |
| Evaluation | [Evaluation.md](Evaluation.md) |
| Video | **PENDING** |
