# System Architecture & File Structure - Nexora

## 1. Tech Stack
- **Frontend:** React (Vite), TailwindCSS, Axios / TanStack Query
- **Backend:** Python (Django, Django REST Framework, Celery / Redis)
- **Database:** PostgreSQL (with `pgvector` for semantic search)
- **LLM Provider:** Groq (LLaMA 3/3.1 via Groq API)
- **Payment Gateway:** Razorpay API
- **Deployment:** Vercel (Frontend), Render / Railway (Backend + PostgreSQL)

## 2. Application Flow
[User Prompt] -> [React Frontend] -> [Django API]
|
[Groq Agent] <-> [PgVector / SQL Search]
|
[Recommendation Payload] -> [User Approval]
|
[Razorpay Payment Modal] -> [Webhook Verification]
|
[Order Created] -> [Merchant Dashboard Event Push]

## 3. Folder & File Structure
```
nexora/
├── backend/
│   ├── manage.py
│   ├── nexora_core/          # Django project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── agents/           # Groq integration, tools, prompts
│   │   │   ├── services.py   # LLM agent logic
│   │   │   ├── tools.py      # Structured search function tools
│   │   │   └── prompts.py    # System prompts
│   │   ├── merchants/        # Products, stock, catalog API
│   │   │   ├── models.py
│   │   │   ├── views.py
│   │   │   └── serializers.py
│   │   ├── orders/           # Checkout, Razorpay integration
│   │   │   ├── models.py
│   │   │   ├── views.py
│   │   │   └── webhooks.py
│   │   └── analytics/        # Agent conversion insights
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── components/       # Reusable UI (Chat, Product Cards)
│   │   ├── pages/            # Buyer UI & Merchant Dashboard
│   │   │   ├── BuyerChat.jsx
│   │   │   ├── MerchantDashboard.jsx
│   │   │   └── Inventory.jsx
│   │   ├── services/         # Axios API clients & Razorpay helper
│   │   ├── context/          # Auth & Chat State
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vite.config.js
└── docs/                     # Project Markdown Files
```