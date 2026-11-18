# FSP UI Standard — Design System, Component Architecture & React Engineering Guide

**Status:** Normative. Applies to every FSP web surface (core console, tenant admin, plugin-contributed routes, PSP/EMI operator UIs, compliance portal).
**Companion docs:** FSP Architecture Spec v2 (§4 books, §5.7 posting states, §5.9 posting fence, §3.7 delegation, §10 four-eyes, §7.7 safeguarding). This document does not restate financial semantics; it defines how those semantics are *presented* and *interacted with*.

---

## TABLE OF CONTENTS

1. Principles
2. Design Tokens & Theming
3. Atomic Design Levels (Atoms → Pages)
4. Component Contract & Naming
5. Financial Domain Patterns (Four-Eyes, Posting States, Amounts, Approvals)
6. React Engineering Standards
7. State Management & Data Fetching
8. Forms & Validation
9. Feedback: Toasts, Banners, Dialogs, Empty & Error States
10. Tables, Filters, and Large Data Sets
11. Accessibility
12. Internationalization & Localization
13. Motion & Performance Budgets
14. Testing Standards
15. File Structure & Tooling
16. Governance & Change Control
17. Reference Component Inventory

---

## 1. PRINCIPLES

These are ranked. When two conflict, the higher-ranked wins.

1. **Correctness is visible.** The UI must never imply money moved when the posting state is `SUBMITTING` or `COMMIT_UNKNOWN` (§5.7). Ambiguity is a defect, not a UX choice.
2. **The core is the source of truth.** The UI renders what the API returns; it does not compute balances, fees, permissions, or approval authority client-side. Derived values are display-only and labeled as such.
3. **Deny by default.** If the UI cannot determine whether an action is permitted, it hides or disables the action and shows *why* (never silently allows).
4. **Four-eyes is unmistakable.** Maker and checker surfaces are visually and informationally distinct. No screen invites a user to approve their own work.
5. **Accessible by construction.** WCAG 2.2 AA is the floor, not a stretch goal. Components are built accessible; retrofitting is prohibited.
6. **One way to do a thing.** Every pattern (toast, confirm, table, form) has exactly one blessed implementation. New variants require a governance decision (§16).
7. **Composition over configuration.** Small components compose; they do not accumulate boolean props.
8. **Tokens, not values.** No raw hex, px, or duration appears in a component. Tokens only.
9. **Tenant-safe.** Every visible surface is tenant- and book-scoped; cross-tenant data leakage is a P0 UI defect.
10. **Testable by default.** Every component is reachable, queryable, and deterministic in tests.

---

## 2. DESIGN TOKENS & THEMING

### 2.1 Token tiers

Three tiers. Components consume **only Tier 2 and Tier 3**.

| Tier | Name | Example | Consumed by |
|---|---|---|---|
| 1 | **Primitive** | `color.blue.600`, `space.4`, `radius.2` | Tier 2 only |
| 2 | **Semantic** | `color.action.primary`, `color.surface.raised`, `color.status.danger` | Components |
| 3 | **Component** | `button.primary.bg`, `table.header.bg`, `toast.success.accent` | Component internals only |

Tier 1 is not imported by application code. Enforced by ESLint (`no-restricted-imports` on the primitives module).

### 2.2 Token categories

```
color.*       primitives → semantic → component
typography.*  family, size, weight, line-height, letter-spacing
space.*       spacing scale (4px base): 0,1,2,3,4,5,6,8,10,12,16,20,24
radius.*      0, sm, md, lg, full
shadow.*      elevation 0–5
border.*      width + color semantics
motion.*      duration (fast 120ms, base 200ms, slow 320ms), easing (standard, enter, exit)
zIndex.*      layered scale (base, dropdown, sticky, overlay, modal, toast, tooltip)
breakpoint.*  sm 640, md 768, lg 1024, xl 1280, 2xl 1536
```

### 2.3 Semantic color roles (required set)

Every surface must resolve these roles. No component may invent a color role.

```
bg.canvas            page background
bg.surface           card/panel background
bg.surface.raised    elevated surface (modal, popover)
bg.surface.sunken    inset wells
text.primary         default body text
text.secondary       supporting text
text.tertiary        hints, placeholders
text.inverse         on dark/brand surfaces
text.link            interactive text
border.subtle        dividers
border.default       input borders
border.strong        focus-adjacent
action.primary       primary button/link
action.primary.hover / .active / .disabled
action.destructive
action.subtle        secondary actions
focus.ring
status.info / success / warning / danger / neutral   (bg, fg, border triplets)
financial.debit / financial.credit                   (see §5.3)
financial.pending / financial.committed / financial.unknown
```

**Rule:** status colors are never used decoratively. `danger` is reserved for destructive actions and error states; `success` for confirmed positive outcomes only — a `COMMITTING` toast is *not* success.

### 2.4 Typography

- One UI family (e.g., Inter) and one monospace family for **all identifiers, amounts, hashes, account IDs, correlation IDs**.
- Numeric amounts use `font-variant-numeric: tabular-nums` — mandatory for any column of figures.
- Scale: `display, h1–h4, body, body-sm, caption, code`. No ad-hoc sizes.

### 2.5 Theming model

Themes are **token overrides**, never component overrides.

| Theme dimension | Mechanism |
|---|---|
| Light / dark / high-contrast | `data-theme` attribute on `<html>`; semantic tokens swap. |
| Tenant branding | Tenant admin sets a **constrained brand palette** (primary accent + logo) that is run through a contrast-checked derivation to produce the full semantic set. Arbitrary colors are rejected. |
| Density | `data-density="comfortable\|compact"` adjusts `space.*` semantic aliases used by tables/forms. |
| Reduced motion | `prefers-reduced-motion` collapses `motion.duration.*` to 0 and disables non-essential transitions. |

**Contrast gate:** the theme build fails if any text/background pair in the semantic set drops below 4.5:1 (or 3:1 for large text). CI enforces this; a tenant cannot ship an inaccessible theme.

### 2.6 Token delivery

- Source of truth: `tokens/*.json` (primitive + semantic), built to CSS custom properties and a typed TS object.
- Components read `var(--color-action-primary)` in CSS or `theme.color.action.primary` via the `useTheme()` hook for the rare JS case.
- **No runtime style computation for colors.** Theme swaps are CSS-variable swaps.

---

## 3. ATOMIC DESIGN LEVELS

Each level has a rule for what it may import. Violations fail review.

| Level | Definition | May import | May contain state? | Example |
|---|---|---|---|---|
| **Token** | Design values | — | No | `--space-4` |
| **Atom** | Single-purpose primitive, no domain knowledge | Tokens, other atoms (rare) | Only local UI state (hover is CSS) | `Button`, `Input`, `Badge`, `Icon`, `Spinner`, `Amount` |
| **Molecule** | Small group of atoms serving one micro-task | Atoms, tokens | Yes, local UI state | `FormField`, `SearchInput`, `AmountInput`, `StatusPill`, `Toast`, `ApprovalBadge`, `ConfirmDialog` |
| **Organism** | Self-contained section with a clear responsibility | Atoms, molecules, hooks | Yes, may fetch via query hooks | `JournalEntryTable`, `ApprovalQueue`, `PostingStateTimeline`, `DelegationGraph`, `CoATree` |
| **Template** | Page skeleton; slots, no data | Organisms, layout | No | `ApprovalsTemplate`, `LedgerTemplate`, `AdminTemplate` |
| **Page** | Route entry; wires data to template | Templates, route hooks | Yes (routing/query orchestration only) | `JournalEntryDetailPage` |

**Boundary rules**

- Atoms **never** import from `domains/` or `api/`. If an atom needs a domain concept, it is a molecule.
- Molecules **never** fetch. They receive data and callbacks.
- Organisms are the **first** level allowed to call query hooks.
- Templates and pages contain **no business logic** — only composition and route params.

---

## 4. COMPONENT CONTRACT & NAMING

### 4.1 Required props for every interactive component

Every interactive component accepts and forwards:

```
id?: string
className?: string            // for layout only; not for color/typography overrides
aria-label / aria-labelledby  // required when no visible label
data-testid?: string          // required for anything tests must reach
disabled?: boolean
```

### 4.2 Discriminated variants, not boolean soup

```tsx
// ✗ PROHIBITED
<Button primary large danger loading />

// ✓ REQUIRED
<Button variant="primary" size="lg" intent="danger" loading />
```

Variant props are **closed unions**; adding a variant is a governance change (§16).

### 4.3 Slot pattern over render props

For composition, use explicit slots (`icon`, `startAdornment`, `endAdornment`, `actions`), not render props, unless the slot needs to re-render on parent state (rare; document why).

### 4.4 Forward refs and polymorphism

- All atoms `forwardRef` to their DOM node.
- Polymorphic `as` prop is allowed only on `Text`, `Box`, `Link`, `Button` (rendering as `a`). All other components are fixed.

### 4.5 Naming

- Components: `PascalCase`, file `ComponentName.tsx` in a folder of the same name with `index.ts`, `ComponentName.test.tsx`, `ComponentName.stories.tsx`.
- Hooks: `useThing`. Query hooks: `useJournalEntriesQuery`, `useApproveMutation`.
- Test IDs: `kebab-case` mirroring the component path: `journal-entry-table.row-approve`.

### 4.6 Prop naming conventions

| Suffix/prefix | Meaning |
|---|---|
| `on*` | Event handler |
| `is*` / `has*` | Boolean state |
| `initial*` | Uncontrolled initial value |
| `*Ref` | DOM or imperative handle |
| `render*` | Slot renderer (discouraged) |
| `asChild` | Compose into child element |

