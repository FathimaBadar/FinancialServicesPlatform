# Frontend & UI Development Rules

**Scope:** `frontend/` SPA, widgets, portals, and UI components.
**Parent Rule:** [AGENTS.md](file:///home/arun/FinancialServicesPlatform/AGENTS.md) (Universal Invariants & FAPI 2.0 Compliance).
**Normative Standard:** [ui-std.md](file:///home/arun/FinancialServicesPlatform/ui-std.md) (Complete Design System & React Guide).

---

## 1. Toolchain rules (hard)

| Area | Rule |
|---|---|
| Package manager | **Bun only.** Never `npm` or `yarn` (`package.json` uses `bunx --bun` scripts; lockfile is `bun.lock`). |
| Stack | Vite + React 18 + TypeScript **strict** (no `any`; ESLint blocks it). |
| Scripts | `bun run lint`, `bun run typecheck`, `bun run build`. |
| Bundle budget | Shell < 200 KB gzipped. |

---

## 2. Binding UI Standard Mandates (from ui-std.md)

1. **Design tokens only (`ui-std.md` §2):**
   - The required semantic color-role set (`bg`, `text`, `border`, `action`, `focus`, `status`, `financial`) is closed. No component may invent a role or use raw hex, px, or durations.
   - `danger` is reserved for destructive/error actions.
   - `success` is reserved only for confirmed positive outcomes.
   - `financial.pending/committed/unknown` are separate roles from status colors.

2. **Posting state is always explicit (`ui-std.md` §5.1):**
   - Every Journal Entry (JE) and `PostingGroup` surface renders the posting state via `PostingStatePill`.
   - Mapping: `DRAFT` (neutral), `PENDING_CHECKER` (warning: "Awaiting approval"), `SUBMITTING` (info pulsing), `COMMIT_UNKNOWN` (**danger**: "Ledger outcome unknown — do not retry"), `FINALIZED` (success: "Posted").
   - **Nothing is "Success" before `FINALIZED`.**
   - `COMMIT_UNKNOWN` surfaces NO retry affordance, provides an explicit **Check status** action, displays `plan_hash` + `correlation_id` + original transfer IDs, and links to the Uncertain Postings queue.

3. **Four-eyes UI separation (`ui-std.md` §5.2):**
   - Maker and checker are strictly different surfaces.
   - Checker surface renders read-only diff, maker identity, `plan_hash`, and affected accounts.
   - Maker never sees an approve control.
   - An API `403 MAKER_CANNOT_APPROVE` renders an explicit blocked banner (never silently hidden).

4. **Amounts formatting (`ui-std.md` §5.3):**
   - Use the `<Amount>` atom exclusively.
   - Minor units are the input contract (`<Amount value={1234567} currency="NAD" minorUnits />`).
   - Must use `tabular-nums` and right alignment.
   - Debit/credit coloring via `financial.debit/credit`. (A debit is NOT an error).
   - Totals come from the API; the client never sums amounts to verify.

5. **React engineering standards (`ui-std.md` §6):**
   - Function components only. Named exports (default exports only for route modules).
   - One component per file. Props named `{Component}Props`.
   - No `any` (`unknown` at boundaries).
   - Hooks return objects when returning > 2 values.
   - No business logic in components; extract to domain hooks or pure helpers.
   - Error boundaries wrap every route and independent data region.
   - Skeletons, never spinners. Mobile-first, no window scroll.

6. **State management & data fetching (`ui-std.md` §7):**
   - Server state: TanStack Query (structured array keys with domain prefix).
   - **Server-driven Pagination, Sorting & Search:** Tables, lists, and collections MUST pass `page`, `size`, `sort`, and search query `q` to backend APIs as URL parameters. Never perform in-memory pagination or full-dataset searching on the client.
   - URL-first state: If state can live in the URL (filters, sort, page, tabs, as-of), it must.
   - Every mutation explicitly invalidates affected query keys.
   - **Financial mutations are NEVER optimistic.**
   - Retries = 1 for idempotent GETs.
   - **Zero auto-retries for mutating financial requests** (POST/PUT/DELETE) — uncertain outcomes surface as `COMMIT_UNKNOWN` UI with user-driven check-status.

7. **Forms & validation (`ui-std.md` §8):**
   - Zod schemas per endpoint.
   - Validation occurs on blur and submit per §8 of `ui-std.md`.
