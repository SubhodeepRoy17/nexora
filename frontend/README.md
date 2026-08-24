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

`vercel.json` preserves React Router deep links when deployed as a Vite SPA.
