# Nexora Frontend

Production-ready React client for the Nexora buyer agent and merchant dashboard.

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
