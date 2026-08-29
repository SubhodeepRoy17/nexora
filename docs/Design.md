# Design System & Live UI Contract — Nexora

## Visual language

Nexora uses a warm editorial buyer surface and a dense dark merchant operations surface. DM Sans is the primary typeface and IBM Plex Mono identifies IDs, provenance, status, limits, and timestamps. Violet represents agent/policy activity, emerald is reserved for backend-confirmed success, amber means pending or stale, and rose means stopped, failed, or operator attention. Color is never the only status signal.

The system adapts layout ideas documented in `docs/UI.md`; it does not copy private assets. Sharp borders, offset shadows, structured grids, and restrained motion make state boundaries visible at desktop and mobile widths.

## Data truth rules

- Landing-page traces and metrics are visibly labelled `Deterministic UI example` and `Not live data` before any illustrative number appears.
- Onboarding prompts are labelled examples. They never look like previous buyer activity or a catalog response.
- Buyer conversations, recommendations, quotes, policy limits, orders, receipts, refunds, and payment outcomes come from Django. Historical recommendations are labelled snapshots and cannot be purchased with expired or omitted decision tokens.
- Merchant identity is selected by the authenticated owner relationship. Catalog health, product performance, relationships, analytics, orders, audit events, webhook counts, and reconciliation exceptions are owner-scoped backend values.
- “Paid” and emerald success styling require authoritative `PAID`; Razorpay browser callbacks remain pending proof only.
- Every polled panel shows last-updated or stale state. A retained snapshot is labelled when refresh fails.

## Buyer interaction contract

Search preserves the buyer’s draft after a recoverable API error. No-result responses provide a broader-query action, while deterministic provider fallback is named explicitly. The latest authenticated conversation and order history restore from private APIs after refresh; guest state stays memory-only and grants no payment authority.

Checkout follows basket → exact server quote → explicit checkbox approval → Razorpay handoff → verified status. Optional add-ons have equally visible accept/reject controls and no preselection. Pending orders can be resumed or cancelled from backend order history. Receipts expose immutable item snapshots, exact total, order state, refund state, and timestamps.

## Merchant interaction contract

Each panel defines loading, empty, stale, retained-error, and permission boundaries. The catalog-health score is five equal checks per product: active, in stock, description, structured specifications, and search tags. Product impression/conversion values are annotated by the API; missing performance is zero recorded events, not a placeholder.

Payment operations display exact order-state counts, processed webhook inbox count, open reconciliation exceptions, and recent webhook-confirmed paid receipts. Timeline labels use backend action names rather than interpreting manual review or refunds as a generic “lost conversion.”

## Accessibility and responsive behavior

- All controls have visible `:focus-visible` treatment and semantic names.
- Checkout, order receipt, product editor, and spec viewer trap focus, support Escape, and restore prior focus.
- Checkout/order status and errors use live regions or alert roles; errors remain associated with the action area.
- In-flight actions disable duplicate submission while form and basket input survive recoverable errors.
- `prefers-reduced-motion` collapses animation and smooth scrolling.
- Sidebars become dismissible overlays, tables remain horizontally scrollable, and checkout stacks at mobile widths without hiding totals or approval controls.

## Evidence

Current captures live in `docs/screenshots/`. They are reproducible with the environment-driven `frontend/scripts/capture-screenshots.mjs`; credentials are never stored by the script. Public pages can be captured directly, protected pages can use a synthetic authenticated merchant, and `NEXORA_CAPTURE_UI_FIXTURES=1` provides explicitly non-production, redacted presentation fixtures without changing external data.
