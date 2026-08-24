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

### B2B: Merchant Dashboard
- **Structured Catalog Management:** CRUD operations for products with strict schema enforcement (specs, variant tags, stock).
- **Agentic Analytics Engine:** Insights on search appearances, converted queries, and lost deals due to pricing/stock.
- **Real-Time Order & Timeline Audit:** Traceable log showing which AI agent recommended their product and transaction state.