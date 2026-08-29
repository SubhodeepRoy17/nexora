# ACP 2026-04-17 Compatibility Profile

Nexora implements a pinned Agentic Commerce Protocol checkout-session compatibility profile at
`/api/commerce/v1/acp/`. The target is the official ACP `2026-04-17` checkout specification maintained
by OpenAI and Stripe:

- specification: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/spec/2026-04-17>
- checkout RFC: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/rfcs/rfc.agentic_checkout.md>

This is an implemented compatibility claim, not a certification claim. ACP is beta and does not
publish an authority that can certify Nexora. The adapter is version-pinned, tested in CI, and keeps
Nexora's stricter human-present Razorpay boundary.

## Implemented surface

| Operation | Endpoint | Behavior |
| --- | --- | --- |
| Discover seller | `GET /.well-known/acp.json` | Official ACP discovery shape advertises the pinned REST checkout service |
| Issue buyer bearer token | `POST /api/commerce/v1/acp/agent-tokens/` | Authenticated buyer receives a short-lived signed token |
| Create session | `POST /api/commerce/v1/acp/checkout_sessions` | ACP line items become an exact bounded Nexora quote |
| Retrieve session | `GET /api/commerce/v1/acp/checkout_sessions/{id}` | Returns current quote/order state in ACP session form |
| Update session | `POST /api/commerce/v1/acp/checkout_sessions/{id}` | Accepts non-item refreshes; item replacement requires a fresh exact quote |
| Human approval extension | `POST .../{id}/approve` | Records explicit approval and returns a signed, expiring, single-use grant |
| Complete session | `POST .../{id}/complete` | Consumes that grant and creates the exact Razorpay Test order |
| Cancel session | `POST .../{id}/cancel` | Expires an unconsumed quote or safely releases an eligible reservation |
| Payment handler | `GET /api/commerce/v1/acp/payment-handler.json` | Declares the human-present Razorpay Test handoff and settlement authority |

Every ACP checkout request uses `API-Version: 2026-04-17`; every mutating request requires an
`Idempotency-Key`. Checkout responses use integer INR subunits, ACP status names, authoritative line
items and totals, messages, payment-handler capability metadata, and order/status links.

## Human-present completion

ACP creation returns `pending_approval`. The buyer must review the exact quote and confirm through the
approval extension. Completion accepts that signed grant as an approval credential, reserves stock,
and creates a Razorpay Test order. It returns `complete_in_progress` until a signed webhook or strict
provider reconciliation proves capture. A browser callback cannot produce `completed`.

## Claim boundary

- **Implemented:** ACP checkout-session field and lifecycle compatibility for the documented Nexora
  human-present Razorpay Test handler.
- **Not claimed:** delegated-payment credential vaulting, autonomous payment, fulfillment/shipping,
  discounts, webhooks to an ACP client, or certification by OpenAI, Stripe, or another body.
- **AP2:** requires signed checkout/payment mandates and credential-provider participation not exposed
  by Razorpay Test Checkout; Nexora does not invent those signatures.
- **x402:** uses a different HTTP payment/facilitator settlement model; mapping a Razorpay browser
  checkout to on-chain settlement would be false interoperability.
- **NPCI UAP:** the public pilot announcement is not a public conformance specification. Nexora keeps
  its contract ready for an adapter when an official schema and test suite are published.
