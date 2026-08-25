# Execution Phases - Nexora

## Phase 1: Foundation & Merchant Catalog (Core Infrastructure)
- Set up Django backend, PostgreSQL database, and React frontend shell.
- Create Merchant Product models with structured JSON specifications.
- Build basic Merchant Dashboard CRUD interface for catalog and stock management.

## Phase 2: Gemini AI Buyer Agent Engine
- Integrate the Gemini API with structured function calling.
- Build intent parsing service (Extracting category, budget, specs from user input).
- Implement PostgreSQL database query matching (SQL + basic semantic filtering).
- Build the conversational Chat UI with real-time agent reasoning steps.

## Phase 3: Recommendation Engine & Interactive UI
- Implement comparative reasoning logic (Ranking top 3 products with pros/cons).
- Create product recommendation cards and specification visualizers in React.
- Build human-in-the-loop approval interface with cart holds.

## Phase 4: Razorpay Transaction Loop & Webhooks
- Integrate Razorpay payment gateway on backend and frontend checkout modal.
- Build webhook handlers to verify signature and mark orders as paid.
- Connect completed orders directly to merchant order management.

## Phase 5: Agentic Merchant Analytics & Polish
- Implement analytics tracking on merchant products (Search impressions vs agent conversions).
- Build the Merchant "Agent Timeline" showing transaction lifecycles.
- Final testing, latency optimizations, and deployment.
