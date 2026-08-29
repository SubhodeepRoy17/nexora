# Nexora Five-Minute Pitch and Demo

Target duration: **5:00 maximum**. The operator should rehearse against the public deployment and
record one uninterrupted fallback video before submitting.

## Pre-recording checklist

- Open the public frontend, readiness endpoint, and Razorpay Test Mode dashboard in separate tabs.
- Confirm the readiness release matches the submitted Git commit and reports test-only mode.
- Confirm the Vercel `/api/health/` proxy returns JSON and login works with default browser privacy
  settings. If not, record the limitation and use the documented supported environment.
- Run both scheduled jobs and verify fresh successful heartbeats.
- Run `python manage.py seed_track_demo`; never edit production data manually.
- Use a synthetic buyer and merchant. Keep passwords, API keys, email addresses, payment instrument
  details, webhook bodies, and cookies outside the recording.
- Reset the demo to one clean primary/add-on stock state and keep the exact successful and failure
  prompts copied locally.
- Make the GitHub repository public and test every submitted link in a signed-out browser.

## Timed talk track

### 0:00–0:25 — Problem and thesis

**Show:** landing-page hero.

**Say:** “AI can recommend products, but a merchant is not truly sellable to an AI unless its
catalog is machine-readable and every money action stays explainable, bounded, human-approved, and
auditable. Nexora connects both sides: better buying for people and attributable growth for
merchants.”

### 0:25–0:50 — Merchant becomes agent-readable

**Show:** Merchant OS inventory and the Nomad 75 → Travel Case relationship.

**Say:** “The merchant publishes live stock, exact prices, structured specifications, provenance,
and deterministic compatibility. Tenant scoping prevents one merchant from reading or mutating
another merchant’s catalog. This relationship—not an LLM claim—makes the ₹999 case eligible.”

### 0:50–1:35 — Grounded discovery

**Show:** Buyer agent. Enter:

```text
Find the Nexora Nomad 75 quiet travel keyboard under ₹9000
```

**Say:** “The model helps parse and phrase the result, while SQL/pgvector retrieval and server-side
grounding own product identity, price, stock, and specifications. If Gemini fails, the same hard
constraints feed an immediate deterministic fallback. The buyer receives at most three evidence-
ranked choices with trade-offs.”

### 1:35–2:05 — Choice-preserving growth

**Show:** the ₹999 travel-case offer; first point out “No thanks,” then accept it.

**Say:** “Growth is bounded and optional. Nothing is preselected, rejection is as easy as acceptance,
and the buyer sees compatibility, benefit, trade-off, and exact incremental cost. Every impression
and response is recorded, but we call paid add-on revenue attribution—not causal lift.”

### 2:05–2:40 — Exact human approval

**Show:** two-line ₹8,498 quote, policy limits, expiry, checkbox, and approval action.

**Say:** “The server snapshots products, quantities, prices, currency, and total. A deterministic
policy checks quantity, aggregate value, ownership, state, stock, expiry, and Razorpay test mode.
The short-lived approval is signed, buyer-bound, quote-bound, and single-use. The browser cannot
submit an authoritative amount.”

### 2:40–3:15 — One graceful failure

**Show:** use the “exceed quantity limit” demo control.

**Say:** “Quantity six exceeds the configured maximum of five. Nexora stops with the stable code
`QUANTITY_LIMIT_EXCEEDED`. No approval, provider order, reservation, or stock mutation exists; an
immutable owner-scoped audit explains the block. I return to the preserved basket and retry with a
fresh valid quote.”

### 3:15–4:05 — Razorpay and settlement authority

**Show:** approve the valid quote, open Razorpay Test Checkout, complete a test payment, then show
`PAYMENT_PENDING` followed by backend-authoritative `PAID`.

**Say:** “Stock is reserved atomically before the exact test order is created. The Checkout callback
is deliberately non-authoritative. Only a signed webhook—or strict server reconciliation matching
one captured payment’s order, amount, and currency—can settle. Retries are idempotent, and capture
consumes the existing reservation without deducting stock twice.”

### 4:05–4:35 — Merchant outcome and audit

**Show:** merchant paid order, linked audit timeline, paid attachment, and ₹999 add-on revenue.

**Say:** “The merchant sees the complete correlation from intent to offer, quote, approval, provider
order, and settlement. The accepted case contributes exactly ₹999 once. Real and synthetic traffic
remain separate, and every denominator is documented.”

### 4:35–4:50 — External AI buyer

**Show:** capability JSON, catalog/OpenAPI links, and reference client.

**Say:** “A separate AI buyer can discover this merchant and reach the same human-approved Razorpay
handoff through either Nexora v1 or our pinned ACP 2026-04-17 checkout-session compatibility profile.
We claim the implemented profile, not third-party certification or unsupported payment protocols.”

### 4:50–5:00 — Close

**Say:** “Nexora turns intent into an order while keeping facts grounded, growth optional, money
bounded, approval human, and settlement verifiable.”

## Fallback recording plan

The submitted video should demonstrate a controlled provider failure rather than depending on an
unplanned outage:

1. Run the deterministic Playwright path from `npm run test:e2e`, which doubles only Gemini and
   Razorpay network edges while retaining real React, Django, PostgreSQL, policy, inventory, audit,
   and analytics behavior.
2. Show the forced Gemini-failure evaluation case returning grounded `FALLBACK` results.
3. Show the quantity-limit block and valid recovery.
4. Show the verified P0.2 Razorpay Test Mode evidence and the authoritative database invariants; do
   not present the deterministic provider double as a live Razorpay transaction.
5. End on merchant analytics and the public external-agent contract.

If the live demo fails:

| Failure | Safe pivot |
| --- | --- |
| Gemini unavailable/slow | Point out the visible fallback source and continue with grounded deterministic results |
| Razorpay Checkout unavailable | Stop before inventing paid state; use P0.2 evidence and explain the pending boundary |
| Webhook delayed | Keep `PAYMENT_PENDING`; show signed-delivery dashboard or strict reconciliation only when exact provider evidence exists |
| Public deployment cold start | Use the prerecorded uninterrupted fallback and disclose the cold start |
| Scheduler/readiness unhealthy | Do not claim operational acceptance; show the readiness failure and repository-controlled tests |

## Recording output requirements

- Maximum five minutes; 1080p where possible; readable browser zoom and captions.
- One public/unlisted URL accessible in a signed-out browser.
- No edits that make a failed or mocked payment appear live.
- No secrets, full buyer emails, instrument data, passwords, cookies, raw webhook payloads, or hidden
  chain-of-thought.
- Add the final URL to `docs/Submission.md` and the root README before submitting.
