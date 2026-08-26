# Nexora Architecture Diagrams

These diagrams are evaluator-facing views of the implemented trust boundaries. Detailed endpoint,
model, and state invariants remain in `docs/Architecture.md` and `docs/API.md`.

## 1. System and authority boundaries

```mermaid
flowchart TB
    subgraph Public[Public discovery boundary]
        Buyer[Human buyer]
        External[External AI buyer]
        SPA[React SPA]
        WellKnown[Capability + OpenAPI + JSON Schema]
    end

    subgraph Server[Trusted Nexora server boundary]
        Auth[Session + CSRF + tenant scoping]
        Agent[Grounded recommendation orchestration]
        Growth[Deterministic compatibility and offer rules]
        Money[Deterministic money policy]
        Quote[Quote + single-use ApprovalGrant]
        Inventory[Row-locked stock reservations]
        Inbox[Payload-free webhook inbox]
        Audit[Immutable money audits and analytics]
    end

    DB[(PostgreSQL + pgvector)]
    Gemini[Gemini provider]
    Razorpay[Razorpay Test Mode]

    Buyer --> SPA
    External --> WellKnown
    SPA --> Auth
    WellKnown --> Auth
    Auth --> Agent
    Agent <-->|structured, bounded request| Gemini
    Agent --> DB
    Agent --> Growth
    Growth --> Quote
    Quote --> Money
    Money --> Inventory
    Inventory --> DB
    Inventory -->|exact paise amount| Razorpay
    Razorpay -->|raw body + HMAC signature| Inbox
    Inbox --> Inventory
    Inventory --> Audit
    Audit --> DB
```

The LLM boundary is advisory. Product facts are overwritten from the database, growth eligibility
is deterministic, and no model response can approve a quote, reserve stock, create a provider order,
or settle payment.

## 2. Successful recommendation-to-payment sequence

```mermaid
sequenceDiagram
    autonumber
    actor B as Buyer
    participant UI as React SPA
    participant API as Django API
    participant DB as PostgreSQL
    participant RP as Razorpay Test Mode

    B->>UI: Intent + ₹9,000 budget
    UI->>API: Search live catalog
    API->>DB: Filter and rank active in-stock products
    DB-->>API: Grounded product facts
    API-->>UI: Primary + optional ₹999 compatible add-on
    B->>UI: Explicitly accept add-on
    UI->>API: Record offer response and create cart
    API->>DB: Snapshot exact two-line quote (₹8,498)
    API-->>UI: Prices, total, limits, trade-offs, expiry
    B->>UI: Confirm exact quote
    UI->>API: Approve with Idempotency-Key
    API->>DB: Create signed buyer/quote-bound single-use grant
    UI->>API: Create checkout order with new Idempotency-Key
    API->>DB: Lock products, revalidate, reserve both units once
    API->>RP: Create exact INR 849800 test order
    RP-->>UI: Hosted Checkout authorization
    Note over UI,API: Browser callback remains PAYMENT_PENDING
    RP->>API: Signed capture webhook
    API->>DB: Deduplicate event, consume reservations, mark PAID
    API-->>UI: Authoritative PAID receipt
    API->>DB: Attribute ₹999 add-on line once
```

Strict provider reconciliation can use the same locked capture service when a webhook is delayed. It
repairs only one exact captured payment matching provider order, amount, and currency; ambiguity goes
to manual review.

## 3. Deliberate graceful failure

```mermaid
sequenceDiagram
    autonumber
    actor B as Buyer
    participant UI as React SPA
    participant API as Django API
    participant Policy as Deterministic policy
    participant DB as PostgreSQL
    participant RP as Razorpay

    B->>UI: Request quantity 6
    UI->>API: Create exact quote
    API->>Policy: Check per-item maximum (5)
    Policy-->>API: BLOCK / QUANTITY_LIMIT_EXCEEDED
    API->>DB: Mark quote BLOCKED + immutable MONEY_BLOCKED audit
    API-->>UI: Safe reason, exact limit, recovery action
    Note over API,RP: No provider call
    Note over API,DB: No ApprovalGrant, Order, reservation, or stock mutation
    B->>UI: Return to basket and choose quantity 1
    UI->>API: Create a fresh quote and approval
    API->>Policy: Re-run every guardrail
    Policy-->>API: ALLOW
```

## 4. Order and inventory lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> QUOTED
    QUOTED --> APPROVED
    APPROVED --> PAYMENT_PENDING: lock and reserve stock
    PAYMENT_PENDING --> PAID: verified capture
    PAYMENT_PENDING --> PAYMENT_FAILED: verified failure
    PAYMENT_PENDING --> CANCELLED: eligible buyer cancellation
    PAYMENT_PENDING --> EXPIRED: reservation timeout
    PAYMENT_FAILED --> REFUND_PENDING: late authoritative capture
    CANCELLED --> REFUND_PENDING: late authoritative capture
    EXPIRED --> REFUND_PENDING: late authoritative capture
    PAID --> REFUND_PENDING: bounded operator request
    REFUND_PENDING --> REFUNDED: verified refund
    REFUND_PENDING --> MANUAL_REVIEW: ambiguity/failure
```

An `ACTIVE -> CONSUMED` reservation never changes stock again. `ACTIVE -> RELEASED/EXPIRED` restores
stock once. Illegal backward transitions are rejected.
