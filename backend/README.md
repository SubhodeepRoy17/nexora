# Nexora Backend

Django REST Framework backend for Nexora's merchant catalog, buyer agents, orders, and merchant analytics.

## Local setup

1. Create and activate a Python 3.12+ virtual environment.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and provide PostgreSQL credentials.
4. Create the configured PostgreSQL database, then run:

   ```bash
   python manage.py migrate
   python manage.py runserver
   ```

The product CRUD endpoint is available at `http://localhost:8000/api/merchants/products/`.

The buyer-agent endpoint accepts `{"query": "..."}` at
`http://localhost:8000/api/agents/search/`. It uses Groq local tool calling when
`GROQ_API_KEY` is configured and falls back to deterministic ORM keyword search
if the provider is unavailable.

Catalog search applies indexed SQL constraints before hybrid ranking. If the
PostgreSQL server provides pgvector, `python manage.py migrate` creates and
backfills an HNSW cosine index automatically. On servers without the extension,
the application remains operational through indexed SQL search. After adding
pgvector binaries to an existing server, run:

```bash
python manage.py setup_pgvector
```

Payment endpoints:

- `POST /api/orders/create/` creates a local pending order and corresponding Razorpay order.
- `POST /api/orders/webhook/razorpay/` verifies the raw-body webhook signature and applies payment state transitions.
- `GET /api/orders/audits/` returns webhook-backed merchant timeline records.

Analytics endpoint:

- `GET /api/merchants/analytics/` aggregates impressions, paid conversion rate,
  attributed revenue, trends, and price/stock losses.
- Add `?merchant=<id>` to scope the response to one merchant.

Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and
`RAZORPAY_WEBHOOK_SECRET` in `.env`. Only use Razorpay test-mode keys during
local development.

## Production

WhiteNoise serves compressed, hashed Django static assets. `render.yaml` and
`Procfile` provide Render/Gunicorn commands, while all hosts, origins, database,
Groq, and Razorpay values remain environment-driven. Set the frontend's
`VITE_API_BASE_URL` to the deployed API URL ending in `/api/`.

## Catalog JSON schema

`Product.specifications` is validated with Pydantic. Unknown fields and invalid types are rejected. Supported fields currently include switches, connectivity, battery life, dimensions, layout, keycaps, hot-swap support, color, material, and warranty duration.