---

## 5. FINANCIAL DOMAIN PATTERNS

These are **mandatory organisms** — no team may invent a parallel implementation.

### 5.1 Posting state is always explicit

Every place a JE or `PostingGroup` is shown must render its state using the **`PostingStatePill`** with the canonical mapping (§5.7 of the architecture). No screen may show a bare "Success" for anything short of `FINALIZED`.

| Arch state | Pill | Color role | Copy |
|---|---|---|---|
| `DRAFT` | Draft | neutral | "Draft" |
| `PENDING_CHECKER` | Awaiting approval | warning | "Awaiting checker" |
| `READY` | Ready | info | "Ready to submit" |
| `SUBMITTING` | Submitting | info (pulsing) | "Submitting to ledger" |
| `COMMIT_UNKNOWN` | **Outcome unknown** | **danger** | "Ledger outcome unknown — do not retry" |
| `COMMITTED` | Committed | info | "Committed — finalizing" |
| `FINALIZED` | Posted | success | "Posted" |
| `REJECTED` | Rejected | neutral/danger | "Rejected" |
| `REVERSED` | Reversed | neutral | "Reversed by {id}" |

**`COMMIT_UNKNOWN` is a first-class UI state.** It must:
- block any "retry" affordance (no fresh IDs while uncertain — arch §5.7),
- offer **"Check status"** (triggers recovery lookup by original transfer IDs),
- surface the persisted `plan_hash`, `correlation_id`, and original transfer IDs,
- be listed in a dedicated **Uncertain Postings** queue for operators.

### 5.2 Four-eyes UI separation

The maker and checker experiences are **different surfaces**, not the same form with a hidden button.

- **Maker surface**: compose intent, see validation, submit for approval. Shows `PENDING_CHECKER` with an **approval reference** and who it awaits.
- **Checker surface** (`ApprovalQueue` organism): read-only diff of intended change vs. current state, maker identity, `plan_hash`, amount and accounts affected, policy version. Actions: **Approve**, **Reject** (reason required).
- The checker surface **never** renders the maker's submit form. The maker **never** sees an approve control.
- If the API returns `403 MAKER_CANNOT_APPROVE` (person_id match, arch §3.7.5), the UI shows an explicit blocked state — it does not hide the fact that the user attempted self-approval; it informs them and logs.

### 5.3 Amounts and currency

The **`Amount`** atom is the only way to render money.

```
<Amount value={1234567} currency="USD" minorUnits />   // renders 12,345.67
<Amount value={1234567} currency="USD" minorUnits showSign />  // +12,345.67
<Amount value={1234567} currency="USD" minorUnits direction="debit" />  // colored per financial.debit
```

Rules:
- Always `tabular-nums`, right-aligned in tables.
- Debit/credit coloring uses `financial.debit`/`financial.credit` — **never** generic success/danger. A debit is not an error.
- Currency code is always visible in the first row of a table and in totals; per-row code may be omitted only if a single-currency table has a labeled caption.
- **Minor units are the default input contract.** Components that accept major units must be explicitly typed and labeled.
- Rounding is display-only; the UI never sums client-side to "verify" a total. Totals come from the API.

### 5.4 Approval authority display

Every approval surface shows a **`DelegationBreadcrumb`**: the chain from root to the acting principal with the permission ceiling and the specific permission being exercised. If the chain cannot be resolved, the action is disabled with an explanation. This mirrors arch §3.7.4.

### 5.5 Safeguarding status (EMI surfaces)

A **`SafeguardingBanner`** organism appears on any EMI issuance surface. It distinguishes:
- **Prevention state** (synchronous): "Issuance blocked — coverage headroom insufficient" (from `EMI.IssuanceBlocked`).
- **Detection state** (post-commit): "Coverage breach detected at {time} — issuance halted" (from `EMI.SafeguardingBreach`).
- **External reconciliation state**: "Last external reconciliation: {date} — {result}".

These are three distinct pieces of information and are never merged into one "OK/Breach" badge.

### 5.6 As-of reporting

Any report surface that accepts a cutoff must display **both** the accounting cutoff and the report run time, and a **`ReportCutoffBadge`** indicating whether journal-vs-ledger reconciliation passed for that run (arch §5.10). If reconciliation failed, the report renders with a `danger` banner and is marked "unaudited run".

---

## 6. REACT ENGINEERING STANDARDS

### 6.1 Component form

- **Function components only.** No class components except error boundaries.
- **Named exports** for components; default exports only for route modules.
- **One component per file.** Co-located subcomponents live in the same folder and are not exported publicly.
- **Props interface** named `{Component}Props`; no `any`; `unknown` at boundaries.

### 6.2 Hooks rules

- Custom hooks return **objects**, not tuples, when more than two values: `{ data, isLoading, error }`.
- No hooks inside conditionals or loops (enforced by lint).
- Side effects live in `useEffect` **only when synchronizing with an external system**. Data fetching uses query hooks (§7). Derived state uses `useMemo` — but prefer computing during render if cheap.
- `useEffect` dependency arrays are exhaustive; suppression requires a comment with a linked justification.

### 6.3 Rendering rules

- **No inline object/array literals in JSX props** that feed memoized children. Hoist or `useMemo`.
- **Lists** require stable keys (IDs from the API, never array index).
- **Conditional rendering** uses early returns in the component body; nested ternaries in JSX beyond one level are prohibited.
- **Error boundaries** wrap every route and every independent data region (a failed widget must not blank the page).

### 6.4 Performance

- **Memoize by measurement, not by default.** `React.memo` only where a profiler shows a real cost (large tables, charts). Document the reason.
- **Virtualize** any list over 50 rows (`@tanstack/react-virtual`). Tables over 100 rows must use virtualization.
- **Route-level code splitting** is mandatory; plugin-contributed routes are loaded as separate chunks via the plugin host (§6.6).
- **Images** use explicit dimensions; no layout shift.
- **Bundle budget:** initial JS < 200 KB gzipped for the core shell; each route chunk < 80 KB gzipped; CI fails on regression.

### 6.5 No business logic in components

Permissions, fee math, balance computation, posting-state transitions, and delegation resolution come from the API or a domain hook that calls the API. Components format and display. A component that computes a balance is a defect.

### 6.6 Plugin UI hosting (contract)

Plugin-contributed routes are mounted by the **PluginHost**:

- Plugins receive a **UI SDK** (atoms, molecules, a restricted subset of organisms) — they cannot import app-internal modules.
- Plugins receive a **read-only, tenant- and book-scoped API client**; they cannot call ledger endpoints directly.
- Plugin routes render inside the host's layout shell, inherit the theme, and are subject to the same four-eyes and posting-state patterns.
- A plugin that crashes its route is isolated by an error boundary; the shell survives.
- Plugin routes are gated by the activation readiness gate (arch §6.6): until ready, the host renders `PluginNotReadyPage`, not the plugin.

---

## 7. STATE MANAGEMENT & DATA FETCHING

### 7.1 Layered state

| Layer | Tool | Scope |
|---|---|---|
| Server state | TanStack Query | Everything from the API. **The default.** |
| URL state | Router search params | Filters, pagination, tabs, cutoff dates — **shareable and bookmarkable** |
| Form state | React Hook Form + Zod | Uncontrolled where possible |
| Local UI state | `useState` / `useReducer` | Ephemeral (open/closed, hover intent) |
| Cross-cutting UI state | Context (theme, density, toasts, auth) | Rare; documented per provider |
| Global app state store | **None** | Prohibited unless a governance decision grants an exception |

**Rule:** if state can live in the URL, it lives in the URL. Filters, sorts, page, tabs, and as-of cutoffs are URL state — never component state.

### 7.2 Query conventions

- Query keys are **structured arrays** with a domain prefix: `['journal-entries', { bookId, status, page }]`.
- Every mutation **invalidates** the affected query keys explicitly; no blanket `invalidateQueries()`.
- Optimistic updates are allowed **only** for non-financial UI (e.g., toggling a preference). Financial mutations are **never** optimistic: the posting state is authoritative (§5.1).
- Retries: **one** retry for idempotent GETs; **zero** automatic retries for POST/PUT/DELETE that move money. Uncertain mutation outcomes surface as `COMMIT_UNKNOWN` UI and require explicit user "check status".
- Polling is allowed for `SUBMITTING`/`COMMIT_UNKNOWN` state with backoff and a hard cap; beyond the cap, the user is directed to the Uncertain Postings queue.

### 7.3 Auth and permission client

- The client **never** parses permissions from token claims to make security decisions; it uses a `usePermission(permission, scope)` hook backed by an API call, cached per session.
- A `Can` component hides UI the user cannot use; the **server remains authoritative**. UI hiding is UX, not security.
- On `403`, the UI renders a permission-denied state with the *specific* permission and scope required — never a generic "not allowed".

---

## 8. FORMS & VALIDATION

### 8.1 Form contract

- **React Hook Form** for all forms; **Zod** schemas co-located with the form and **shared with the server contract** where possible.
- Every field is a **`FormField`** molecule wrapping label, control, hint, and error. No bare inputs in forms.
- Labels are **always visible** (no placeholder-as-label).
- Required fields marked; optional fields marked "(optional)" when the default is not obvious.

### 8.2 Validation timing

