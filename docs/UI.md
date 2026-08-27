# Nexora UI System

## Direction

The August 2026 redesign uses [Cypon Analytics on 21st.dev](https://21st.dev/@nextjsshop/templates/cypon-analytics) as its primary visual reference. Its editorial grid, sharp framed surfaces, violet signal color, compact mono labels, and product-preview hierarchy fit Nexora's combined AI-commerce and merchant-analytics story better than a pure ecommerce storefront or cinematic AI template.

Nexora adapts the visual grammar to the existing Vite/React application rather than importing the Next.js template wholesale. This preserves the live Django session, buyer search, quote approval, Razorpay handoff, merchant tenancy, and polling behavior. Template artwork, copy, brands, and demo claims are not copied.

## 21st.dev component mapping

- The public hero combines the hierarchy of Cypon Analytics with the commerce framing of [Commerce Hero](https://21st.dev/@bankkroll/components/commerce-hero). Nexora's implementation is original because that component lists an unknown license and its registry requires an account API key.
- The landing product overview adapts the varied-density grid hierarchy of Kavi Katiyar's [Bento Product Features](https://21st.dev/@kavikatiyar/components/bento-product-features): one dominant product story surrounded by compact capability, control, integration, and signal cards. Nexora uses original commerce content, components, and watercolor styling rather than copying the published source.
- The live decision trace follows the state-card pattern described by the MIT-licensed [Tool Invocation](https://21st.dev/@Alwurts/components/tool-invocation): clear working/success/blocked states, concise arguments/results, and no hidden chain-of-thought.
- The bounded purchase sequence adapts the information hierarchy of the first illustrated cards in the official [Next.js homepage “What's in Next.js?” section](https://nextjs.org/): a large explanatory visual above a restrained, square-cornered footer. Each card starts with one precise operational signal, then reveals its detailed explanation and a step-specific animation on hover, keyboard focus, or touch. Nexora's four diagrams, content, watercolor palette, and implementation are original and use no Next.js site assets or source.
- Merchant metrics adapt the compact visual hierarchy seen in [Stats Cards](https://21st.dev/@beratberkayg/components/stats-cards), with all active-dashboard values supplied by the backend. The landing-page chart is explicitly labelled illustrative.
- Buttons, badges, bento cards, navigation, AI working states, CTAs, and the footer share one local primitive system in `frontend/src/components/ui/Primitives.jsx`.
- Buyer onboarding adapts the tabbed-card hierarchy from the [21st.dev login/signup collection](https://21st.dev/community/components/s/login-signup): sign-in and account creation remain distinct states within one responsive, accessible surface.
- The approval modal adapts the responsive section and order-summary hierarchy documented by [Ruixen Checkout Form](https://21st.dev/community/components/ruixen.ui/checkout-form). Nexora replaces generic address/card inputs with its actual basket, add-on choice, exact-quote, approval, reservation, Razorpay handoff, and webhook-verification lifecycle.

No 21st.dev private registry code, paid template source, imagery, customer logos, or unknown-license source code is stored in the repository.

## Routes and surfaces

- `/` — dedicated responsive public landing page.
- `/buyer` — live public-search/authenticated-checkout workspace.
- `/login` — session sign-in plus public buyer-and-merchant registration; `?mode=signup` creates an isolated owner-scoped merchant workspace while merchant-role links remain sign-in only.
- `/merchant`, `/merchant/inventory`, `/merchant/analytics` — protected merchant workspace.

The public and buyer surfaces use warm white, ink, violet, emerald, sharp grid frames, DM Sans, and IBM Plex Mono. The merchant OS uses the same geometry and signal colors on an ink workspace to distinguish operational data from marketing content.

## Content rules

- Explain capabilities with evidence and precise authority boundaries.
- Never say a browser callback means paid.
- Never imply an add-on is automatic or hide its incremental amount.
- Clearly label illustrative landing-page metrics; live merchant views remain API-backed.
- Avoid protocol-compliance, causal-revenue, or autonomous-payment claims.
- Preserve visible focus states, semantic headings, labelled controls, reduced-motion behavior, and usable mobile navigation.
