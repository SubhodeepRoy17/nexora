# Nexora Frontend

Production-ready React client for the Nexora buyer agent and merchant dashboard.

The route map is:

- `/` — dedicated public product landing page.
- `/buyer` — live AI shopping workspace.
- `/login` — buyer/merchant session login.
- `/merchant`, `/merchant/inventory`, and `/merchant/analytics` — protected merchant OS.

The current visual system adapts the editorial grid and analytics hierarchy of the 21st.dev Cypon Analytics template, plus selected 21st.dev commerce, AI-state, process-card, stats-card, button, and navigation patterns. See `docs/UI.md` for the exact source mapping, licensing boundary, content rules, and responsive surface guidance.

## Run locally

```bash
npm install
npm run dev
```

Set `VITE_API_BASE_URL` when the Django API is not running at
`http://localhost:8000/api/`. Buyer search, catalog management, Razorpay order
creation, transaction timelines, and merchant analytics use live DRF endpoints.

The client bootstraps a Django session and CSRF token from `/api/auth/me/`, sends
credentialed requests, and attaches `X-CSRFToken` to unsafe methods. Buyer
search remains public. Checkout requires a signed-in account, and merchant
routes require an account that owns a merchant profile.

`vercel.json` preserves React Router deep links when deployed as a Vite SPA.

## Live-state contract

No active buyer or merchant route imports prototype mock data. The only deterministic fixtures are clearly labelled landing-page illustrations and onboarding example prompts. Authenticated buyer history and orders restore from Django after refresh; local storage is not used for authorization, approval, or payment state. A Razorpay callback can validate Checkout proof for fast feedback, but only webhook/reconciliation-backed order state renders paid.

The merchant workspace loads its authenticated profile, calculated catalog health, annotated product performance, relationships, orders, money-action timeline, webhook/reconciliation summary, and growth analytics from owner-scoped APIs. Sequential bounded polling prevents overlap, aborts on cleanup, pauses in hidden tabs, and displays last-updated/stale indicators.

## Verification

```bash
npm test
npm run build
```

Vitest and React Testing Library cover live search, honest no-result behavior, explicit approval, policy blocking, provider failure/retry, webhook-confirmed success, merchant scoping, and empty states.

To regenerate `docs/screenshots/`, run Django and Vite, then:

```bash
NEXORA_CAPTURE_MERCHANT_USERNAME=synthetic-owner \
NEXORA_CAPTURE_MERCHANT_PASSWORD=synthetic-password \
npm run screenshots
```

The capture account must be synthetic. The Playwright script uses an installed Chrome executable and does not persist credentials.
