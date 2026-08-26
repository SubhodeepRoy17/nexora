# Nexora Analytics Definitions

All merchant analytics are tenant-scoped by the authenticated merchant owner. “Real” means normal buyer traffic (`GrowthOffer.is_synthetic=false`); synthetic/demo records are returned under a separate segment and never included in real growth cards.

| Metric | Definition | Denominator / authority |
| --- | --- | --- |
| Agent impressions | Persisted `AgentSearchImpression` rows for the merchant | Count of all recorded recommendation impression rows in scope |
| Paid conversions | Distinct merchant audit orders with `PURCHASED` | Numerator for conversion; one verified order counts once even with multiple lines |
| Agent conversion rate | Distinct purchased orders / agent impressions | Zero when there are no impressions; observational attribution only |
| Paid catalog revenue | Sum of the merchant's `OrderItem.line_total` for `PAID` orders | All verified paid lines owned by the merchant; no impression denominator |
| Offer impressions | Persisted `GrowthOffer` rows | Every displayed eligible add-on |
| Offer accepts | Offers whose explicit response is `ACCEPTED` | Authenticated buyer response |
| Offer rejects | Offers whose explicit response is `REJECTED` | Authenticated buyer response |
| Accept rate | accepts / (accepts + rejects) | Pending offers excluded; denominator returned in API |
| Paid attached offers | Distinct growth offers linked to order items on `PAID` orders | Verified webhook settlement only |
| Paid attachment rate | paid attached offers / offer impressions | Denominator returned in API |
| Incremental paid revenue | Sum of `line_total` for paid `OrderItem` rows linked to a growth offer | Recorded attribution, not causal lift |
| Compatibility gap | Active relationship whose target is inactive or out of stock | Current catalog state |
| Impression trend | `(current 7-day impressions - previous 7-day impressions) / previous 7-day impressions` | Previous period is the denominator; returns 100% when current is nonzero and previous is zero |
| Conversion trend | `(current 7-day purchases - previous 7-day purchases) / previous 7-day purchases` | Previous period is the denominator with the same zero baseline rule |
| Lost opportunity count | Recorded scoped active products above budget plus scoped out-of-stock products | Count of `LostOpportunity` rows; it is not divided by searches and is not lost revenue |

Top converting complements group paid attached order lines by source/related product and relationship
type. Rejected offers group explicit rejections by product and relationship type. Refunded orders are
not counted as paid revenue. A controlled experiment for causal lift remains future work, and the UI
does not imply that observational attribution proves lift.

Every growth metric is calculated twice using the identical formula: `real` filters
`GrowthOffer.is_synthetic=false`, while `synthetic` filters `true`. The two numerators and
denominators are never combined. Top complements and rejected-offer cards use real traffic only;
compatibility gaps describe current merchant catalog state rather than buyer behavior.

The canonical P0.6 quality set is `docs/evaluation/buyer_intents.json`; its generated measurements
are in `docs/Evaluation.md` and `docs/evaluation/results.json`. The smaller
`docs/evaluation/growth_scenarios.json` remains a legacy behavior fixture and is not the source of
submission quality claims.
