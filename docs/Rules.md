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