# Nexora submission screenshots

These images document the current responsive submission surfaces. Landing-page numbers are visibly labelled as a deterministic UI example; buyer and merchant operational state is loaded from the Django API.

- `nexora-landing-page.png` — current public product narrative and labelled example trace.
- `buyer-agent-workspace.png` — current live buyer workspace with labelled onboarding prompts.
- `merchant-operations-dashboard.png` — current authenticated, owner-scoped merchant operations view.

Regenerate them with `npm run screenshots` while Django and Vite are running. To capture the protected view, provide either a short-lived `NEXORA_CAPTURE_MERCHANT_SESSION_ID` or the `NEXORA_CAPTURE_MERCHANT_USERNAME` and `NEXORA_CAPTURE_MERCHANT_PASSWORD` of a synthetic merchant account. The script never stores authentication values.
