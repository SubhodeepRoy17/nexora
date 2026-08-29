# Nexora submission screenshots

These images document the current desktop submission surfaces. Landing-page numbers are visibly labelled as a deterministic UI example. The populated merchant captures below use the capture runner's redacted, deterministic UI fixture and are presentation evidence only; live tenant scoping, payment and analytics claims remain supported by the API, automated tests and Phase evidence documents.

- `nexora-landing-page.png` — current public product narrative and labelled example trace.
- `nexora-sign-in.png` — current buyer sign-in experience.
- `nexora-sign-up.png` — current buyer and seller account-creation experience.
- `buyer-agent-workspace.png` — current live buyer workspace with labelled onboarding prompts.
- `merchant-operations-dashboard.png` — populated merchant overview UI capture.
- `merchant-inventory-workspace.png` — populated merchant inventory and catalog controls.
- `merchant-sales-insights.png` — populated sales, offer and missed-opportunity UI.

Regenerate them with `npm run screenshots` while Django and Vite are running. To capture protected views from an authenticated synthetic merchant, provide either a short-lived `NEXORA_CAPTURE_MERCHANT_SESSION_ID` or `NEXORA_CAPTURE_MERCHANT_USERNAME` and `NEXORA_CAPTURE_MERCHANT_PASSWORD`. For deterministic redacted UI captures without touching an account, set `NEXORA_CAPTURE_UI_FIXTURES=1`. The script never stores authentication values, and fixture values must never be represented as production evidence.
