# Nexora UI System

## Direction

The August 2026 redesign uses [Cypon Analytics on 21st.dev](https://21st.dev/@nextjsshop/templates/cypon-analytics) as its primary visual reference. Its editorial grid, sharp framed surfaces, violet signal color, compact mono labels, and product-preview hierarchy fit Nexora's combined AI-commerce and merchant-analytics story better than a pure ecommerce storefront or cinematic AI template.

Nexora adapts the visual grammar to the existing Vite/React application rather than importing the Next.js template wholesale. This preserves the live Django session, buyer search, quote approval, Razorpay handoff, merchant tenancy, and polling behavior. Template artwork, copy, brands, and demo claims are not copied.

## 21st.dev component mapping

- The public hero combines the hierarchy of Cypon Analytics with the commerce framing of [Commerce Hero](https://21st.dev/@bankkroll/components/commerce-hero). Its foreground now tells the product story in sequence: a buyer intent types into a translucent prompt, the two headline lines reveal through masks, and the explanation, actions, and grounded trust proofs follow in a restrained stagger. The artwork remains unchanged, and every entrance has a reduced-motion fallback. Nexora's implementation is original because that component lists an unknown license and its registry requires an account API key.
- The landing product overview adapts the varied-density grid hierarchy of Kavi Katiyar's [Bento Product Features](https://21st.dev/@kavikatiyar/components/bento-product-features): one dominant product story surrounded by compact capability, control, integration, and signal cards. Its one-time staggered scroll choreography and purposeful in-card motion follow the product-demo restraint seen on [Linear](https://linear.app/) and [Stripe](https://stripe.com/), with reduced-motion fallbacks. Nexora uses original commerce content, components, and watercolor styling rather than copying published source.
- The live decision trace follows the state-card pattern described by the MIT-licensed [Tool Invocation](https://21st.dev/@Alwurts/components/tool-invocation): clear working/success/blocked states, concise arguments/results, and no hidden chain-of-thought.
- The bounded purchase sequence adapts the information hierarchy of the first illustrated cards in the official [Next.js homepage “What's in Next.js?” section](https://nextjs.org/): a large explanatory visual above a restrained, square-cornered footer. A scroll-drawn route and alternating card unfolds establish sequence, while each card starts with one precise operational signal and reveals its detailed explanation plus a step-specific animation on hover, keyboard focus, or touch. Nexora's four diagrams, content, watercolor palette, and implementation are original and use no Next.js site assets or source.
- The Safety section is an original verification corridor: watercolor auroras, a staggered policy-principle group, a scanning execution trace, and an amber-to-safe failure handoff make the money boundary visible without implying autonomous payment authority.
- The landing footer adapts the curtain-reveal, moving trust line, oversized masked wordmark, and tactile return control described by [Motion Footer on 21st.dev](https://21st.dev/community/components/easemize/motion-footer/default). Its structure, responsive layout, copy, colors, and motion implementation are original to Nexora.
- Merchant metrics adapt the compact visual hierarchy seen in [Stats Cards](https://21st.dev/@beratberkayg/components/stats-cards), with all active-dashboard values supplied by the backend. The landing-page chart is explicitly labelled illustrative.
- Buttons, badges, bento cards, navigation, AI working states, CTAs, and the footer share one local primitive system in `frontend/src/components/ui/Primitives.jsx`.
- Buyer onboarding takes interaction inspiration from Masdouk Adelakoun's [Auth Switch on 21st.dev](https://21st.dev/community/components/appvibed01/auth-switch/default): sign-in and account creation exchange sides through one fluid, curved story panel instead of navigating between visually unrelated screens. Nexora's original implementation extends the landing page's watercolor landscape, translucent depth, commerce-specific trust signals, password visibility controls, mobile stacking, and reduced-motion fallback without changing the security flow.
- The buyer and merchant workspaces take structural inspiration from [ChatGPT](https://chatgpt.com/): full-height sidebars collapse into a narrow desktop icon rail, panel controls reveal a bidirectional affordance on hover, and the signed-in initials/name control owns the account sign-out menu. Their shared transparent workspace navigation keeps Shopping assistant, Seller workspace, and For AI shoppers visible without duplicating the Nexora wordmark or account action. Buyer history remains private and independently scrollable, while the merchant rail exposes the same interaction model for operational routes. Nexora retains its own watercolor system and makes catalog provenance, grounded product evidence, explicit quote approval, and provider-authoritative payment status more visible than a general-purpose chat interface.
- The approval modal adapts the responsive section and order-summary hierarchy documented by [Ruixen Checkout Form](https://21st.dev/community/components/ruixen.ui/checkout-form). Nexora replaces generic address/card inputs with its actual basket, add-on choice, exact-quote, approval, reservation, Razorpay handoff, and webhook-verification lifecycle.
- Desktop users get restrained, slightly larger Windows-style arrow and hand cursors with a subtle Nexora violet edge. The hand covers actionable links and controls, while familiar native text, dragging, resizing, and disabled shapes remain intact and touch interaction is unchanged.

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
