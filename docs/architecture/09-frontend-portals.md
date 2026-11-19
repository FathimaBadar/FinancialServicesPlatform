# Architecture Chapter 9 — Frontend, Portals & Widget Harness

**Parent Document:** [docs/architecture.md](file:///home/arun/FinancialServicesPlatform/docs/architecture.md)  
**Normative Standard:** [ui-std.md](file:///home/arun/FinancialServicesPlatform/ui-std.md) · **Workbench Guide:** [docs/widget-workbench.md](file:///home/arun/FinancialServicesPlatform/docs/widget-workbench.md)

---

## 1. Build Identities & Portals

```mermaid
flowchart LR
    SRC["one SPA codebase<br/>(Bun + Vite + React 18, TS strict)"]
    SRC --> ADM["admin.html → admin portal"]
    SRC --> MAN["manufacturer.html"]
    SRC --> DIB["distributor.html"]
    SRC --> WHO["wholesaler.html"]
    SRC --> MER["merchant.html"]
    SRC --> CH["index.html → chooser"]
    SRC --> WB["widget-workbench.html"]
```

Portals share `OrgApp` and differ only by `portal-config.ts` identity (name, accent, tenantSubType, menu). Eligibility = session tenant `subType` (`portalEligible`). `merchant.html` is the leaf portal (sub-type `MERCHANT`).

---

## 2. Session Hydration (Once per Portal Load)

```mermaid
sequenceDiagram
    participant SPA as portal app
    participant F as BFF
    participant C as core (via gateway)
    SPA->>F: GET /bff/session
    F-->>SPA: user summary (or AUTH_REQUIRED → bounce to login)
    SPA->>C: GET /api/me/permissions
    C-->>SPA: permission keys (RBAC resolve, subtree math)
    SPA->>C: GET /api/tenants/{tid}
    C-->>SPA: tenant subType → portal eligibility
    Note over SPA: TanStack Query keys: [domain, ...] — filters/tabs live in the URL
```

---

## 3. Widget Harness & Codegen

```mermaid
flowchart LR
    subgraph Codegen["bun widgets:* tooling"]
        GEN["widgets:gen → manifest + contracts + fixtures + tests + component"]
        CHK["widgets:check — registry ⇄ backend @FspOperation sync"]
        REG["widgets:register"]
    end
    subgraph Runtime["inside the SPA"]
        HOST["WidgetHost (core host/grid)"] --> REGD["registry (widget id → def)"]
        W["audit · trail widgets (first citizens)"]
    end
    subgraph ServerSide["server"]
        CAT["core catalog /internal/ops/catalog (ES256-signed)"]
        PB["portal builder bundles (same trust store)"]
    end
    GEN --> CHK --> REG
    REGD --> HOST
    CAT -.->|operation ids| CHK
    PB -.->|signed delivery| Runtime
```

A widget = manifest (id, permissions, fixtures, contracts) + a thin component. Tooling self-syncs against backend controllers so a widget never drifts from the operation catalog.

---

## 4. UI Standard Invariants

| Rule | Meaning on screen |
|---|---|
| Design tokens only | Closed semantic color-role set; `danger` reserved for destructive/error |
| `PostingStatePill` | Explicit states: `DRAFT` neutral, `PENDING_CHECKER` warning, `SUBMITTING` info pulsing, `COMMIT_UNKNOWN` **danger** ("do not retry" + *Check status*), `FINALIZED` success |
| Amount atom | Minor units input, `tabular-nums`, right-aligned, debit/credit colored |
| Four-eyes surfaces | Maker vs checker separated; checker sees read-only diff + maker + `plan_hash` |
| State & fetching | TanStack Query; URL-first state; server-driven pagination & sorting; financial mutations **never optimistic**; zero auto-retries on money POSTs |
| Skeletons, not spinners | Mobile-first, no window scroll |