| Event | Behavior |
|---|---|
| On blur | Field-level validation |
| On submit | Whole-form validation; focus first invalid field |
| On change (after first submit) | Revalidate touched fields |
| Server error | Mapped to field where possible; otherwise form-level banner |

### 8.3 Financial form specifics

- **Amount inputs** use `AmountInput` (molecule): minor-unit aware, currency-locked, thousands separators, no scientific notation, no negative unless the field explicitly allows it.
- **Account pickers** (`AccountPicker` molecule) are **book-scoped** and show code + name + currency; the currently selected book is always visible in the form header.
- **Irreversible actions** (close GL account, reverse JE, close period) require typed confirmation (`ConfirmDialog` with `variant="destructive"` and a reason field).
- Forms that will route through four-eyes show a **"This will require checker approval"** notice with the required permission and scope **before** submit.

### 8.4 Dirty state and navigation guards

Unsaved forms block navigation via a confirm dialog. Drafts are autosaved to **session** storage (never `localStorage` for financial data) and discarded on logout.

---

## 9. FEEDBACK: TOASTS, BANNERS, DIALOGS, EMPTY & ERROR STATES

### 9.1 The feedback ladder

Use the **lowest-impact** mechanism that communicates the outcome.

| Mechanism | Use for | Never use for |
|---|---|---|
| Inline field error | Field validation | Anything else |
| Inline status (component state) | Long-running state (posting state pill) | Transient confirmations |
| **Toast** | Transient, non-blocking confirmations and recoverable errors | Anything requiring a decision; anything about money movement outcome beyond `FINALIZED` |
| **Banner** (persistent, in-context) | Conditions that persist (degraded reconciliation, safeguarding breach) | One-off events |
| **Dialog** | Decisions that block progress (approve, reject, destructive confirm) | Informational messages |
| **Full-page state** | Route-level errors, permission denied, plugin not ready | Local widget errors |

### 9.2 Toast system (mandatory specification)

**One toast system.** `useToast()` from the design system. No third-party toast libraries.

**API**

```tsx
const toast = useToast();

toast.success('Journal entry posted', { description: 'JE-1042 · USD 1,200.00', correlationId });
toast.error('Could not reverse entry', { description: 'Period 2024-11 is hard-closed.', action: { label: 'View periods', onClick }, correlationId });
toast.info('Approval requested', { description: 'Awaiting checker with je.approve at TENANT scope.' });
toast.warning('Ledger outcome unknown', { description: 'Do not retry. Open the entry to check status.', sticky: true, action: { label: 'Check status', onClick } });
```

**Behavior contract**

| Aspect | Rule |
|---|---|
| Position | Top-right desktop; top-center mobile |
| Stacking | Max **3 visible**; older collapse into "+N more" |
| Duration | `success`/`info`: 5s auto-dismiss; `warning`: 8s or manual; `error`: **sticky** (manual dismiss) |
| Pause on hover/focus | Yes |
| Dismiss | Keyboard (`Esc`), close button, swipe on mobile |
| Announcement | `role="status"` + `aria-live="polite"`; `error`/`warning` use `aria-live="assertive"` |
| Deduplication | Same `id` replaces rather than stacks; callers pass a stable `id` for repeated events |
| Financial outcome | A toast for money movement may only fire on `FINALIZED` (success) or `REJECTED` (error). `SUBMITTING`/`COMMIT_UNKNOWN` use **inline status + banner**, never a success/error toast (§5.1) |
| Correlation | Every financial toast carries `correlationId` and an action to open the entry |
| Persistence | Toasts are **ephemeral**; they never store outcomes. The source of truth is the record's page |

**Prohibited**

- Toasts that ask for a decision ("Do you want to approve?"). Use a dialog.
- Toasts announcing `COMMIT_UNKNOWN` as an error with a "Retry" button (arch §5.7 forbids fresh IDs while uncertain).
- Multiple toasts for one operation.

### 9.3 Banners

Persistent, in-context, dismissible **per session** (not per event). Mandatory banners:

- **`ReconciliationBanner`** — journal-vs-ledger divergence for the current book (P1). Blocks official-report actions.
- **`SafeguardingBanner`** — prevention/detection/external reconciliation states (§5.5).
- **`PeriodClosedBanner`** — current book's period state when it affects actions on the page.
- **`UnknownOutcomeBanner`** — when any `COMMIT_UNKNOWN` entry exists in the current scope.

Banners use `status.*` color roles and include a link to the relevant queue/detail.

### 9.4 Dialogs

- **`ConfirmDialog`** — destructive or irreversible actions. Requires explicit typed confirmation for closure/reversal/period close. Reason field required for rejections.
- **`ApprovalDiffDialog`** — used by checkers to review intended change vs. current state; renders `plan_hash`, affected accounts, amounts, and policy version.
- Dialogs trap focus, restore focus on close, and are dismissible by `Esc` unless explicitly marked `persistent` (only for in-flight operations).

### 9.5 Empty, loading, and error states

Every data region implements all four:

| State | Standard |
|---|---|
| **Loading** | Skeleton matching final layout (not spinners for content regions). Spinner only for button-level actions. |
| **Empty** | Explains *why* it's empty and the next action. Distinguish "no data yet" from "no results for filters" (offer clear-filters). |
| **Error** | `ErrorState` with message, `correlationId`, retry (for idempotent GETs only), and support link. |
| **Partial / stale** | Show data with a `stale` badge and last-refreshed timestamp; offer refresh. |

**Permission-denied** is a distinct state: renders `PermissionDenied` with the required permission and scope (§7.3).

---

## 10. TABLES, FILTERS, AND LARGE DATA SETS

### 10.1 Table standard (`DataTable` organism)

- Built on one implementation (TanStack Table + virtualization).
- **Server-side** sorting, filtering, and pagination by default. Client-side only for known-small sets, documented.
- Columns are typed; each column declares alignment (numbers right, text left), sortability, and width behavior.
- Sticky header; row actions in a trailing menu; primary action surfaced as a row-level button only when it's the dominant task.
- Row selection uses checkboxes with a header select-all; bulk actions appear in a contextual toolbar.
- **Financial tables** always show: posting state pill, currency, `correlationId` (truncated, copyable), and last-updated.
- Copy buttons for IDs, hashes, and amounts in monospace.

### 10.2 Filters

- Filters are URL state (§7.1). A "Clear all" resets to the default view.
- Filter chips summarize active filters above the table.
- Date filters that affect accounting must use the **accounting cutoff** input (`AsOfCutoffPicker`) and show the report-run-time distinction (§5.6).

### 10.3 Uncertain Postings queue

A dedicated, always-available operator surface listing all `COMMIT_UNKNOWN` entries scoped to the operator's book. Columns: entry, book, amount, `plan_hash`, original transfer IDs, elapsed time, last status check. Actions: **Check status** (recovery), **Open entry**. No retry.

---

## 11. ACCESSIBILITY

WCAG 2.2 AA minimum; AAA where feasible for text.

| Requirement | Enforcement |
|---|---|
| Keyboard | Every interactive element reachable and operable; visible focus (`focus.ring`) never removed |
| Focus management | Modals/dialogs trap focus; route changes move focus to the page heading; skip-to-content link |
| Semantics | Native elements first (`button`, `a`, `input`); ARIA only to fill gaps; landmarks on every page |
| Labels | Every input labeled; errors associated via `aria-describedby`; required state announced |
| Color | Never sole conveyor of meaning (debit/credit also use sign and label) |
| Motion | Respects `prefers-reduced-motion` |
| Target size | ≥ 24×24 CSS px (WCAG 2.2) |
| Timeouts | Session-expiry warning with extension; no data loss on expiry (drafts preserved) |
| Screen reader testing | Automated (axe) + manual per release |

**CI gate:** axe-core on every Storybook story and every route test; any new violation fails the build.

---

## 12. INTERNATIONALIZATION & LOCALIZATION

- All user-facing strings via `t()` from the i18n layer; **no string literals in JSX** (enforced by lint).
- Plurals and interpolation via ICU message format.
- Dates and times via `Intl`; **UTC storage, tenant-timezone display**, with the timezone shown on financial timestamps.
- Numbers and currency via `Intl.NumberFormat` inside `Amount`; **never** hand-format money.
- RTL support: logical CSS properties only (`margin-inline-start`, not `margin-left`).

---

## 13. MOTION & PERFORMANCE BUDGETS

| Budget | Target |
|---|---|
| Interaction response (visual feedback) | < 100 ms |
| Route transition (skeleton visible) | < 200 ms |
| Toast appear/dismiss | 200 ms, `motion.easing.enter` |
| Modal open/close | 200 ms |
| Initial shell | < 1.5 s on mid-tier hardware |
| LCP (route) | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |

Motion is functional (state change clarity), not decorative. No animation on financial outcome transitions beyond the state pill change.

---

## 14. TESTING STANDARDS

| Level | Tool | Requirement |
|---|---|---|
| Unit (atoms/molecules) | Vitest + Testing Library | Every atom/molecule has tests for variants, disabled, error, keyboard |
| Component (organisms) | Vitest + Testing Library + MSW | Data, empty, loading, error, permission-denied, stale |
| Visual | Storybook + Chromatic (or equivalent) | Every component and variant; visual diffs reviewed |
| Accessibility | axe-core | On every story and route test |
| E2E (critical paths) | Playwright | Maker→checker approval; posting states incl. `COMMIT_UNKNOWN`; delegation revoke; period close race |
| Contract | MSW + generated types from OpenAPI | API shapes are typed; drift fails build |

**Rules**

