# Project Rules & Boundaries - Nexora

## 1. Allowed Technologies & Libraries
- **Backend:** Django REST Framework, `groq` Python SDK, `psycopg2-binary`, `razorpay`, `pydantic`.
- **Frontend:** React (Vite), `tailwindcss`, `@lucide/react`, `axios`, `@tanstack/react-query`.
- **Database:** PostgreSQL only (use `pgvector` extension for vector embeddings).

## 2. Anti-Patterns & Prohibitions
- **NO Heavy Frameworks:** Do NOT introduce LangChain or LlamaIndex unless strictly necessary; prefer clean SDK tool-calling wrappers to minimize latency and dependency bloat.
- **NO Raw LLM Execution Without Approval:** The AI agent MUST NEVER automatically trigger payment endpoints or finalize orders without explicit human signature/approval in the frontend.
- **NO Direct Database Mutations from Agent:** LLMs must call structured Django DRF internal services or functions, never raw SQL.

## 3. Boundary & Error Handling Standards
- **Groq Fallbacks:** If Groq rate limits or fails, fall back gracefully to exact SQL product keyword matching with a user notice.
- **Structured Output Safety:** Enforce `pydantic` schemas on all LLM JSON outputs. Reject and retry if JSON parsing fails.
- **Razorpay Webhooks:** Always verify Razorpay signatures server-side before updating order states in PostgreSQL.

## 4. Money-Action Invariants

- **Recommendation lineage:** An order must reference an exact grounded recommendation through `AgentSession -> RecommendationDecision -> Quote -> ApprovalGrant -> Order`.
- **No chain-of-thought storage:** Persist only concise request constraints, candidate IDs, evidence-based explanations, trade-offs, source, policy results, and reason codes. Never request, store, log, or display hidden reasoning.
- **Deterministic guardrail:** Currency, quantity, order value, merchant/product state, stock, quote expiry, price consistency, and Razorpay test mode are enforced by non-LLM code at quote, approval, and order boundaries.
- **Exact approval:** Approval is short-lived, signed, buyer-bound, quote-bound, and single-use. Missing, altered, expired, replayed, or cross-user approvals must stop before a provider order is created.
- **Server authority:** Browser values for amount, price, merchant, inventory ownership, order status, payment status, or audit fields are ignored or rejected.
- **Safe failure:** A blocked action creates a sanitized immutable reason-coded audit event and never creates a Razorpay order, decrements stock, or emits a paid audit.
- **Settlement authority:** Only a verified Razorpay webhook can mark an order paid and mutate stock.
- **No dark-pattern growth:** Add-ons are optional, unselected by default, bounded in count, and show exact incremental cost plus an honest trade-off. Rejecting is as easy as accepting; merchant labels cannot imply unverified savings or urgency.
- **Grounded attribution:** A paid add-on must link `AgentSession -> GrowthOffer -> buyer response -> QuoteItem -> OrderItem -> verified paid order`. Attribution describes recorded behavior, never causal lift.
