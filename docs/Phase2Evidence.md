# Phase 2 Evidence — Paid Growth Transaction

Verified on 2026-08-26 against Razorpay Test Mode and the configured Neon PostgreSQL database.
No live money moved. This document contains correlation identifiers only; it contains no API secret,
payment instrument, raw webhook body, password, or buyer PII.

## Buyer and growth decision

- Prompt: `Find the Nexora Nomad 75 quiet travel keyboard under ₹9000`
- Ranking provider: Gemini
- Primary item: `Nexora Nomad 75` — ₹7,499
- Compatible add-on explicitly accepted: `Nexora Nomad 75 Travel Case` — ₹999
- Exact approved total: ₹8,498
- Agent session: `…a2f4b5c5`
- Primary decision: `…9ca77521`
- Add-on decision: `…a1af736f`
- Growth offer: `…2956948e` (`ACCEPTED`)

## Bounded money action

- Quote: `…713ba5a7`
- Exact approval: `…1bd7e7`
- Nexora order: `…48ad5f54`
- Razorpay test order: `…Ro9UwA`
- Razorpay test payment: `…llCEPh9`
- Provider result: `captured`, Netbanking, INR 849800 subunits
- Authoritative Nexora result after strict provider reconciliation: `PAID`

The browser callback remained non-authoritative. The backend fetched the order's provider payments,
matched order ID, amount, currency, and captured status, and then performed the state transition.
The checkout authorization capture is [p02-razorpay-test-payment.png](screenshots/p02-razorpay-test-payment.png).

## Exactly-once checks

- Both stock reservations are `CONSUMED`.
- The order contains exactly two immutable lines; only the ₹999 case line references the accepted growth offer.
- There is one `PAYMENT_CAPTURED` audit and one `RECONCILED` audit, both carrying
  `RECONCILIATION_VERIFIED`.
- A second reconciliation run reported `checked=0`, `repaired=0`, `exceptions=[]`.
- Merchant real-traffic analytics report one paid attached offer and ₹999.00 incremental paid
  add-on revenue. This is attributed line revenue, not a causal lift estimate.

## Failure handled while proving the phase

The first checkout reservation expired while the hosted Razorpay UI was being exercised. Running
`python manage.py expire_checkouts` initially exposed a PostgreSQL-only nullable outer-join locking
error. Nexora now locks the quote row without joining nullable `Quote.cart`; the normal retry then:

- changed the first order to `EXPIRED`;
- changed both reservations to `EXPIRED` and returned stock once;
- created the immutable expiry audit; and
- allowed a new quote and order instead of extending an expired money authorization.

The submission's primary deliberate failure remains the `QUANTITY_LIMIT_EXCEEDED` flow in P0.3.

## Reproduction helper

`frontend/scripts/complete-razorpay-test-payment.mjs` drives the current hosted Razorpay Test Mode
Netbanking flow. It requires `NEXORA_TEST_CHECKOUT_URL` to point to a locally generated Checkout
handoff page and uses the already-installed `playwright-core`. The helper contains no credentials.

## Deployment boundary

This original proof used strict provider reconciliation because the local environment had no public
HTTPS webhook URL. Real deployed signed delivery is now verified in `Phase7Evidence.md`. A redacted
Razorpay Dashboard delivery-row capture and account-owner redelivery remain the final webhook
control-plane evidence and must not be replaced with a mocked or locally signed request.