- Tests query by **role and accessible name**, not test IDs, except where the DOM has no role (then `data-testid`).
- No `waitFor` timeouts > 1s; flaky tests are quarantined and fixed, not retried silently.
- Financial-state tests must assert the **exact posting-state pill** and must include a `COMMIT_UNKNOWN` case.

---

## 15. FILE STRUCTURE & TOOLING

```
src/
  design-system/
    tokens/            (json + generated css/ts)
    atoms/
    molecules/
    organisms/
    templates/
    hooks/             (useTheme, useToast, usePermission)
    index.ts           (public API — the only import path for app code)
  domains/
    journal-entries/   (queries, mutations, domain hooks, types)
    approvals/
    gl-accounts/
    delegations/
    psp/
    emi/
  routes/
    <route>/           (page + template wiring)
  app/
    shell/ providers/ plugin-host/ error-boundaries/
  plugins/             (plugin UI chunks; imported only via host)
```

**Tooling**

- TypeScript `strict`; `noUncheckedIndexedAccess`; no `any` (lint).
- ESLint: `react-hooks`, `jsx-a11y`, import boundaries (atomic-level rules), no raw tokens.
- Prettier; commit hooks (lint-staged); CI enforces all gates (types, lint, axe, bundle budget, visual diff).
- Storybook is the component catalog and the review surface for design changes.

**Import boundary lint rules (examples)**

- `atoms/*` may not import from `domains/*`, `api/*`, or `organisms/*`.
- `molecules/*` may not import from `organisms/*` or `domains/*`.
- App code imports components **only** from `design-system/index.ts`.
- `primitives` module is import-restricted to `tokens` build.

---

## 16. GOVERNANCE & CHANGE CONTROL

| Change | Approval |
|---|---|
| New atom / molecule variant | Design system owner + one frontend reviewer |
| New organism | Design system owner + domain owner |
| New token category or semantic role | Design system owner + accessibility reviewer (contrast gate) |
| New global state store | Architecture review (default answer: no) |
| New toast/dialog/table implementation | **Prohibited** — extend the existing one |
| Plugin UI SDK surface change | Architecture review + plugin contract version bump |
| Theme/brand palette addition | Design system owner (contrast gate must pass) |

Design changes follow the same four-eyes spirit as the platform: a **maker** proposes in a PR with Storybook diff; a **checker** (design system owner) approves; both are recorded in the design changelog. Financial-domain pattern changes (§5) additionally require a compliance reviewer.

---

## 17. REFERENCE COMPONENT INVENTORY

**Atoms:** `Button`, `IconButton`, `Link`, `Text`, `Heading`, `Icon`, `Spinner`, `Badge`, `Divider`, `Avatar`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Amount`, `Code` (monospace, copyable), `Tooltip`.

**Molecules:** `FormField`, `AmountInput`, `AccountPicker`, `BookPicker`, `DatePicker`, `AsOfCutoffPicker`, `SearchInput`, `StatusPill`, `PostingStatePill`, `ApprovalBadge`, `DelegationBreadcrumb`, `CorrelationIdChip`, `Toast`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `PermissionDenied`, `Skeleton`, `FilterChip`.

**Organisms:** `DataTable`, `JournalEntryTable`, `ApprovalQueue`, `ApprovalDiffDialog`, `PostingStateTimeline`, `UncertainPostingsQueue`, `CoATree`, `DelegationGraph`, `ReportCutoffBadge`, `ReconciliationBanner`, `SafeguardingBanner`, `UnknownOutcomeBanner`, `PeriodClosedBanner`, `PluginNotReadyPage`.

**Templates:** `AdminTemplate`, `LedgerTemplate`, `ApprovalsTemplate`, `ReportingTemplate`, `PluginShellTemplate`.

---

## SUMMARY

This standard makes the FSP UI **patterned, predictable, and provably faithful to the architecture**:

- **Tokens → atoms → molecules → organisms → templates → pages**, with enforced import boundaries.
- **One implementation** of every recurring pattern — especially toasts, dialogs, tables, and forms.
- **Financial truth is visible**: posting states (including `COMMIT_UNKNOWN`) are first-class; four-eyes maker/checker surfaces are distinct; amounts are formatted by one atom; reports show their reconciliation status.
- **React discipline**: server-state-first, URL-as-state, no business logic in components, measured performance, plugin isolation.
- **Accessibility, i18n, and testing are gates**, not aspirations.
- **Governance mirrors the platform's own four-eyes principle**: changes are proposed, reviewed, and recorded.

A developer joining the platform can build a new financial screen by composing the listed organisms, wiring one query hook, and passing tests — without inventing a toast, a table, a currency formatter, or an approval flow. That is the point of the standard.

# FSP UI Standard — Addendum v1.1: SPA Shell, Mobile-First, Pagination, Server-Side Search

**Status:** Normative. This addendum is **binding** alongside UI Standard v1. It supersedes the loose treatment of pagination, search, layout, and mobile in v1 and adds new sections. Where v1 and v1.1 conflict, **v1.1 wins**.

**Sections affected:**

| v1 section | Disposition |
|---|---|
| §2.2 Tokens (spacing/breakpoints) | Amended — add `zIndex.*`, `safeArea.*`, `scrollbar.*` |
| §6.4 Performance | Amended — add mobile budgets, prefetch rules |
| §7.1 Layered state | Amended — pagination/search/sort are URL state (already stated; now enforced) |
| §10.1–10.2 Tables & filters | **Replaced** by §10.1–10.6 below |
| §13 Motion & performance | Amended — mobile budgets |
| §14 Testing | Amended — debounce/pagination/scroll tests |
| §17 Inventory | Amended — new components |
| **New** | §6.7 SPA Shell & Scroll, §6.8 Navigation & Focus, §13.1 Mobile-First Requirements, §10.4 Pagination, §10.5 Server-Side Search, §10.6 Deep Linking |

---

## 1. AMENDED TOKENS (v1 §2.2)

Add to the semantic token set:

```
breakpoint.sm   640px    (min-width — mobile-first)
breakpoint.md   768px
breakpoint.lg   1024px
breakpoint.xl   1280px
breakpoint.2xl  1536px

zIndex.shell          0
zIndex.stickyHeader   100
zIndex.sidebar        200
zIndex.bottomNav      300
zIndex.dropdown       400
zIndex.sheetBackdrop  500
zIndex.sheet          501
zIndex.modal          600
zIndex.toast          700
zIndex.tooltip        800

safeArea.top      env(safe-area-inset-top, 0px)
safeArea.bottom   env(safe-area-inset-bottom, 0px)
safeArea.left     env(safe-area-inset-left, 0px)
safeArea.right    env(safe-area-inset-right, 0px)

scrollbar.gutter  stable      // prevents layout shift when scrollbar appears
scrollbar.width   thin

touchTarget.min   44px        // design target (WCAG floor is 24px)
density.mobile.rowHeight   56px
density.desktop.rowHeight  44px
```

All breakpoints in code are `min-width` media queries. **Max-width queries are prohibited** — mobile is the base, desktop is the enhancement.

---

## 2. §6.7 SPA SHELL & SCROLL ARCHITECTURE (NEW — NORMATIVE)

**Rule: the browser window itself never scrolls.** The app is a full-viewport shell with fixed regions; every scrollable area is an internal, explicitly-designated scroll container.

### 2.7.1 Root shell contract

```
html, body, #root {
  height: 100dvh;          /* dynamic viewport — handles mobile browser chrome */
  max-height: 100dvh;
  overflow: hidden;        /* NO browser-level scroll, ever */
  overscroll-behavior: none;  /* suppress iOS rubber-band revealing white */
}

#root { display: grid; grid-template-rows: auto 1fr auto; }
```

- `100dvh` is mandatory (not `100vh`) — it tracks the mobile URL bar. Fallback for old engines: `min-height: -webkit-fill-available`.
- `viewport-fit=cover` in the meta viewport; all fixed edges use `safeArea.*` padding.
- A single `<AppShell>` component owns this layout. **No route may render outside the shell.** A route that needs a different chrome uses a `Template`, not a bypass.

### 2.7.2 Regions and their scroll behavior

| Region | Scrolls? | Notes |
|---|---|---|
| Header (top bar) | No | Sticky by grid, not `position: sticky` |
| Sidebar (desktop) | **Yes** — own `ScrollArea` | Independent scroll, `scrollbar.gutter: stable` |
| Main content | **Yes** — own `ScrollArea` | The primary scroll container |
| Footer / status bar | No | Fixed row |
| Bottom nav (mobile) | No | Fixed, `safeArea.bottom` padded |
| Modal / sheet | **Yes** inside, background locked | See §2.7.5 |

`<ScrollArea>` is the **only** sanctioned scroll container atom:

```tsx
<ScrollArea
  aria-label="Journal entries"   // required when content is not self-evident
  tabIndex={0}                   // required — scrollable regions must be keyboard reachable
  restoreKey={`/journal-entries?${searchParams}`}  // scroll restoration (§2.7.6)
  scrollbar="thin"
>
  {children}
