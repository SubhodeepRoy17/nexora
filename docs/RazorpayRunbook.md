# Razorpay Test-Mode Reliability Runbook

## Scope and authority

Nexora accepts money only through an explicitly approved server quote and Razorpay test Checkout. Browser callbacks are hints. Final payment/refund state comes from a verified webhook or, for payment capture only, an exact server-to-server reconciliation result.

After a valid Checkout return, Nexora immediately fetches the signed payment ID from Razorpay and settles only if the provider reports the exact order-bound amount and currency as captured. This is the safe fallback during local development because Razorpay cannot deliver webhooks to `localhost`. Deployed environments must still register the public HTTPS webhook below; the scheduled stale-order reconciler remains the delayed recovery layer.

The implementation follows Razorpay's guidance to verify the untouched raw body, deduplicate using `x-razorpay-event-id`, and tolerate out-of-order delivery. See [webhook validation and idempotency](https://razorpay.com/docs/webhooks/validate-test/), [payment events](https://razorpay.com/docs/webhooks/payments/), and [refund events](https://razorpay.com/docs/webhooks/refunds/).

## Environment

Required secrets:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Safe operational settings:

```text
RAZORPAY_WEBHOOK_ALERT_ATTEMPTS=3
RAZORPAY_RECONCILIATION_STALE_MINUTES=10
RAZORPAY_REFUND_MAX_AMOUNT=100000.00
MONEY_REQUIRE_RAZORPAY_TEST_MODE=True
ORDER_RESERVATION_TTL_SECONDS=900
```

Never place real values in screenshots, logs, evidence JSON, source control, shell history, or support tickets. The webhook secret should differ from the API key secret.

## Dashboard webhook registration

In the Razorpay test-mode Dashboard, register exactly:

```text
https://<api-host>/api/orders/webhook/razorpay/
```

Enable these events only:

- `payment.authorized`
- `payment.captured`
- `order.paid`
- `payment.failed`
- `refund.created`
- `refund.processed`
- `refund.failed`

Use the same webhook secret as the deployed `RAZORPAY_WEBHOOK_SECRET`. Confirm HTTPS, a public 2xx health endpoint, and that no proxy rewrites the request body. Razorpay treats non-2xx delivery as failure; Nexora returns 202 for verified permanent payload exceptions after durably quarantining them and 500 only for retryable processing failures.

## Scheduled operations

Run both finite commands every five minutes:

```bash
python manage.py expire_checkouts --limit 1000
python manage.py reconcile_razorpay --stale-minutes 10 --limit 1000
```

The reconciler checks only stale `PAYMENT_PENDING` orders. It validates provider order ID, exact paise amount, currency, and one captured payment before reusing the locked capture transition. All other results remain unchanged and appear in Django admin under Reconciliation exceptions and in command JSON output.

## State response table

| State | Buyer/merchant meaning | Operator action |
| --- | --- | --- |
| `PAYMENT_PENDING` | Reservation active; settlement not proven | Wait for webhook/reconciler; inspect staleness after threshold |
| `PAYMENT_FAILED` | Verified failure; active reservation released once | Buyer may close/retry through a fresh quote |
| `CANCELLED` | Buyer cancelled; reservation released once | None unless later capture arrives |
| `EXPIRED` | Payment window elapsed; reservation expired once | None unless later capture arrives |
| `PAID` | Exact capture proven; reservation consumed once | Fulfil from the reserved units |
| `REFUND_PENDING` | Capture exists but fulfilment is unsafe, or refund awaits final webhook | Validate reason, then use bounded refund command if no refund exists |
| `REFUNDED` | Verified full-order refund processed | Close exception/evidence trail |
| `MANUAL_REVIEW` | Provider result is unsafe or ambiguous | Investigate; never edit stock/revenue to guess |

Late capture after a verified failure, cancellation, or expiry never becomes `PAID`: released inventory stays available and the order enters `REFUND_PENDING`.

## Bounded refund procedure

Refund creation uses Razorpay's normal-refund endpoint with an explicit full-order amount; omitting amount is forbidden in Nexora even though Razorpay supports it. Razorpay documents that only captured payments can be refunded and that the response may remain pending; the verified webhook is final. See [Create a Normal Refund](https://razorpay.com/docs/api/refunds/create-normal/).

1. Confirm the order is `REFUND_PENDING` or `MANUAL_REVIEW`, has a captured payment ID, is INR, and is within `RAZORPAY_REFUND_MAX_AMOUNT`.
2. Confirm no pending or processed `PaymentRefund` already exists.
3. Run the gated command, repeating the UUID intentionally:

   ```bash
   python manage.py initiate_razorpay_refund \
     --order <local-order-uuid> \
     --confirm <same-local-order-uuid> \
     --reason CAPTURE_WITHOUT_RESERVATION \
     --operator <non-PII-operator-reference>
   ```

   The other allowed reason is `FULFILLMENT_IMPOSSIBLE`. No free-form/LLM reason can initiate a refund.
4. Record the sanitized local/provider refund identifiers and wait for `refund.processed` or `refund.failed`.
5. If the API request is ambiguous or the refund fails, the order becomes `MANUAL_REVIEW`; do not retry automatically. Inspect Razorpay Dashboard before any further action.

## Alerts and investigation

Structured JSON events are emitted through `nexora.payments`:

- `razorpay_webhook_signature_failed`: verify URL secret, raw-body preservation, and secret rotation history.
- `razorpay_webhook_processing_failed`: inspect `WebhookEvent.error_code`; alert severity escalates at the configured attempt count.
- `razorpay_webhook_event_id_reused`: treat as a security/integration incident because one event ID arrived with a different body hash.
- `razorpay_reconciliation_exception`: inspect local order, provider status, exact amount/currency, reservations, and webhook delivery history.
- `razorpay_reconciliation_provider_error`: verify API credentials/connectivity; do not mutate the order manually.

The inbox stores no payload, card, email, contact, Checkout/webhook signature, key, or secret. Use Razorpay Dashboard for sensitive provider-level investigation and retain only redacted evidence.

## Required test-mode evidence

This checklist must be completed against the deployed environment before Phase 11 is marked complete. Store redacted screenshots/JSON outside secret-bearing logs, then link them from the submission evidence folder.

Successful payment:

- [ ] Test-mode Dashboard shows the exact Razorpay order, captured payment, paise amount, and INR.
- [ ] Local order ID/receipt linkage matches and local state converges to `PAID`.
- [ ] Each `StockReservation` is `CONSUMED`; product availability decreased only at reservation.
- [ ] Exactly one `PAYMENT_CAPTURED` audit and one merchant purchase conversion exist.
- [ ] Re-delivering the same webhook yields `already_processed`; inbox count, stock, paid audits, and attributed revenue remain unchanged.

Graceful failure:

- [ ] Use Razorpay's documented test failure path or cancel/expire before capture.
- [ ] Local state is `PAYMENT_FAILED`, `CANCELLED`, or `EXPIRED` and stock is restored once.
- [ ] The buyer and merchant see the safe reason-coded outcome.
- [ ] If deliberately testing a late capture, state is `REFUND_PENDING` and the bounded refund reaches verified `REFUNDED` or explicitly remains `MANUAL_REVIEW`.

Evidence redaction:

- [ ] Show only shortened provider/local IDs; hide keys, secrets, signatures, emails, contacts, card/VPA/bank details, and full webhook payloads.
- [ ] Record deployment URL, UTC timestamp, commit hash, migration version, and commands used.
- [ ] Record any unresolved exception honestly; do not label mocked or local-only results as deployed Razorpay evidence.
