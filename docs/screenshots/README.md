# Phase 12 screenshots

These images document the Phase 12 responsive surfaces. Landing-page numbers are visibly labelled as a deterministic UI example; buyer and merchant operational state is loaded from the Django API.

- `phase12-landing.png` — public product narrative and labelled example trace.
- `phase12-buyer.png` — live buyer workspace with labelled onboarding prompts.
- `phase12-merchant.png` — authenticated, owner-scoped merchant workspace.

Regenerate them with `npm run screenshots` while Django and Vite are running. Set `NEXORA_CAPTURE_MERCHANT_USERNAME` and `NEXORA_CAPTURE_MERCHANT_PASSWORD` to a synthetic merchant account to capture the protected view. The script never stores those credentials.
