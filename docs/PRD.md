# Product Requirement Document (PRD) - Nexora

## 1. Project Overview
Nexora is an AI-native shopping platform transforming e-commerce from manual search-and-browse into autonomous, agentic commerce. Users state natural language shopping intents; the AI Buyer Agent parses requirements, queries merchant databases, ranks options based on specs/reviews, presents recommendations, and executes Razorpay payments upon user approval.

## 2. Target Users
1. **Shoppers (B2C):** Tech-savvy buyers looking for zero-friction, intent-based discovery and automated buying.
2. **Merchants (B2B):** Independent brands and retailers needing AI-ready inventory management and agent-driven sales channels.

## 3. Core Features

### B2C: AI Buyer Agent Interface
- **Intent-Based Conversational Search:** Natural language processing for complex constraints (budget, specs, use cases).
- **Multi-Merchant Aggregation & Comparison:** Dynamic product comparison engine highlighting value propositions.
- **Human-in-the-Loop Checkout:** Explicit approval step generating temporary order holds and Razorpay SDK integration.
- **Live Transaction Timeline:** Real-time visual progress of agent reasoning, product lookup, and order placement.
- **Choice-Preserving Growth Suggestions:** At most a small bounded set of compatible catalog add-ons, each showing exact incremental cost, catalog evidence, benefit, and trade-off. Nothing is preselected or automatically added.

### B2B: Merchant Dashboard
- **Structured Catalog Management:** CRUD operations for products with strict schema enforcement (specs, variant tags, stock).
- **Agentic Analytics Engine:** Insights on search appearances, converted queries, and lost deals due to pricing/stock.
- **Real-Time Order & Timeline Audit:** Traceable log showing which AI agent recommended their product and transaction state.
- **Relationship and Offer Management:** Owner-scoped accessories, complements, substitutes, bundles, compatibility facts, and optional merchant labels.
- **Honest Growth Attribution:** Offer impressions, explicit accepts/rejects, paid attachment, and paid add-on line revenue with real and synthetic traffic separated. Recorded attribution is never presented as causal lift.
- **Randomized Growth Measurement:** Eligible real sessions are assigned to offer/no-offer arms before
  exposure; merchant revenue per eligible session, conversion lift, sample gates, and uncertainty are
  reported separately from attribution.

## 4. Growth Experience Requirements

- Product relationships are deterministic catalog data, not generated claims. Add-on eligibility requires an active relationship, active in-stock products, compatible structured facts, and a basket that respects buyer constraints and money-policy limits.
- The buyer must explicitly choose “Add to quote” or “No thanks” for every displayed add-on. Both actions receive equal visual weight, and no savings, scarcity, or countdown claim may be invented.
- Any basket change creates a new server quote. Approval applies only to the exact products, quantities, prices, and total in that quote.
- Incremental revenue means the sum of buyer-approved add-on `OrderItem.line_total` values on webhook-confirmed paid orders. It is attribution evidence, not proof of causality.
- Causal lift means only the scoped intent-to-treat difference produced by the versioned randomized
  experiment after both arms meet the configured minimum; it is never inferred from paid add-on lines.