</ScrollArea>
```

- The main content region must have **exactly one** scroll container. Components inside it (tables, cards) do **not** introduce their own vertical scroll unless explicitly declared (see §2.7.4).
- `scrollbar-gutter: stable` on all scroll containers to prevent width jump when a scrollbar appears.

### 2.7.3 Sticky elements inside a scroll container

Sticky table headers, filter bars, and action bars use `position: sticky` **relative to the ScrollArea**, not the window:

```css
.sticky-header { position: sticky; top: 0; z-index: var(--z-sticky-header); }
```

- Sticky offsets are computed from the shell header height, exposed as `--shell-header-height` CSS variable set by `AppShell`. Hardcoded offsets are prohibited.
- A sticky element that overlaps focusable content must not trap focus behind it; scroll-padding is set on the ScrollArea: `scroll-padding-top: var(--sticky-offset)`.

### 2.7.4 Nested scroll policy

Nested scroll is **discouraged and capped**:

- **Maximum 2 levels** of vertical scroll (e.g., sidebar + main; or main + a modal).
- A third level requires a documented justification in the component story and design-system-owner approval.
- Horizontal scroll is permitted for wide tables inside the main ScrollArea, but the table's sticky first column and row header must remain visible.
- Any nested scroll container uses `overscroll-behavior: contain` so scroll does not chain to the parent.

### 2.7.5 Modal / sheet scroll lock

Because the body does not scroll, "locking scroll" means locking the **main ScrollArea** and the **sidebar ScrollArea**:

- On open: capture each container's `scrollTop`; set `overflow: hidden` and `touch-action: none`.
- On close: restore `overflow` and `scrollTop` exactly.
- The modal/sheet content itself is a `ScrollArea` with `overscroll-behavior: contain`.
- `Esc` closes; focus returns to the trigger.

This is implemented once in `useScrollLock()`. Hand-rolled `document.body.style.overflow` manipulation is **prohibited** (it does nothing here and hides bugs).

### 2.7.6 Scroll restoration

Each `ScrollArea` restores position per route key:

- **POP** (back/forward): restore the saved `scrollTop` for that route key.
- **PUSH/REPLACE**: start at top (or at the element targeted by an anchor).
- Keys are `pathname + search` (so pagination and filters restore correctly).
- Positions are stored in `sessionStorage`, scoped to the tab, cleared on logout.
- Restoration runs in `useLayoutEffect` **before paint** to avoid a visible jump.
- Infinite/paginated lists restore the **item count** loaded, not just scrollTop, so the list is not shorter than the restored position (see §10.4.7).

### 2.7.7 Keyboard and screen-reader behavior for scroll regions

- Every `ScrollArea` has `tabIndex={0}` and an `aria-label` so keyboard users can focus it and scroll with arrows/PageUp/PageDown.
- Focused scroll regions get a visible `focus.ring`; the ring is never removed.
- Focus visible after keyboard scroll: the shell does not auto-scroll on focus change; if a focused element is outside the visible viewport of its ScrollArea, the browser's native scroll-into-view is honored (do not override).

### 2.7.8 Mobile viewport and keyboard handling

- `visualViewport` is observed in the shell. When the on-screen keyboard opens, the shell reflows so the focused input and its submit affordance remain visible.
- Bottom sheets and forms use `padding-block-end: calc(safeArea.bottom + keyboardInset)` computed from `visualViewport`.
- `overscroll-behavior: none` on the shell prevents the URL bar from bouncing the layout.
- Rotating the device preserves scroll position and reflows without loss of form state.

### 2.7.9 Print

The shell **is** allowed to scroll for print only: `@media print { html, body { overflow: visible; height: auto; } }` and the main region expands. Print styles are part of the shell, not per page.

---

## 3. §6.8 NAVIGATION, FOCUS & ROUTE LIFECYCLE (NEW)

- **SPA navigation only.** Full page reloads are prohibited except for auth handoff and plugin chunk failures with a recovery page.
- On route change (PUSH): move focus to the page `<h1>` (`tabIndex={-1}`) and announce the route in an `aria-live="polite"` region ("Navigated to Journal Entries").
- On POP (back/forward): **do not** move focus; rely on scroll restoration and the browser's own focus handling.
- Route transitions render a **skeleton** in the destination template within 100 ms; the previous view is not kept on screen for financial routes (stale money data must not linger during navigation).
- Route-level error boundaries catch render errors and render `ErrorState` inside the shell — the shell and navigation remain usable.
- **Loading a route never scrolls the window** — because the window cannot scroll. Loading a route resets or restores only the main `ScrollArea`.

---

## 4. §13.1 MOBILE-FIRST REQUIREMENTS (NEW — NORMATIVE)

### 4.1 Layout

- **Base styles target the smallest screen.** Desktop styles are additive via `min-width` breakpoints.
- **Single column on mobile.** Two-column layouts are a desktop enhancement, never a mobile default.
- Bottom navigation hosts 3–5 top-level destinations; everything else lives in a drawer or a "More" sheet. Bottom nav is padded by `safeArea.bottom`.
- The main content region is the only vertical scroller on mobile. The sidebar becomes a slide-over sheet (own `ScrollArea`).
- Tables transform to **card rows** on mobile via the column-priority model (§10.3). Horizontal scroll of a full table is a last resort and requires an explicit `allowHorizontalScroll` opt-in with a visible affordance.

### 4.2 Touch and interaction

- Design touch targets at **≥ 44×44 CSS px**; the WCAG 2.2 floor of 24×24 is a hard minimum, never a target.
- **No hover-only affordances.** Every action reachable by hover is also reachable by tap (row menu button, long-press menu, or explicit control).
- Modals become **bottom sheets** on mobile (`<Sheet>` variant of `Dialog`); dialogs on mobile are full-width, bottom-anchored, with a drag handle and `Esc`/backdrop dismiss.
- Swipe actions are **additive**, never the only path to an action. Destructive swipe actions require confirmation.
- Gestures respect `prefers-reduced-motion`.

### 4.3 Forms on mobile

- Inputs use correct `type` and `inputmode` (`inputmode="decimal"` for amounts, `numeric` for codes), `autocomplete` tokens, and `enterkeyhint`.
- Single-column layout; labels above fields (never inline-only).
- Submit action is a sticky footer button above the keyboard inset, or a full-width primary button at the bottom of the form.
- No multi-step wizard on mobile without a visible step indicator and back navigation.

### 4.4 Mobile performance budgets

| Metric | Mobile target (4G, mid-tier device) |
|---|---|
| LCP (route) | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| Initial shell JS | < 200 KB gzipped |
| Route chunk | < 80 KB gzipped |
| First input delay | < 100 ms |

Images are responsive with `srcset`; icons are SVG sprites; fonts are subset and `font-display: swap`.

### 4.5 Offline and degraded network

- Read-only cached views are permitted with a **`StaleBadge`** showing the last successful fetch time.
- **No offline writes for money movement.** A queued JE is a defect; the API is the only path.
- Network loss during a financial mutation surfaces as the `COMMIT_UNKNOWN` pattern (§5.1 of v1) — never as a retry prompt.

### 4.6 Testing matrix

Minimum device coverage for release: iPhone SE (small), iPhone 15 (modern), a mid-tier Android (e.g., Pixel 6a class), iPad. Verified in both orientations. Automated: Playwright mobile viewport + axe.

---

## 5. §10.1–10.6 TABLES, PAGINATION, SEARCH (REPLACES v1 §10)

### 5.1 §10.1 `DataTable` organism (unchanged in spirit, tightened)

- One implementation (TanStack Table + virtualization), server-driven by default.
- **Server-side sort, filter, paginate, and search.** Client-side sorting/filtering is permitted only for known-small, fully-loaded sets (e.g., a picker with < 50 items) and must be declared in the component story.
- Columns declare: alignment, sortability, width behavior, and **mobile priority** (`primary | secondary | hidden`).
- Sticky header inside the main `ScrollArea`; sticky first column for wide tables with `allowHorizontalScroll`.
- Financial rows always show: `PostingStatePill`, currency, `CorrelationIdChip`, last-updated.
- Virtualization is mandatory above 50 rows; the virtualizer's scroll element is the `ScrollArea`, never the window.

### 5.2 §10.2 Filters

- Filters are **URL state** (`?status=FINALIZED&book=...&q=...&limit=...&cursor=...`).
- Chips summarize active filters; "Clear all" resets to defaults.
- Text filters debounce (§10.5); selects/toggles apply immediately.
- Filter changes reset the pagination cursor to the first page (a stale cursor must never be reused against a new filter set).
- Date filters that affect accounting use `AsOfCutoffPicker` and display the report-run-time distinction (v1 §5.6).

### 5.3 §10.3 Column priority on mobile

Each column is tagged:

| Priority | Mobile behavior |
|---|---|
| `primary` | Shown as the card title line and the first fact line |
| `secondary` | Shown in a 2-column fact grid under the title |
| `hidden` | Available in the row's "Details" sheet |

The card row is a `<button>` (or a link) with an accessible name assembled from primary + secondary fields. Amount and posting state are always visible on mobile — they are **never** `hidden`.

### 5.4 §10.4 PAGINATION (NEW — NORMATIVE)

#### 5.4.1 Contract

- **All financial lists are server-paginated. Client-side pagination of financial data is prohibited.**
- **Cursor (keyset) pagination is the default** for financial lists; offset pagination is permitted only for small, non-financial, fully-indexed administrative lists and must be declared.
- The API contract:

```ts
GET /journal-entries?limit=50&cursor=<opaque>&sort=-posting_date&q=...&status=...
→ {
    items: JournalEntry[],
    nextCursor: string | null,
    prevCursor: string | null,
    approximateTotal?: number,   // optional; only if cheap
    asOf: string                 // server timestamp for the page
  }
