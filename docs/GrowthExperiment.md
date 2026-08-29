# Randomized Add-on Revenue Experiment

Nexora now separates two different questions:

1. **Attribution:** how much paid revenue was attached to explicitly accepted add-on offers?
2. **Causal estimate:** did showing an eligible offer change merchant paid revenue per eligible visit?

The first is always reported from verified paid order lines. The second is reported only from the
randomized holdout experiment described here.

## Design

- Population: real, non-synthetic agent sessions where deterministic compatibility rules found at
  least one eligible in-stock add-on within the buyer's constraints.
- Randomization unit: eligible agent session.
- Control: no optional-product offer is rendered.
- Treatment: the same eligible offer flow already used by Nexora is rendered.
- Assignment: server-side HMAC bucketing, independent of Gemini output and invisible to the buyer.
- Primary metric: merchant paid revenue per eligible assigned session, including zero-revenue sessions.
- Guardrail: purchase-rate difference in percentage points.
- Default allocation: 50/50.
- Default interpretation threshold: at least 100 real sessions per arm.
- Uncertainty: a 95% normal-approximation interval for the difference in mean revenue.

Assignment is persisted before exposure. Control assignments therefore remain in the denominator even
though no `GrowthOffer` impression exists. Treatment offers link back to the assignment, and paid
outcomes are obtained only from backend-authoritative `PAID` order lines for the owning merchant.
Synthetic assignments are excluded.

## Enable a production experiment

Set a new versioned experiment key whenever eligibility, presentation, allocation, or the primary
metric changes:

```env
GROWTH_EXPERIMENT_ENABLED=True
GROWTH_EXPERIMENT_KEY=addon-offer-v1
GROWTH_EXPERIMENT_TREATMENT_BPS=5000
GROWTH_EXPERIMENT_MIN_SAMPLE_PER_VARIANT=100
```

Deploy the migration before enabling assignment. Do not change the allocation or eligibility logic
under the same experiment key. The Seller Workspace reports `NOT_STARTED`, `COLLECTING`,
`INCONCLUSIVE`, `POSITIVE_SIGNAL`, or `NEGATIVE_SIGNAL` and explains what can be concluded.

## Honest interpretation

Code makes a causal experiment possible; it cannot manufacture meaningful buyer traffic. Nexora must
remain in `COLLECTING` until both real arms reach the configured threshold. Even a positive interval is
an intent-to-treat estimate for the sampled eligible sessions and time window, not universal proof for
all merchants or products.
