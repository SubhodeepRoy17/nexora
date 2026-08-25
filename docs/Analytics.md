# Nexora Analytics Definitions

All merchant analytics are tenant-scoped by the authenticated merchant owner. “Real” means normal buyer traffic (`GrowthOffer.is_synthetic=false`); synthetic/demo records are returned under a separate segment and never included in real growth cards.

| Metric | Definition | Denominator / authority |
| --- | --- | --- |
| Agent impressions | Persisted `AgentSearchImpression` rows for the merchant | All recorded recommendation impressions |
| Paid conversions | Distinct merchant audit orders with `PURCHASED` | Verified backend order state |
| Paid catalog revenue | Sum of the merchant's `OrderItem.line_total` for `PAID` orders | Verified webhook settlement only |
| Offer impressions | Persisted `GrowthOffer` rows | Every displayed eligible add-on |
| Offer accepts | Offers whose explicit response is `ACCEPTED` | Authenticated buyer response |
| Offer rejects | Offers whose explicit response is `REJECTED` | Authenticated buyer response |
| Accept rate | accepts / (accepts + rejects) | Pending offers excluded; denominator returned in API |
| Paid attached offers | Distinct growth offers linked to order items on `PAID` orders | Verified webhook settlement only |
| Paid attachment rate | paid attached offers / offer impressions | Denominator returned in API |
| Incremental paid revenue | Sum of `line_total` for paid `OrderItem` rows linked to a growth offer | Recorded attribution, not causal lift |
| Compatibility gap | Active relationship whose target is inactive or out of stock | Current catalog state |

Top converting complements group paid attached order lines by source/related product and relationship type. Rejected offers group explicit rejections by product and relationship type. Refund subtraction and experimental causal-lift measurement are intentionally deferred until the refund and evaluation phases; the UI does not imply either is already measured.

The Phase 9 synthetic behavior set is versioned at `docs/evaluation/growth_scenarios.json`. It covers relevant accept, relevant reject, incompatible, out-of-stock, and no-relationship outcomes.