```

- **Cursor, not page number.** Stable ordering is enforced by the server on a unique key (`posting_date DESC, entry_id DESC`). Page numbers are not exposed for cursor-paginated lists.
- `limit` defaults to **25**, options `25 | 50 | 100`; server caps at **200**. Anything larger is an export job, not a page.
- `approximateTotal` is shown as "Showing 1–50 of ~1,240". Exact totals are shown only when the server provides them cheaply and truthfully.

#### 5.4.2 URL state and deep linking

- Pagination lives in the URL: `?limit=50&cursor=abc123`.
- Navigating into a detail page and back **restores the exact page** via scroll restoration (§2.7.6) and the URL.
- Sharing a URL with a cursor yields the same page (cursors are opaque and server-validated; an expired cursor returns the first page with a notice, not an error).

#### 5.4.3 Loading and transitions

- Use `placeholderData: keepPreviousData` so the table does not flash to empty while the next page loads.
- Show a **skeleton of rows equal to the current page height** only on first load; on page change, show a subtle `isFetching` indicator in the table header and keep the current rows visible.
- Next-page **prefetch** on row hover and on `IntersectionObserver` near the pagination control, with a 1-page lookahead cap.
- Errors on page change keep the current page on screen and show an inline retry (`ErrorState` in place of the table body); the URL is not mutated by a failed page.

#### 5.4.4 Infinite scroll policy

Infinite scroll is allowed **only** for non-financial, feed-like surfaces (notification center, activity stream). It is **prohibited** for ledgers, JEs, approvals, audit, and any list where "what the user saw at a point in time" must be reconstructable.

For allowed infinite scroll:
- Explicit **"Load more"** button is the primary control; auto-load may be added with an accessible announcement of newly loaded count.
- Scroll restoration must restore loaded item count **before** restoring scrollTop (§2.7.6).
- A "Back to top" affordance appears after 3 viewports.

#### 5.4.5 Export

- Export is a **server-side job** for the full filtered set, never a client loop over pages.
- The export action shows a job status surface with a signed download link and a `correlationId`.
- Exporting the current page only is a separate, explicitly labeled action.

#### 5.4.6 Pagination controls (component)

`<Pagination>` molecule:
- Prev / Next buttons; page-size select; range label ("Showing 1–50 of ~1,240"); optional jump-to-page **only** for offset-paginated admin lists.
- Keyboard: `←`/`→` move between prev/next; `Home`/`End` jump to first/last where supported.
- Announced via `aria-live="polite"` on range changes.
- Disabled states are real `disabled` (not `pointer-events: none`), with `aria-disabled` and an explanation tooltip.
- On mobile, the control collapses to a range label + "Next" and "Previous" as full-width buttons above the list footer.

#### 5.4.7 Determinism

- Because rows can change between requests, the UI must not assume that page N + 1 continues page N's last row. Cursor pagination guarantees no duplicates/skips **at the server**; the client renders what it is given.
- A row that moves between pages between requests is not the client's concern — no client-side deduplication logic.

### 5.5 §10.5 SERVER-SIDE SEARCH (NEW — NORMATIVE)

#### 5.5.1 Principles

- **All search is server-side.** The client never filters a fetched list to implement search.
- Search is **URL state** (`?q=...`) and is debounced before it reaches the URL and the network.
- Search composes with filters (logical AND) and with sort and pagination.
- The server owns relevance, matching semantics, and index freshness; the client owns debouncing, cancellation, and display.

#### 5.5.2 Debounce contract

| Aspect | Rule |
|---|---|
| Default delay | **300 ms** after last keystroke |
| Configurable range | 200–500 ms per surface; documented in the component story |
| Immediate triggers | `Enter` key, paste, and explicit "Search" button bypass debounce |
| Minimum length | 2 characters; below that, no request is sent and a hint is shown |
| Cancelation | In-flight requests are aborted via `AbortSignal` when a newer query supersedes them |
| URL sync | The URL updates with `replace` navigation **on the debounced value only**, never per keystroke |
| Empty query | Clearing the input clears `?q` immediately (no debounce) and resets to the unfiltered list |
| Pending indicator | A subtle inline spinner appears only if the request is still pending **150 ms after** the debounce fires; no spinner for fast responses |

Implementation: `useServerSearch()` hook (design-system) wrapping `useDebouncedValue` + TanStack Query:

```ts
const { query, setQuery, results, isSearching, isPending } = useServerSearch({
  resource: 'journal-entries',
  delay: 300,
  minLength: 2,
  select: (data) => ({ items: data.items, nextCursor: data.nextCursor }),
});
```

**Prohibited:** debouncing inside the input component itself; per-keystroke `fetch`; per-keystroke URL pushes; client-side "filter as you type" over a fetched page.

#### 5.5.3 Search input behavior

- The input is **locally controlled** (uncontrolled-ish) so keystrokes never cause URL churn; the debounced value is the source of truth for the request and the URL.
- A clear ("×") button is always visible when non-empty; `Esc` clears.
- The searchable fields are documented per resource in the search surface's `aria-description` (e.g., "Search by entry ID, correlation ID, reference, or amount").
- Amount search accepts a range (`100..200`, `100-200`) or an exact value with currency context; the parser is server-side and the client only forwards the raw string.
- Result count is announced via `aria-live="polite"` ("124 results").

#### 5.5.4 Search results display

- Results show **`asOf`** (server timestamp) and a `StaleBadge` if the index lag exceeds the policy threshold.
- Matching substrings are highlighted with **escaped** markup; raw HTML from the server is never injected.
- Zero results use the `EmptyState` **"no results"** variant (distinct from "no data yet"), with a "Clear search" action.
- Search errors (timeouts, `429`, `5xx`) show an inline `ErrorState` inside the results region with retry; the query string is preserved so retry is deterministic.

#### 5.5.5 Rate limits and abuse

- The search endpoint is rate-limited per tenant and per client; the UI handles `429` with a backoff hint ("Search is rate-limited; retrying in 2s") and disables the input briefly.
- No request is sent for queries shorter than `minLength`, for whitespace-only input, or for a debounced value identical to the last sent value.
- The client never constructs query strings for raw SQL or backend DSLs; it sends the raw user string and the server parses and validates it.

#### 5.5.6 Mobile search

- On mobile, tapping the search affordance opens a **full-screen search sheet** with an autofocused input, recent searches (session-only, never persisted with PII), and the results list inside the sheet's `ScrollArea`.
- The sheet is dismissible by `Esc`, the back gesture, and a close button; dismiss restores focus to the trigger.
- Search within the sheet is still debounced and server-side; the sheet does not introduce client-side filtering.

#### 5.5.7 Accessibility

- Combobox semantics (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) for typeahead suggestions.
- `aria-busy` on the results region while a debounced request is pending.
- Results count announced via a polite live region.
- `Esc` closes the suggestion list first, then the search sheet.

### 5.6 §10.6 DEEP LINKING (NEW)

Every list surface must be fully reconstructable from its URL:

```
?q=<search>&status=<status>&book=<id>&sort=<field,dir>
&limit=<n>&cursor=<opaque>&asOf=<date>&tab=<tab>
```

- The page reads all of the above on mount and renders the same view.
- The canonical URL is updated with `replace` for input-driven changes (search, page size) and `push` for navigation-driven changes (opening a detail).
- A URL missing a required scope (e.g., `book`) resolves the scope from the session's active book and reflects it into the URL via `replace`.
- Invalid cursors and invalid filter values are **sanitized to defaults** with a visible notice, never an error page.

---

## 6. AMENDMENTS TO §7 (STATE), §9 (FEEDBACK), §14 (TESTING), §17 (INVENTORY)

### 6.1 §7 State management

- Pagination, search, sort, filters, and active tab are **URL state** — not component state, not a global store.
- The debounced search value is local state; the **settled** value is URL state. Both are documented in the hook.
- Query keys include all URL state so the cache is correctly partitioned: `['journal-entries', { q, status, sort, limit, cursor }]`.

### 6.2 §9 Feedback

- **Pagination errors** are inline in the table region, never toasts (the failure is contextual and persistent until retried).
- **Search errors** are inline in the results region.
- **`429` on search** uses an inline, dismissible warning, not a toast.
- Toasts are not used for "loading next page" or "searching" — those are inline states.
- A toast is appropriate for **export job started** and **export ready** (with a link), and it carries the `correlationId`.

### 6.3 §14 Testing

Mandatory new tests:

| Test | Assertion |
|---|---|
| Shell has no window scroll | `document.documentElement.scrollHeight === clientHeight` in E2E; wheel events do not move `window.scrollY` |
| Main `ScrollArea` is the scroller | Scrolling changes the region's `scrollTop`, not `window.scrollY` |
| Scroll restoration | POP restores position; PUSH starts at top; paginated list restores item count first |
| Modal scroll lock | Background `ScrollArea` scrollTop preserved across open/close |
| Keyboard scroll | A focused `ScrollArea` responds to `PageDown` |
| Debounce | 300 ms delay, immediate on `Enter`, `minLength=2` sends no request |
| Cancellation | Rapid typing results in exactly one request after settle; aborted requests do not update UI |
| URL sync | `?q` updates with `replace` after debounce; filter change resets cursor |
| Pagination | Cursor-based; `keepPreviousData` prevents flash; failed page keeps current page; URL deep-links to the same page |
| Mobile | Viewport at 375 px: bottom nav present, sheets used, no horizontal scroll except opted-in tables, touch targets ≥ 44 px |
| a11y | axe on every paginated/search state (loading, empty, no-results, error, rate-limited) |

### 6.4 §17 Inventory additions

**Atoms:** `ScrollArea`, `Spinner` (unchanged), `RangeLabel`.

**Molecules:** `Pagination`, `PageSizeSelect`, `SearchInput` (debounced wrapper), `AsOfCutoffPicker` (exists), `FilterChip` (exists), `StaleBadge`, `RateLimitNotice`.

**Organisms:** `DataTable` (revised), `MobileCardList`, `SearchSheet` (mobile), `ExportJobStatus`, `UncertainPostingsQueue` (exists).

**Hooks (design-system):** `useScrollArea`, `useScrollRestoration`, `useScrollLock`, `useVisualViewport`, `useDebouncedValue`, `useServerSearch`, `usePagination`.

---

## 7. DEFINITION OF DONE — CHECKLIST FOR EVERY LIST/SEARCH SCREEN

A PR adding or changing a list, table, or search surface is **not mergeable** until all boxes are checked:

- [ ] Server-side pagination with cursor, `limit` in URL, `placeholderData: keepPreviousData`, skeleton on first load, inline retry on error.
- [ ] Server-side search with 300 ms debounce, `minLength 2`, `Enter` bypass, `AbortSignal` cancellation, URL sync via `replace`, inline pending indicator after 150 ms, `asOf` and `StaleBadge` shown.
- [ ] All filters, sort, pagination, search, and active tab are URL state; page is fully deep-linkable.
- [ ] Main content lives in the single `ScrollArea`; no window scroll; `scrollbar-gutter: stable`; modal uses `useScrollLock`; scroll restoration works on POP.
- [ ] Mobile: bottom nav present, card-row transformation with column priority, touch targets ≥ 44 px, no hover-only actions, search opens a full-screen sheet, forms use correct `inputmode`/`autocomplete`.
- [ ] Accessibility: keyboard scroll on the `ScrollArea`, focus moved to `<h1>` on PUSH navigation, live region for result counts, axe clean on all states.
- [ ] Tests: shell-no-scroll, restoration, debounce, cancellation, pagination, deep-link, mobile viewport, a11y.
- [ ] Storybook: loading, empty, no-results, error, rate-limited, stale, and mobile variants.
- [ ] Bundle: route chunk within budget; virtualizer active above 50 rows.

---

## SUMMARY

v1.1 closes the four gaps that produce the most expensive, most repetitive UI defects:

1. **The SPA never scrolls the window.** One shell, one main `ScrollArea`, sticky elements scoped to it, and a single scroll-restoration and scroll-lock implementation. Mobile viewport, keyboard, and safe-area handling are part of the shell, not per page.
2. **Mobile is the base case.** `min-width` breakpoints, 44 px targets, bottom sheets, card rows, no hover-only actions, and separate mobile performance budgets.
3. **Pagination is server-side, cursor-based, URL-encoded, and deterministic.** No page-number footguns on financial lists, no flash of empty table, no client-side page loops for export, and infinite scroll only where it is safe.
4. **Search is server-side, debounced, cancelled, and URL-settled.** One `useServerSearch` hook; no per-keystroke requests, no client filtering of money data, no debounce inside the input, and no history spam.

A developer building a new ledger screen composes `DataTable` + `Pagination` + `SearchInput` + `ScrollArea` inside the existing `Template`, wires one query hook, and gets all of the above by default — because the alternative is no longer expressible.

# FSP UI Standard — Addendum v1.2: FAPI 2.0 Compliance for Browser Surfaces

**Status:** Normative. Binding alongside UI Standard v1 and v1.1. Where this addendum and prior versions conflict on authentication, token handling, authorization UX, or session management, **this addendum wins.**

**Scope:** Every browser surface that authenticates a human or machine against the FSP Authorization Server — core console, tenant admin, plugin-contributed routes, PSP/EMI operator UIs, compliance portal, and any embedded search/approval widget.

---

## 1. ARCHITECTURAL FOUNDATION: THE UI IS NEVER THE OAUTH CLIENT

### 1.1 The hard constraint

**A pure browser SPA is a public client and is outside the scope of the FAPI 2.0 Security Profile.** FAPI 2.0 requires a **confidential client** that can authenticate with `private_key_jwt` or `mTLS` and hold the key material used for sender-constraining. Browser JavaScript cannot provide that confidential-client trust boundary.

Therefore the UI **must not** perform OAuth token acquisition, hold access tokens, hold refresh tokens, or hold client secrets. Those operations belong to a **Backend-for-Frontend (BFF)**. The browser holds only an **application session**; the BFF holds tokens and keys server-side and calls the business API with a sender-constrained access token.

### 1.2 The sanctioned architecture

```
Browser (SPA)  ──HTTPS + HttpOnly session cookie──▶  BFF  ──private_key_jwt + DPoP──▶  FSP Authorization Server
                                                      │
                                                      └──DPoP-bound access token──▶  FSP Resource Server (core / plugin routes)
