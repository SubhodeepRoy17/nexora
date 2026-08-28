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

On the Vercel deployment, set `VITE_API_BASE_URL=/api/`. The first rewrite in
`vercel.json` proxies that path to Render before the React Router fallback. This
keeps Django's session and CSRF cookies on the frontend origin instead of relying
on browser support for third-party cookies.

The client bootstraps a Django session and CSRF token from `/api/auth/me/`, sends
credentialed requests, and attaches `X-CSRFToken` to unsafe methods. Buyer
search remains public. Checkout requires a signed-in account, and merchant
routes require an account that owns a merchant profile.

When the configured API is cross-origin, the client performs a two-request CSRF-cookie round trip.
If the browser does not return that credential cookie, an accessible privacy prompt explains how to
allow third-party cookies for Nexora, offers a server-observed recheck, and still lets the visitor
continue through public guest search. Browsers do not expose a top-level, location-style API for
changing this global privacy setting, so the prompt never claims to grant permission itself. A
same-origin `/api/` deployment bypasses the prompt because it does not need third-party cookies.

`vercel.json` proxies API requests first, then preserves React Router deep links
when deployed as a Vite SPA.

## Live-state contract

No active buyer or merchant route imports prototype mock data. The only deterministic fixtures are clearly labelled landing-page illustrations and onboarding example prompts. Authenticated buyer history and orders restore from Django after refresh; local storage is not used for authorization, approval, or payment state. A Razorpay callback can validate Checkout proof for fast feedback, but only webhook/reconciliation-backed order state renders paid.

The merchant workspace loads its authenticated profile, calculated catalog health, annotated product performance, relationships, orders, money-action timeline, webhook/reconciliation summary, and growth analytics from owner-scoped APIs. Sequential bounded polling prevents overlap, aborts on cleanup, pauses in hidden tabs, and displays last-updated/stale indicators.

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

Vitest and React Testing Library cover live search, honest no-result behavior, explicit approval, policy blocking, provider failure/retry, webhook-confirmed success, merchant scoping, and empty states.
The P0.4 Playwright command additionally drives the complete browser and refresh lifecycle against a
Django live server and PostgreSQL test database, with only Gemini/Razorpay network edges doubled.

To regenerate `docs/screenshots/`, run Django and Vite, then:

```bash
NEXORA_CAPTURE_MERCHANT_USERNAME=synthetic-owner \
NEXORA_CAPTURE_MERCHANT_PASSWORD=synthetic-password \
npm run screenshots
```

The capture account must be synthetic. The Playwright script uses an installed Chrome executable and does not persist credentials.
