# P0.3 Evidence — Graceful Quantity-Limit Failure

Verified on 2026-08-26 against the configured Neon PostgreSQL database and the real buyer/merchant APIs.
This proof used a CC0-labelled demo product and Razorpay Test Mode. No payment handoff opened and no
live money moved. The artifacts contain correlation identifiers and a masked buyer reference only.

## Buyer-visible safe block

- Requested product: `Nexora P03 Guardrail Keyboard`
- Requested quantity: `6`
- Configured per-item maximum: `5`
- Stable reason code: `QUANTITY_LIMIT_EXCEEDED`
- Quote: `506f7b76-0824-4a8f-a81c-c945993f5ff3` (`BLOCKED`)
- Agent session: `aee285cf-5e79-4fe8-aa51-2252efb96468`

The checkout explains the violated limit, states that no approval, Razorpay order, or reservation was
created, and provides one clear recovery action: return to the basket and choose five or fewer.

[Buyer safe-block capture](screenshots/p03-buyer-quantity-block.png)

## Server invariants

Immediately after the block, the authoritative database reported:

- approval grants for the blocked quote: `0`;
- Nexora orders for the blocked quote: `0`;
- stock reservations for the blocked quote: `0`;
- product stock before/after the block: `20 / 20`;
- quote status: `BLOCKED`.

The focused backend acceptance test patches both the Razorpay client factory and provider-order
creation function and asserts neither is called for the blocked request. It then submits a fresh
quantity-one quote and proves the valid retry alone reaches the mocked provider path exactly once,
creates one reservation, and decrements stock once.

## Immutable, tenant-scoped audit

- Audit: `94003101-4594-4082-99cc-8c78b5e24eb8`
- Action: `MONEY_BLOCKED`
- Outcome: `BLOCKED`
- Reason: `QUANTITY_LIMIT_EXCEEDED`
- Buyer reference: `Buyer #11`

The audit metadata retains the quantity-six line, configured limits, and failed `quantity_limit`
policy check. Buyer and owning merchant endpoints return the event; another merchant receives an
empty result. Audit model mutation remains prohibited.

[Merchant blocked-audit capture](screenshots/p03-merchant-blocked-audit.png)

## Automated recovery and reproduction

`CheckoutModal.test.jsx` drives the visible demo control, checks the zero-side-effect copy, returns to
the preserved quantity-one basket, requests a fresh quote, and reaches order creation. The evidence
capture can be reproduced against a running frontend/backend and a merchant account that owns the
searched product:

```bash
cd frontend
NEXORA_CAPTURE_MERCHANT_USERNAME=... \
NEXORA_CAPTURE_MERCHANT_PASSWORD=... \
npm run evidence:p03
```

Credentials remain environment-managed and are never stored in the script or screenshots.