```

| Component | Responsibility |
|---|---|
| **SPA (this standard)** | UI, session cookie handling, authorization UX, DPoP-key generation for *application-level* proof-of-possession where the BFF delegates it (see §1.3), no OAuth tokens |
| **BFF** | OAuth client. Performs **PAR**, **PKCE**, **private_key_jwt** or **mTLS** client authentication, code exchange, token refresh, and back-channel logout handling |
| **FSP Authorization Server** | Issues FAPI 2.0-compliant tokens; enforces PAR, PKCE S256, sender-constraint (DPoP or mTLS), `iss` validation support, RAR scoping |
| **FSP Resource Server** | Core/plugin routes; validates DPoP proof or mTLS binding at the write boundary; enforces object-level authorization |

### 1.3 DPoP in the SPA — the narrow exception

DPoP keypairs for **user-facing API calls** may be generated in the browser using the **WebCrypto API** when the BFF has provisioned a per-session key and the resource server expects browser-originated DPoP proofs. This is permitted **only** when:

1. The key is generated as an **ephemeral** keypair per session (or per auth flow), never persisted to `localStorage`.
2. The BFF registers the public key with the AS and binds the session to it.
3. The SPA never sees an access token — it attaches a DPoP proof to BFF-mediated requests; the BFF attaches the token.
4. Key loss (tab close, crash) invalidates the binding and forces re-authentication; the SPA must handle `invalid_dpop_proof` by starting a fresh flow, not by falling back to bearer.

This exception is documented per route in the **route inventory** (§7). The default remains: no token, no key in the browser.

---

## 2. AUTHORIZATION FLOW: WHAT THE SPA MUST DO (AND MUST NOT DO)

### 2.1 The flow the SPA initiates

The SPA never constructs an authorization request. It initiates a **BFF login**:

1. SPA navigates (full-page redirect) to `BFF /auth/login`.
2. BFF performs **PAR** against the AS with `response_type=code`, `code_challenge` (S256), `client_id`, `redirect_uri`, `scope`, and `authorization_details` (RAR). PAR is mandatory because it keeps sensitive parameters **out of the browser URL** and is required by FAPI 2.0.
3. BFF redirects the browser to the AS authorization endpoint using the `request_uri` returned by PAR.
4. AS authenticates the user (via the tenant's configured IdP per the architecture spec), renders the **RAR consent screen** (§4), and redirects to the BFF callback with `code` and **`iss`**.
5. BFF exchanges the code at the token endpoint using `private_key_jwt`/mTLS + PKCE verifier + DPoP proof.
6. BFF sets an **HttpOnly, Secure, SameSite=Lax session cookie** and redirects to the SPA route.

### 2.2 PKCE is mandatory and never bypassed

- **PKCE with S256** is required for every authorization-code flow. The SPA does not manage the verifier; the BFF does. The SPA must not offer, and no feature may require, a flow that omits PKCE.
- If the BFF reports a PKCE failure, the SPA renders a **session error** with a retry — it never falls back to an implicit or password flow.

### 2.3 The `iss` parameter must be validated

FAPI 2.0 requires the AS to return `iss` in the authorization response (RFC 9207) and the client to validate it against the intended issuer. The BFF performs this validation. The SPA must **surface** a mix-up/issuer-mismatch error as a security event (not a silent logout) and must not retry automatically against a different issuer.

### 2.4 Prohibited SPA behaviors

| Prohibited | Reason |
|---|---|
| Implicit flow (`response_type=token`) | No token may reach browser JS |
| Resource Owner Password grant | FAPI 2.0 forbids it |
| Client secret in SPA code or bundle | Public-client exposure |
| `localStorage`/`sessionStorage` for any OAuth token | Tokens live only in the BFF |
| Constructing authorization URLs client-side | PAR is mandatory; parameters must not travel in the browser URL |
| Skipping PKCE or using `plain` | S256 only |
| “Token in query string” fallback | Prohibited in production |

---

## 3. SESSION MANAGEMENT AND LOGOUT

### 3.1 Session cookie contract

- The session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` where the UX permits), scoped to the BFF domain, with a `__Host-` prefix where possible.
- The SPA **never reads** the cookie; it relies on the browser. `document.cookie` is not used for session material.
- Session lifetime, idle timeout, and absolute timeout are BFF-enforced. The SPA receives only a boolean `/session` status endpoint (`{ authenticated, expiresAt, user }`).

### 3.2 Session expiry UX

- The SPA polls or receives a session-expiry signal at **80% of idle timeout** and shows a **non-destructive warning** with “Stay signed in” and “Sign out”.
- Expiry mid-form: **drafts are preserved in session storage** (never financial data committed optimistically); after re-authentication the form is restored.
- Expiry mid-mutation: the mutation outcome is **not assumed**. If the request reached the server, the SPA reconciles by reading the record’s state (posting state, §5.1 of v1) — it does not retry with a new idempotency key.

### 3.3 Logout — front-channel and back-channel

FAPI 2.0 deployments must support consistent session termination across distributed services.

- **RP-initiated logout**: the SPA calls `BFF /auth/logout`; the BFF performs end-session at the AS and clears the session cookie.
- **Back-channel logout**: the AS notifies the BFF directly; the BFF invalidates the session. The SPA’s next request returns `401`, and the SPA navigates to the login surface with a “You were signed out” notice.
- **Front-channel logout**: the AS loads a logout URI in a hidden iframe. The SPA must **not** rely on front-channel iframes as its primary logout mechanism (browsers block third-party iframes); it is a supplementary signal handled by the BFF.
- On any logout, the SPA clears **all** in-memory state (query cache, form drafts, UI context) and **revokes DPoP keys** if browser-held keys were used for the session.

### 3.4 Login state and route guards

- Route guards call the BFF `/session` endpoint; they do not parse tokens or claims.
- A `401` from any BFF-mediated API call triggers a **single re-authentication attempt** (redirect to login with a `returnTo`), not a retry loop.
- A `403` is **not** a logout signal — it is an authorization outcome and renders the `PermissionDenied` state (v1 §7.3).

---

## 4. RICH AUTHORIZATION REQUESTS (RAR) — CONSENT AND SCOPE DISPLAY

FAPI 2.0 RAR lets the client request **fine-grained authorization** via `authorization_details` (a JSON array of typed objects). The consent screen is where the user sees exactly what is being authorized — and regulators expect that the *displayed* intent matches the *technically authorized* intent.

### 4.1 The RAR consent surface is a mandatory UI artifact

Every authorization flow that uses RAR must render a **`RarConsentSummary`** organism on the AS consent page (or the BFF-hosted consent surface). It must show, for each `authorization_details` entry:

| Field | Display requirement |
|---|---|
| `type` | Human-readable label mapped from the registered type |
| Action(s) | Plain-language verb (“Initiate transfer”, “Approve journal entry”, “Read trial balance”) |
| Amount / ceiling | Formatted with `Amount`; currency explicit; “up to” wording |
| Merchant / payee / account | Resolved name + identifier; never a raw opaque ID alone |
| Currency | Explicit, even when single-currency |
| Scope boundary (tenant / book / subtree) | Named boundary, not a UUID |
| Duration / expiry | Absolute time in user’s timezone |

### 4.2 Prohibited consent behaviors

- **Do not collapse RAR details into a generic “Access your account” string.** The consent must reflect the `authorization_details` semantically.
- **Do not auto-approve** RAR on first-party consent surfaces unless the authorization server’s policy explicitly permits it and the details are still displayed.
- **Do not alter or summarize away amount ceilings** — a ceiling is the most security-relevant field.

### 4.3 Consent evidence

The consent screen emits a **`ConsentRendered`** audit event with a hash of the rendered `authorization_details` and the user’s decision. This lets the platform demonstrate that what was shown matches what was granted. The UI must not allow the consent surface to be bypassed by a deep link or a query parameter.

### 4.4 Step-up and re-consent

When a request exceeds the current grant’s amount ceiling or scope, the AS triggers step-up authentication and a **fresh RAR consent** for the delta. The SPA shows a **`StepUpRequired`** interstitial that explains *why* (which ceiling was exceeded, which new detail is requested) — never a bare “Please authenticate again.”

---

## 5. TOKEN AND CREDENTIAL HYGIENE IN THE UI

| Item | Rule |
|---|---|
| Access token | Never present in browser JS, DOM, URL, or storage. Lives only in the BFF. |
| Refresh token | Never in the browser. BFF-managed, rotation per AS policy. |
| Client secret | Never in the SPA bundle, source maps, or runtime config. |
| DPoP private key (browser-held, §1.3) | Ephemeral; WebCrypto non-extractable; never serialized to storage; cleared on logout/crash. |
| Session cookie | `HttpOnly` + `Secure` + `SameSite`; not readable by JS. |
| Source maps | Production source maps are private, not publicly served; no secrets in env-injected config that ships to the client. |

**CSP requirement:** the SPA ships a strict Content-Security-Policy (`default-src 'self'`; no `unsafe-inline`; `connect-src` restricted to the BFF origin). This is the compensating control for the residual XSS risk that the BFF pattern cannot remove — XSS can still act through the user’s session even without token theft.

---

## 6. ERROR, DENIAL, AND SECURITY-EVENT UX

The SPA must distinguish, and render differently:

| Condition | UI behavior |
|---|---|
| `401` (unauthenticated) | Redirect to login with `returnTo`; one attempt only. |
| `403` (authorization failure) | `PermissionDenied` with the **specific permission and scope** required (v1 §7.3). Never a logout. |
| `invalid_dpop_proof` | Security-event banner; restart authentication flow; never fall back to bearer. |
| `issuer_mismatch` (mix-up) | Security-event page; do not auto-retry; log correlation ID. |
| `consent_required` / step-up | `StepUpRequired` interstitial (§4.4). |
| Rate-limited (`429`) | Inline `RateLimitNotice` with backoff hint (v1.1 §5.5.5); not a toast. |
| Session expired | Re-auth with form-state restoration (§3.2). |

**No security decision is made in the UI.** The SPA hides or disables actions it believes are unauthorized (UX), but the server remains authoritative at the write boundary; a `403` is always rendered truthfully.

---

## 7. ROUTE INVENTORY AND AUTHENTICATION REQUIREMENTS

Every route declares its authentication posture in the route inventory. The inventory is a build artifact, reviewed with the FAPI conformance evidence.

| Route class | Authentication | Token handling | Notes |
|---|---|---|---|
| Public protocol endpoints (discovery, JWKS, PAR, token, authorize) | Public (AS-owned) | N/A to SPA | Not rendered by the SPA |
| Provider callbacks / webhooks | Signed webhook or mTLS | BFF only | Gateway logs raw call before dispatch |
| SPA shell + login landing | None | None | No data |
| Authenticated SPA routes | Session cookie (BFF) | BFF holds tokens | Route guard calls `/session` |
| SPA routes using browser DPoP (§1.3) | Session cookie + DPoP proof | BFF holds token; SPA holds ephemeral key | Declared per route; off by default |
| Plugin-contributed routes | Session cookie (BFF) + plugin readiness gate | BFF holds tokens | Plugin UI SDK enforces the same rules |
| Consent surface (RAR) | AS session | AS-owned | Must render `RarConsentSummary` |

**Rule:** no authenticated SPA route may be reachable without a valid BFF session, and no route may call a resource server directly with a token.

---

## 8. FAPI 2.0 CONFORMANCE EVIDENCE FOR THE UI LAYER

The UI layer contributes to the platform’s FAPI 2.0 conformance pack in five ways:

1. **Architecture ADR**: “Why the SPA is not the OAuth client” — BFF pattern, token custody, and the browser-DPoP exception (§1).
2. **Route inventory** (§7) with authentication posture per route, reviewed against the FAPI 2.0 Security Profile and the AS’s `fapi2_sp_*` compliance level.
3. **Consent rendering evidence**: screenshots and hashes of `RarConsentSummary` for representative `authorization_details` types, demonstrating that the displayed intent matches the granted intent.
4. **Logout evidence**: front-channel and back-channel logout test results, including session invalidation and cache clearing (§3.3).
5. **Negative-path test results**: `invalid_dpop_proof`, `issuer_mismatch`, PKCE failure, consent bypass attempt, and `403` handling (§6).

The UI **does not** claim FAPI 2.0 conformance on its own. Conformance is a property of the **BFF + AS + RS** combination; the UI’s obligation is to **not undermine** that conformance and to render its outcomes truthfully.

---

## 9. ACCEPTANCE CHECKS (MERGE GATE)

A PR touching authentication, session, consent, or any route in the inventory is not mergeable until:

- [ ] No OAuth token, refresh token, or client secret is present in browser storage, JS memory, URL, or source maps.
- [ ] Session is established and validated via the BFF `/session` endpoint; route guards do not parse tokens.
- [ ] PAR is used; no authorization parameters appear in the browser URL.
- [ ] PKCE S256 is enforced; no fallback flow exists.
- [ ] `iss` mismatch is surfaced as a security event, not a silent retry.
- [ ] RAR consent renders every `authorization_details` field in human terms; consent-rendered evidence is emitted.
- [ ] Logout clears in-memory state, revokes browser-held DPoP keys if any, and handles back-channel logout.
- [ ] `401`, `403`, `invalid_dpop_proof`, `issuer_mismatch`, `429`, and session expiry render the distinct states in §6.
- [ ] Strict CSP is present and no `unsafe-inline` is introduced.
- [ ] Route inventory is updated for any new or changed route.
- [ ] Tests cover the negative paths in §8(5).

---

## SUMMARY

The FAPI 2.0-compliant UI is **architecturally humble**: it does not acquire tokens, does not hold credentials, and does not construct authorization requests. It delegates OAuth entirely to a confidential BFF, renders the RAR consent surface with the fidelity regulators expect, distinguishes security outcomes from authorization outcomes, and treats session and logout as first-class flows.

This closes the gap between the platform’s FAPI 2.0 authorization server and its browser surfaces: the AS can be fully conformant, but if the SPA holds tokens or bypasses PAR/PKCE, the deployment is not FAPI 2.0-grade. This addendum makes the compliant path the **only expressible path** in the design system.
