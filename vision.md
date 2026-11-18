# Financial Services Platform (FSP) — Revised Architecture Specification (v2)

**Supersedes:** v1 merged spec (Base + Extensions I–IV).
**Revision basis:** Architecture review findings (P0 blockers + additional corrections).
**Change control:** All v2 changes are traceable to the review. Section-level mapping is in the Revision Log below.

---

## REVISION LOG (v1 → v2)

| Review finding | v1 location | v2 resolution | v2 section |
|---|---|---|---|
| Star decomposition changes gross turnover; can reject valid JEs due to ordered linked legs | §5.3 | Replaced with **deterministic debit-to-credit matching**; gross debit/credit turnover proven per account; same-account-both-sides explicitly rejected | §5.4 |
| Cross-org transfers conflict with tenant-local journals | §3.5, §4.6, §5.5, §12 | Introduced **`PostingGroup`**; separated **tenant / legal entity / accounting book / TigerBeetle ledger**; intercompany due-to/due-from model | §5.6, §3.5, §4.7 |
| Uncertain commit recovery undefined | §2.2, §4.4, §5.3, §10, §13 | Added **posting state machine** (READY → SUBMITTING → COMMITTED/COMMIT_UNKNOWN → FINALIZED/REJECTED); canonical plan persisted pre-submission; recovery via original transfer IDs | §5.7, §4.5 |
| Delegated authority chain not durable | §2.1, §3.2–3.3, §9 | Added **root permission ceilings, use-vs-delegate split, delegation graph, identity binding, descendant invalidation, reparent recomputation, first-admin bootstrap** | §3.7 |
| PSP capture unbalanced with nonzero network fees; payout/reserve custody undefined | §7.3–7.5 | Corrected templates; full worked flow with expected balances; custody model and account semantics defined | §7.5 |
| Safeguarding prevention vs detection conflated | §7.3, §7.5, §14 | Split into **synchronous issuance control (prevention)** and **internal + external reconciliation (detection)** | §7.7 |
| Period close / suspension / revocation race with approved posting | §4.4, §5.5–5.6, §10 | Added **posting fence, in-flight drain, effective-point semantics** | §5.9 |
| Account normal balance vs bounds conflated | §4.2–4.4 | Separated reporting presentation from enforced bounds; closure procedure expanded | §4.4, §4.6 |
| As-of reports unsupported by live lookup | §4.6, §5.8 | Defined **ledger commit time vs accounting posting date**, reproducible cutoff, journal-vs-ledger reconciliation | §5.10 |
| Batch size hardcoded | §5.3 | Validated against deployed version; `batch_id` = correlation only, linked chain = atomicity; oversized groups rejected | §5.4 |
| Plugin boundary leaks TB client / `ledger.write` | §6.1–6.3, §7.9 | Removed TB client from `PluginContext`; split `LOCKED` into `REQUIRED` / `PROHIBITED`; per-installation secret scope; activation readiness gate | §6.1, §6.3, §6.6 |
| FAPI missing PAR, role split, DoS, route inventory | §9 | Added PAR, AS/IdP/gateway/RS role split, route inventory, DoS requirements | §9 |
| SCA/TRA underspecified | §7.8 | Per jurisdiction/rail/type; evidence bound to operation and rechecked at core write boundary; monitoring vs exemption distinguished | §7.9 |
| Audit/event guarantees overclaimed | §2.4, §11, §13 | Authoritative evidence at core-controlled boundaries; canonical events, schemas, replay, CDC correlation; external checkpoint anchoring | §11, §13 |
| "Every org's money is in TigerBeetle" overclaims | Mission | Reframed as **authoritative record of booked positions and internal movements**; external custodians hold funds | §1 |

---

## 1. MISSION & PHILOSOPHY

Design a multi-tenant, FAPI-compliant financial services platform where **transaction integrity is non-negotiable** and **everything else is a replaceable plugin**. The core must be minimal, deterministic, and auditable. Business capability is delivered through a plugin ecosystem that tenants enable on demand. No domain-specific logic (KYC, inventory, banking connectors, notifications, PSP/EMI workflows) may live in the core—only the primitives to enforce money movement, role-based access, identity provider classification, organizational hierarchy, chart of accounts, double-entry journaling, and audit.

**Governing principle:** *If it moves money, it is core. If it touches money, it is a plugin.*

The platform is a **true double-entry accounting system**: every financial event produces one or more balanced Journal Entries (JEs), each with debit and credit lines that sum to zero within its accounting book and currency, and every JE is materialized as a linked batch of TigerBeetle transfers. No money moves without a balanced JE.

**Positioning of TigerBeetle (revised).** TigerBeetle is the **authoritative record of the platform's booked monetary positions and internal movements**. Banks, acquirers, and custodians hold and settle external funds; their independent records establish whether the positions represented in TigerBeetle agree with what happened outside the platform. Safeguarding, reconciliation, and regulatory evidence are therefore *checks against external reality*, not consequences of ledger balance alone.

---

## 2. CORE DOMAIN (NON-PLUGGABLE)

The core consists of **six** bounded contexts. No other module may be elevated to core status without explicit architectural review.

### 2.1 RBAC, Identity & Delegated Authority (Core)

The core owns **who can do what and who may grant it**, but not **how users authenticate**.

- **Permission catalog** is platform-root-owned and append-only. Permissions are global primitives (e.g., `tx.initiate`, `tx.approve`, `org.activate`, `plugin.enable`, `gl.account.create`, `je.approve`, `rbac.delegate`).
- **Roles** are tenant-scoped definitions composed from the permission catalog, each carrying a scope (`PLATFORM` / `TENANT` / `SUBTREE` / `EDGE`).
- **Delegated authority** is a first-class durable model (§3.7), not an emergent property of role subset checks.
- **Identity binding** maps federated identities to platform `person_id`s (§3.7.4). Maker-checker separation is enforced at `person_id`, not credential, level.
- **Four-eyes enforcement engine** is a core service (§10).
- **IdP Provider Classification** distinguishes `INTERNAL_IDP` and `EXTERNAL_IDP`. The core does not validate credentials—it delegates authentication and maps asserted identity to RBAC.

### 2.2 Payment & Transaction Ledger (Core, TigerBeetle-Backed)

TigerBeetle is the **system of record for booked money movement** in the data plane (hot path). It is not a general-purpose database; all metadata, business rules, and audit records live in the OLGP (online general-purpose) database.

**Data model:**
- **Ledgers**: physical TigerBeetle partitions. A book's accounts for a given currency live on exactly one TigerBeetle ledger (§4.2).
- **Accounts**: one TigerBeetle account per leaf GL account. `user_data_128` carries the OLGP `gl_account_id`; `user_data_64` carries the tenant hash; `user_data_32` carries the account-type ordinal.
- **Transfers**: each TigerBeetle transfer corresponds to exactly one debit-credit leg of a posted JE (or a two-phase pending transfer associated with a JE in `PENDING` state).

**Transaction orchestration service responsibilities:**
- Accept a `FinancialIntent` or `JournalIntent`.
- Resolve posting rules, fee/commission/tax rules, and the participating books.
- Build a `PostingGroup` (§5.6) containing one balanced JE per participating book and currency.
- Persist the canonical posting plan **before** submission (§5.7).
- Submit batched, deterministic, idempotent transfers to TigerBeetle.
- Reconcile uncertain outcomes (§5.7).
- Finalize JEs, audit, and outbox atomically in OLGP.
- Emit canonical events to the plugin bus.

**Critical constraint:** initiating a transfer must not require OLGP lookups for immutable type mappings. Ledger/account/transfer type integers are cached or hard-coded append-only. OLGP is consulted only for mutable business rules (fee schedules, posting-rule versions) cached with short TTLs.

### 2.3 Organization Lifecycle & Service Entitlement (Core)

- **Organization onboarding**: create tenant record, assign initial admin roles, configure IdP mode, provision initial books and CoA. KYC/KYB is a plugin; the core consumes the verdict and enforces that an org cannot be activated without `VERIFIED` status.
- **Deactivation**: soft-deactivate; freeze all TigerBeetle accounts; revoke sessions and API credentials; drain in-flight postings (§5.9). Requires four-eyes.
- **Service enablement**: tenant selects a plugin; core records entitlement, seeds permissions, provisions GL account templates, registers posting rules. Financial routes become eligible only after **all** dependencies are ready (§6.6).

### 2.4 Audit & Evidence Log (Core)

A **tamper-evident, append-only** audit store receives every state mutation from core and plugin-originated actions that the core mediates. Schema captures: `actor_id`, `checker_id`, `tenant_id`, `book_id`, `action_type`, `resource_type`, `resource_id`, `before_state_hash`, `after_state_hash`, `correlation_id`, `timestamp_utc`, `ip_address`, `client_id`.

**Authoritative evidence is generated at core-controlled mutation boundaries** (intent acceptance, approval resolution, plan persistence, submission, commit confirmation, finalization) and at **core-controlled provider-call boundaries** where the platform directly calls an external provider. Where a provider calls the platform (webhooks), the gateway logs the raw call into the audit chain before dispatch.

Plugins **cannot write directly** to the audit store. They receive `AuditReceipt` tokens for events the core has recorded on their behalf. A validated audit emitter cannot guarantee that a compromised plugin reports every action; the core therefore does not rely on plugin self-reporting for authoritative records of money movement, approvals, or account state.

### 2.5 Organization Hierarchy (Core Primitive)

See §3.

### 2.6 Chart of Accounts & Journal Entry Layer (Core)

See §4 and §5.

---

## 3. ORGANIZATION HIERARCHY & DELEGATED AUTHORITY

### 3.1 Hierarchy Model

```
Tenant {
  tenant_id: uuid
  parent_tenant_id: uuid | null
  hierarchy_path: ltree | materialized_path
  depth: int
  status: PENDING_KYC | ACTIVE | SUSPENDED | DEACTIVATED
  idp_policy: INTERNAL | EXTERNAL_REQUIRED | EXTERNAL_ALLOWED | PARENT_INHERITED
  onboarding_origin: PLATFORM | PARENT:<tenant_id>
  created_by: principal_id
}
```

**Hard invariants:**
1. `hierarchy_path` is immutable except via four-eyes **reparenting**.
2. A tenant sees only its own subtree.
3. Cascade deactivation policy is explicit: `BLOCK`, `SUSPEND_DESCENDANTS`, `ORPHAN_TO_GRANDPARENT`.
4. `max_depth` (default 5) enforced at onboarding; fail closed.

### 3.2 Delegated Onboarding (Core Workflow)

1. Parent admin with `org.onboard_child` submits `OnboardChildOrg` → four-eyes (checker must be a distinct `person_id` with `org.approve_child` at same-or-ancestor scope).
2. Core creates the tenant node (`status = PENDING_KYC`, `onboarding_origin = PARENT:<id>`).
3. Core emits `Organization.ChildOnboarded`; KYC/KYB plugin (if enabled on parent) may operate in **inherited-verification mode**, still recording a per-node verdict.
4. Parent admin creates the first admin principal — a core operation seeding the child's RBAC root role within the parent's ceiling (§3.7).
5. Child admin completes setup within inherited constraints: IdP mode, plugin installations, CoA, fee overrides.
6. `status → ACTIVE` requires four-eyes from the child's own checkers, or from parent checkers when `checker_delegation = PARENT_REQUIRED`.

**First-admin bootstrap.** A new child with exactly one human administrator cannot satisfy maker-checker alone. Resolution is explicit: the activation path is **parent-assisted** (parent checker acts as the second person) or **platform-assisted** (platform root provides the second checker). The bootstrap path is itself audited, and the resulting grant is bounded by the delegating principal's ceiling. No path exists where a single person both creates and activates a child.

### 3.3 IdP Policy Across the Tree

| Parent `idp_policy` | Child may choose |
|---|---|
| `INTERNAL` | Internal IdP only |
| `PARENT_INHERITED` | Only the parent's configured IdP |
| `EXTERNAL_REQUIRED` | Must configure its own external IdP |
| `EXTERNAL_ALLOWED` | Internal or own external IdP |

IdP configuration changes are four-eyes with parent-notification audit; parents may hold a **veto** via `checker_delegation`. The core validates every external IdP's OIDC discovery against the platform allowlist and continues to issue its own FAPI 2.0 tokens. Federated authentication never grants authorization.

### 3.4 Hierarchical Fee & Commission Resolution

Resolution order (first-match wins, bounded): child override → nearest ancestor → platform default. Out-of-bounds overrides rejected at write time. Revenue splitting is expressed as additional JE lines resolved by the core from the `FeeSchema`, using `ANCESTOR:<share_pct>` resolvers that walk the tree. Commission-split changes are four-eyes and audited with before/after rule hashes.

### 3.5 Inter-Org Money Movement (Revised)

Inter-org movement is **not** modeled as a two-leg clearing chain across a shared ledger, because that construction balances the *platform's* books but leaves each tenant with only one side of the entry. It is modeled as a **`PostingGroup`** (§5.6) containing a complete, balanced JE **for every participating accounting book**, with intercompany due-to/due-from accounts and settlement treatment defined by the intent's economic substance.

**Example — dealer advances 100 to parent as an intercompany loan:**

| Book | Debit | Credit |
|---|---|---|
| Dealer | Due from Parent 100 | Cash 100 |
| Parent | Cash 100 | Due to Dealer 100 |

Each book balances independently. A platform transit account may still be used for *payment-rail* flows and may net to zero, but that control is separate from proving each entity's books balance. That proof comes from each entry in the `PostingGroup`.

- Sibling-to-sibling movement remains prohibited; intercompany positions must route through a parent book or a defined intercompany structure.
- `funds.inter_org` edge entitlement is four-eyes to enable.
- Plugins cannot construct inter-org `PostingGroup`s; they submit intents via `context.requestInterOrgTransfer(...)`.

### 3.6 Audit Across the Tree

- Every audit record carries `hierarchy_path`, `book_id`, and `resource_tenant_id`.
- **Subtree chain checkpoints**: each node publishes a signed daily Merkle root; parents store children's roots in their own chain (chain-of-chains).
- **Cross-node operations** produce mirrored, independently hashed records linked by `correlation_id`.
- **External anchoring**: signed checkpoints are anchored in a store **outside** the mutable operational database (e.g., a WORM store with independent custody) at a policy-defined cadence, so that the audit chain cannot be rewritten by compromising the OLGP.

### 3.7 Delegated Authority Model (New)

#### 3.7.1 Ownership of authority

| Owner | Authority |
|---|---|
| Platform root | Defines the permission catalog, platform-only operations, maximum delegation scope, and permission ceilings per child organization. |
| Supplier / parent organization | Manages its users and local role definitions. Assigns permissions within its current ceiling and delegates onward only where explicitly authorized. |
| External IdP | Authenticates users and supplies attributes. Core-approved mappings determine which attributes may contribute to role assignment. |
| Core RBAC | Evaluates resource scope, role permissions, active ancestor delegation, approval authority, and revocation **at execution time**. |

#### 3.7.2 Root permission ceilings

Each tenant node has a **permission ceiling** — the maximum set of permissions any principal in its subtree may hold, inherited from the delegating parent. Root sets the ceiling for platform-root children; a parent may narrow but never widen the ceiling of a child. Ceilings are versioned and audited.

#### 3.7.3 Use vs. delegate

A principal's **right to use** a permission is separate from their **right to delegate** it. Delegation requires `rbac.delegate` **and** that the permission being delegated is covered by the delegating principal's own active authority at an equal-or-broader scope.

#### 3.7.4 Durable delegation graph

Delegation is a persistent graph of edges `(delegator_principal, grantee_principal, permission_set, scope, effective_from, effective_to, revoked_at)`. Invariant:

> **A principal's effective grant must be covered by active delegation on every edge from platform root to that principal.** A local role definition alone never confers authority.

Revoking an ancestor delegation **invalidates affected downstream grants even if local role definitions remain** — the downstream principal's effective permission is the intersection of local roles and the active delegation chain.

**Reparenting** recomputes inherited authority for the affected subtree before sensitive operations resume; grants whose covering chain no longer holds are invalidated and reported.

#### 3.7.5 Identity binding

Federated identities bind to platform `person_id`s via `(issuer, stable_subject)`. Multiple identities may map to one `person_id` (e.g., a human with both an internal and external IdP identity). **Maker-checker separation is enforced at `person_id`, not credential**, so two logins belonging to the same person cannot satisfy four-eyes.

#### 3.7.6 Revocation at execution time

Effective permission is recomputed at the write boundary before every protected operation and again at the **posting fence** (§5.9). A permission revoked at time *t* cannot authorize a posting admitted after *t*, regardless of when the request was originally submitted. In-flight postings already past the fence complete or drain per §5.9.

---

## 4. CHART OF ACCOUNTS, BOOKS & LEDGER TOPOLOGY

### 4.1 Separation of Tenancy, Legal Entity, Book, and Ledger (Revised)

These are independent concepts and cannot be answered by `parent_tenant_id` alone:

| Concept | Meaning |
|---|---|
| **Tenant** | Access, authorization, and reporting boundary in the platform. |
| **Legal entity** | Regulatory/accounting entity — the unit that files and is audited. One tenant may map to one or more legal entities; one legal entity may span tenants (rare). |
| **Accounting book** | A set of GL accounts that balance together, in exactly one currency. A book belongs to exactly one legal entity. A legal entity may maintain multiple books (e.g., statutory and management) in the same currency. |
| **TigerBeetle ledger** | Physical partition. A book's accounts for its currency live on exactly one TigerBeetle ledger. Shared-ledger default: all books in a currency share the ledger, namespaced by account ID. Per-book ledger option: dedicated ledger per book per currency. |

A dealer can therefore be an access/reporting boundary **within the manufacturer's books** (no separate book) or a **separate legal entity with its own book** — the hierarchy records the tenancy relationship; the book records the accounting boundary. Both are core.

### 4.2 Ledger Topology

**Default — shared ledger per currency.** Ledger ID = ISO 4217 numeric. Account ID = `UUIDv5(platform_ledger_namespace, book_id + ":" + gl_account_id)`. Isolation is structural (IDs encode book scope).

**Optional — dedicated ledger per book per currency.** Ledger ID allocated via a **collision-checked registry** (not an unchecked 32-bit hash). Required when regulatory segregation demands it.

**Transit clearing accounts** (platform-owned, used only for payment-rail flows and currency exchange) are explicitly designated and carry the zero-balance invariant. **FX liquidity accounts are not transit** — they normally carry currency inventory and must not be expected to net to zero.

### 4.3 CoA Model

```
GLAccount {
  gl_account_id: uuid
  book_id: uuid                    // accounting boundary (§4.1)
  tenant_id: uuid                  // owning node (for access control)
  parent_gl_account_id: uuid|null  // reporting hierarchy only
  tigerbeetle_account_id: u128     // derived, immutable
  ledger_id: u32
  code: u16                        // controlled CoA registry
  name: string
  account_type: ASSET | LIABILITY | EQUITY | INCOME | EXPENSE | CLEARING | SUSPENSE
  normal_balance: DEBIT | CREDIT | NONE   // presentation only (§4.4)
  balance_bound: NONE | DEBIT_BOUND | CREDIT_BOUND | OVERDRAFT_FACILITY  // enforcement (§4.4)
  posting_allowed: boolean
  currency: ISO_4217
  status: PENDING | ACTIVE | SUSPENDED | CLOSED
  created_by, approved_by
  version: int
}
```

**Hard rules:**
1. Every leaf GL account is a real TigerBeetle account.
2. Header accounts are reporting-only; transfers never reference non-leaf accounts.
3. `code` uses an append-only platform CoA registry (assets 1000–1999, liabilities 2000–2999, etc.); tenant sub-codes are prefixed.
4. `ledger_id` is immutable after creation; topology changes require a four-eyes migration.
5. A book's accounts are single-currency.

### 4.4 Account Semantics (Revised)

**Normal balance is a reporting attribute only.** It determines how the account is presented in statements; it does **not** by itself impose an operational bound. Blanket account-type-to-flag mapping is rejected because it would reject valid contra-account activity and legitimate corrections.

**Enforced balance bounds are chosen by account purpose:**

| `balance_bound` | TigerBeetle flag | Use |
|---|---|---|
| `NONE` (default) | Neither bound flag | Most accounts; corrections and contra activity permitted. |
| `DEBIT_BOUND` | `credits_must_not_exceed_debits` | Cash, safeguarded assets, prepaid expenses where negative is not permitted. |
| `CREDIT_BOUND` | `debits_must_not_exceed_credits` | Customer deposits and e-money liabilities where negative would be a breach. |
| `OVERDRAFT_FACILITY` | `NONE` + policy layer | Accounts with approved overdraft; limits enforced by the core orchestrator, not the ledger. |
| `CLEARING` / `SUSPENSE` | `NONE` | Transit accounts; residual positions bounded by reconciliation policy. |

Policy defaults may suggest a bound per account code, but the bound is set **per account at creation, four-eyes**, and may be `NONE` even for an asset account when the business requires it. `flags.history` is set on accounts requiring statements.

### 4.5 GL Account Lifecycle & Provisioning Recovery (Revised)

- **Creation**: maker submits, checker approves, core derives the TB account ID deterministically and submits. **Provisioning uses the same recovery model as postings (§5.7)**: the canonical provisioning plan (account fields, IDs, initial funding transfers if any) is persisted before submission; uncertainty is resolved by lookup; account creation and initial funding are two TB requests and are recovered as a single logical workflow. The OLGP record moves to `ACTIVE` only after the TB account is confirmed to exist with the expected fields.
- **Update/reparent**: `name`, `parent_gl_account_id`, `status` only; TB fields immutable; reparent affects reporting only.
- **Suspension**: enforced by the orchestrator at the posting fence (§5.9); TB has no suspend flag.
- **Closure** (revised):
  1. Admission fence set (no new postings to the account).
  2. Pending obligations resolved: all pending transfers referencing the account are captured, voided, or expired; their JEs reach a terminal state.
  3. Posted balance must be exactly zero (or transferred to a designated successor account via a balanced JE).
  4. Two-phase `closing` transfer approved and submitted under the §5.7 recovery model; the closing transfer's `COMMIT_UNKNOWN` must be resolved to `COMMITTED` or `REJECTED` before OLGP is finalized.
  5. OLGP record → `CLOSED`. Account remains queryable forever.

### 4.6 Balances, Statements, As-Of Reporting (Revised)

The core `LedgerQueryService` provides:

- `getBalance(bookId, glAccountId)` — live TB lookup + OLGP metadata.
- `getStatement(bookId, glAccountId, from, to)` — TB `get_account_balances` for `history` accounts.
- `getTrialBalance(bookId, asOfCutoff)` — **as-of**, not live-only (see below).

**Ledger commit time vs. accounting posting date are distinct.** TigerBeetle records commit timestamps; JEs carry `posting_date` (business date). As-of reporting uses a **reproducible cutoff** defined as: all JEs where `posting_date ≤ asOfCutoff` **and** `finalized_at ≤ reportRunAt`. Reports record both the accounting cutoff and the report run time in their metadata so they are reproducible.

**Journal-vs-ledger reconciliation**: on a policy-defined cadence and before any official report, the core reconciles journal-derived per-account turnover and closing balances against TigerBeetle cumulative `debits_posted`/`credits_posted`. Any divergence is a P1 incident.

**Cash flow statements** require movement classifications (operating / investing / financing) mapped per account and, where needed, per counterparty or event type — beyond the CoA hierarchy. These mappings are core-managed and four-eyes-controlled.

### 4.7 Inter-Org Transfers (Revised)

Inter-org movement is a `PostingGroup` (§5.6), not a two-leg clearing chain. The `InterOrgTransferService` validates:
- Both books are `ACTIVE` and belong to the participating tenants.
- Source and destination GL accounts are `posting_allowed`, `ACTIVE`, same book and currency as their entry.
- `funds.inter_org` edge entitlement enabled.
- Four-eyes approval obtained.
- Amount within parent-defined inter-org limit.
- The intent's economic substance determines intercompany accounts (due-to/due-from) and any transit clearing used for the payment rail.

**Cross-currency** inter-org movement is a `PostingGroup` including per-currency balanced JEs in each participating book plus explicitly designated transit clearing accounts; FX liquidity accounts carry currency inventory and are not expected to net to zero. The `fx` plugin supplies the rate; the core constructs the group.

### 4.8 Plugin Boundary with the Ledger

Plugins may: read balances/statements (tenant- and book-scoped); submit `JournalIntent`s; request ledger and inter-org transfers via the context (routed through the core orchestrator); declare GL account templates and posting rules; subscribe to events.

Plugins may **not**: call TigerBeetle (no client is issued to plugins, and `ledger.write` is **removed** from `PluginContext`); create/close/suspend/reparent GL accounts; read other books or tenants; modify TB flags; bypass rules or four-eyes.

---

## 5. DOUBLE-ENTRY JOURNAL ENTRY LAYER

### 5.1 Why a JE Layer Over TigerBeetle

TigerBeetle transfers are single-debit/single-credit primitives. Real accounting events are n-line entries. A flat stream of transfers does not preserve the economic event as an atomic unit, the posting rules, period control, reversals referencing originals, or trial-balance proof. The JE layer is core.

### 5.2 Data Model

```
JournalEntry {
  entry_id:            uuid          // UUIDv5(namespace, tenant_id + ":" + operation_id + ":" + idempotency_key)
  tenant_id:           uuid
  book_id:              uuid
  period_id:            uuid
  entry_type:           MANUAL | SYSTEM | ACCRUAL | ADJUSTMENT | REVERSAL | OPENING | CLOSING
  posting_date:         date
  value_date:           date
  description:          string
  reference:            string|null
  source_event_id:      uuid|null
  reversal_of_entry_id: uuid|null
  reversed_by_entry_id: uuid|null
  currency:             ISO_4217
  lines:                JournalLine[]   // >= 2, balanced within book and currency
  total_debits:         u64
  total_credits:        u64
  status:               DRAFT | PENDING_CHECKER | READY | SUBMITTING | COMMIT_UNKNOWN | COMMITTED | FINALIZED | REJECTED | REVERSED
  plan_hash:            string          // canonical hash of the posting plan (§5.7)
  tb_transfer_ids:      u128[]
  maker_id:             principal_id
  checker_id:           principal_id|null
  finalized_at:         timestamp_utc|null
  version:              int
}

JournalLine {
  line_no:              int
  gl_account_id:        uuid
  tigerbeetle_account_id: u128
  direction:            DEBIT | CREDIT
  amount:               u64           // > 0
  memo:                 string
}

PostingGroup {
  group_id:             uuid
  intent_id:            uuid
  economic_event_type:  string
  entries:              JournalEntry[]   // one balanced JE per participating book & currency
  status:               same state machine as JournalEntry (group-level rollup)
  plan_hash:            string
  tb_transfer_ids:      u128[]           // all transfers across the group, linked
}

AccountingPeriod {
  period_id, tenant_id, book_id
  fiscal_year, period_no
  start_date, end_date
  status: OPEN | SOFT_CLOSED | HARD_CLOSED
  opened_by, closed_by
}
```

### 5.3 Period Semantics

| Status | Effect |
|---|---|
| `OPEN` | JEs may post with `posting_date` inside the range. |
| `SOFT_CLOSED` | New postings blocked except `ADJUSTMENT` entries with `je.adjust_soft_closed` + four-eyes. |
| `HARD_CLOSED` | All postings blocked. Corrections require a reopening entry in the current period referencing the closed period's original entry. |

### 5.4 Decomposition: Direct Debit-to-Credit Matching (Replaces Star) (Revised)

**Rejected design (v1 star pattern).** For `Dr A 60, Dr B 40, Cr C 100`, star emitted `Dr B / Cr A 40` then `Dr A / Cr C 100`. Account A's *net* is correct, but its **gross turnover** is wrong (100 debits, 40 credits instead of 60 debits, 0 credits). With TB ordered linked legs, the first leg can fail on a bound flag. Star is removed.

**Direct debit-to-credit matching (v2).**

Input: lines `L₁ … Lₙ` in a `JournalEntry`, balanced by construction (`Σ debits = Σ credits > 0`).

1. Sort lines by `(line_no, direction)` with debits first, credits second — **stable order** within direction.
2. Maintain a pointer into the debit list and a pointer into the credit list.
3. Repeatedly: `amount = min(remaining_debit, remaining_credit)`; emit transfer `debit = current_debit_account, credit = current_credit_account, amount`. Decrement both remainders; advance whichever reaches zero.
4. Continue until both lists are exhausted.
5. Set `flags.linked` on all transfers except the **final** transfer in the request; the final transfer has `linked` cleared.

For balanced input, this emits at most `(#debit_lines + #credit_lines − 1)` transfers.

**Properties (proven and property-tested):**
- **Per-account gross debit turnover** = that account's total debit lines; **gross credit turnover** = that account's total credit lines. No synthetic turnover.
- **Net effect per account** = its journal line.
- **Ordered-leg safety**: each transfer is itself a valid debit/credit pair; no leg over-draws an account beyond its net JE position for that direction. Bound flags are evaluated per leg correctly.
- **Determinism**: transfer IDs are derived from `entry_id` and the deterministic leg index, so retries reproduce IDs.
- **Same account on both sides is rejected** explicitly. TigerBeetle rejects a transfer with identical debit and credit account IDs, and the accounting representation of a same-account wash (presentation vs. netting) is not yet defined. Posting-rule templates that produce such a JE are rejected at write time with a clear error. Netting may be introduced in a future revision with an explicit accounting model.

**Example (fixed):** `Dr A 60, Dr B 40, Cr C 100` → `T1: Dr A / Cr C 60`, `T2: Dr B / Cr C 40`. Account A gross = 60 Dr / 0 Cr. Account C gross = 0 Dr / 100 Cr. ✓

### 5.5 Batch Limits (Revised)

- **Validate against the deployed TigerBeetle version's actual request limit** — do not hardcode. The core stores the validated limit per cluster and rejects atomic groups exceeding it.
- **`batch_id` across requests gives correlation, not atomicity.** Atomicity within one request requires a single linked chain. A `PostingGroup` whose total transfers exceed the batch limit is **rejected**; if a business requirement demands larger atomic groups, a separate workflow with explicit partial outcomes must be designed (not silently split).

### 5.6 `PostingGroup` (New)

A `PostingGroup` is the atomic unit for economic events that touch more than one accounting book (intercompany, cross-currency, commission splits across books). It contains **one balanced `JournalEntry` per participating book and currency**, and its transfers are submitted as **one linked TigerBeetle chain** (subject to batch limit).

- Each entry balances independently within its book and currency.
- The intent's `economic_event_type` determines the group's structure via posting-rule templates.
- Consolidation and elimination of intercompany positions are downstream reporting concerns; the group itself preserves each book's books balance.
- Group status is a rollup: `FINALIZED` only when every entry is `FINALIZED`.

### 5.7 Uncertain Commit Recovery (New)

**Posting state machine (per JE and per group):**

```
DRAFT → PENDING_CHECKER → READY → SUBMITTING → COMMITTED → FINALIZED
                                              ↘ COMMIT_UNKNOWN → (recovery) → COMMITTED | REJECTED
                                              ↘ REJECTED (definitive)
```

| State | Meaning |
|---|---|
| `READY` | Approved; canonical posting plan persisted with tenant, book, exact transfer IDs, amounts, posting-rule version, policy version, approval hash, and expected transfer fields. |
| `SUBMITTING` | Request dispatched to TigerBeetle; response not yet processed. |
| `COMMIT_UNKNOWN` | Lost response or process crash after dispatch. |
| `COMMITTED` | TigerBeetle confirmed the transfers with the expected fields. |
| `FINALIZED` | OLGP journal status, outcome audit record, and outbox event written atomically after commit confirmation. Client acknowledgement is durable at this point. |
| `REJECTED` | Definitive rejection. |

**Rules:**
- **The canonical plan is persisted before submission.** It is the recovery anchor.
- **Lost response / crash → `COMMIT_UNKNOWN`.** Resolve by `lookup_transfers` with the **original** transfer IDs. If the transfers exist with the expected fields → `COMMITTED` and proceed to finalization. If they do not exist and the last observed TigerBeetle error semantics permit retry with the same IDs → resubmit with the same IDs. If TigerBeetle reports the IDs unusable → `REJECTED`.
- **Never issue fresh IDs while the original outcome is uncertain.** A fresh attempt is a new, separately auditable decision created only after the uncertainty is resolved to `REJECTED`, and it uses a new idempotency key.
- **Idempotency** is scoped to `(tenant_id, operation_id, idempotency_key)` and bound to a canonical request hash. Same hash → same outcome returned. Different hash with same key → rejected with a security event.
- **Finalization is atomic in OLGP**: journal `POSTED`, outcome audit, outbox event committed together. If OLGP finalization is temporarily unavailable, the JE remains `COMMITTED` (exposed as processing) and a recovery worker completes finalization idempotently from the persisted plan.
- **Timing metrics** distinguish **time to ledger commit** and **time to durable client acknowledgement**.
- **The same recovery model applies to account provisioning and topology migrations** (§4.5), including the multi-request sequence account-create → initial-funding → OLGP-activate.

### 5.8 Posting Rules Engine

Versioned, four-eyes-controlled posting-rule templates (restricted DSL, no code execution) resolve business events to `PostingGroup`s. Resolution order: tenant rule → nearest ancestor rule → platform default. Tenant overrides must reference accounts within the tenant's own books; out-of-scope overrides are rejected at write time. Plugins raise `JournalIntent`s; they never see account IDs or line amounts.

### 5.9 Posting Fence, Drain, and Effective-Point Semantics (New)

Every mutable policy that can affect a posting — period status, account suspension/closure, plugin/route revocation, grant revocation, org freeze — is versioned. The core maintains a monotonically increasing **posting epoch** per book and per tenant.

**Write boundary procedure** (applied to every JE and `PostingGroup` before dispatch):
1. Recompute effective permission at the posting fence (§3.7.6).
2. Revalidate period status, account status, entitlements, and policy versions.
3. Stamp the submission with the current epoch.
4. If the epoch advanced between step 2 and step 3, revalidate before dispatch.

**Close / freeze / suspend / revoke procedure:**
1. **Fence**: new postings for the affected scope are rejected immediately.
2. **Drain**: the core waits for in-flight `SUBMITTING` / `COMMIT_UNKNOWN` entries in the affected scope to reach a terminal state (`COMMITTED` → finalized, or `REJECTED`). A configurable drain timeout applies; on timeout, remaining entries stay `COMMIT_UNKNOWN` and are resolved by recovery before the close is considered effective for reporting purposes.
3. **Effective-point record**: the close/freeze is recorded with its effective epoch, and reports use that epoch.
4. **In-flight already committed** entries are included in the pre-close period; **in-flight rejected** entries are excluded.

**Revocation** takes effect at the fence for new admissions. Whether an already-submitted-but-not-yet-committed posting is aborted or allowed to complete is a **policy choice** recorded per operation class; the default for money movement is *allow to complete* (aborting after approval risks double-spend ambiguity), with the drain window governing how long the close waits.

**Pending obligations during freeze** (e.g., PSP authorizations): pending two-phase transfers are captured, voided, or expired per explicit policy; the resulting JEs reach terminal states before the freeze is effective for reporting.

### 5.10 Trial Balance, Financial Statements, Reconciliation (Revised)

- **Trial Balance** (per book, per period, per currency): opening + Σ period debits − Σ period credits = closing, grouped by account type. **Invariant: `Σ all debits == Σ all credits`** within each book.
- **Balance Sheet, P&L, Cash Flow**: derived from the CoA tree + trial balance, using movement classifications (§4.6). Core reports.
- **Reconciliation obligations**: journal-derived per-account turnover and closing balances are reconciled against TigerBeetle cumulative figures on a policy cadence and before any official report. Divergence is P1 and halts official reporting for the affected book+currency.
- **Transit clearing** net-zero is asserted per designated transit account. **FX liquidity accounts are excluded** from zero-balance assertion.

---

## 6. PLUGIN ECOSYSTEM

### 6.1 Manifest & `PluginContext` (Revised)

```
PluginManifest {
  code, version, isCore: false
  dependencies: string[]
  contributedPermissions: Permission[]
  contributedRoutes: RouteDefinition[]
  contributedMenuEntries: MenuEntry[]
  contributedGLAccounts: GLAccountTemplate[]
  contributedPostingRules: PostingRule[]
  feeSchema: FeeSchema
  family: "PSP" | "EMI" | null
  requiredSubPlugins: string[]
  optionalSubPlugins: string[]
  regulatoryProfile: { jurisdictions: [...], licenceType: "PSP"|"EMI"|"PI" }
  hierarchyInheritance: REQUIRED | PROHIBITED | INHERIT | OPT_IN | OPT_OUT   // revised (§6.3)
  installationModel: SINGLETON_PER_TENANT | MULTI_INSTANCE_PER_TENANT
  minAncestorRoleToInstall: Permission
  requiredParentEntitlement: string | null
  hierarchyEvents: EventSchema[]
  boot(context: PluginContext): void
}
```

**`PluginContext` exposes:** tenant- and installation-scoped OLGP repositories; the event bus; `context.journal.submit(intent)`; `context.requestLedgerTransfer(intent)`; `context.requestInterOrgTransfer(intent)`; `context.ledger.balance/statement/trialBalance` (read-only); the audit emitter; `context.secrets(installation_id)`.

**`PluginContext` does not expose** a TigerBeetle client and does not grant `ledger.write`. These contradicted the core-only money boundary in v1 and are removed.

### 6.2 Plugin Types vs. Installations

A plugin **type** is code; a plugin **installation** is a tenant-scoped instance with its own configuration and its **own secret scope** (per-installation vault path, tenant-derived encryption key). Where a shared provider credential is genuinely needed (e.g., a KYC provider contract spanning a subtree), that credential is provided as an **explicit brokered capability** with its own audit trail — not as a shared vault path. `inheritance_origin` records `DIRECT` or `INHERITED_FROM:<tenant_id>`.

### 6.3 Inheritance Policies (Revised)

| Policy | Behavior |
|---|---|
| `REQUIRED` | Must be installed for the child; cannot be disabled. (Formerly part of `LOCKED`.) |
| `PROHIBITED` | Must not be installed anywhere in the subtree; cannot be overridden. (Formerly part of `LOCKED`.) |
| `INHERIT` | Automatically inherited; child cannot disable. |
| `OPT_IN` | Parent offers; child activates with four-eyes. |
| `OPT_OUT` | Inherited by default; child may deactivate. |

Inheritance is a reference, not a copy. Revoking a parent installation issues `PluginInstallation.Revoked` to descendants; each descendant deactivation is audited. Direct installations of the same code are unaffected.

### 6.4 Catalog (Condensed)

KYC/KYB (provider-agnostic, inherited-verification mode), Bank Connector (ISO 20022/SEPA/ACH/SWIFT), Inventory (multi-instance), Notification, Reporting/Analytics, Document Management, FX (supplies rates only), Dispute/Chargeback, ERP Connector (multi-instance, CoA mapping), Reconciliation (reference), PSP family (§7), EMI family (§7).

### 6.5 Lifecycle

Registration → Activation (four-eyes) → Deactivation (never hard-deletes) → Versioning (semver, migration shims). Activation and **route eligibility** are governed by §6.6.

### 6.6 Activation Readiness Gate (New)

A plugin's **financial routes and posting rules become eligible only after all of the following are `ACTIVE`**: GL account templates provisioned (§4.5); posting rules registered and approved; contributed permissions seeded into RBAC; declared dependencies active and ready; secret scope provisioned. Until then, contributed routes return `503 Plugin Not Ready` (not `403`, which is reserved for authorization failure), and contributed posting rules cannot be resolved. Route enablement is an explicit, audited state, not a consequence of registration.

---

## 7. PSP AND EMI PLUGIN FAMILIES

### 7.1 Positioning

PSP and EMI are composite plugin families. No PSP/EMI logic enters the core. The core owns accounts, JEs, transfers, RBAC, four-eyes, and audit.

### 7.2 Family Structure (Unchanged in Outline)

PSP: `psp-merchant-onboarding`, `psp-acquiring`, `psp-payout`, optional `psp-gateway`, `psp-reconciliation`.
EMI: `emi-issuance`, `emi-redemption`, `emi-safeguarding`, `emi-payments`, optional `emi-regulatory-reporting`, `emi-transaction-monitoring`.
Shared satellites: `kyc`, `fx`, `notification`, `dispute`, `document-management`.

### 7.3 CoA Templates

**PSP** (unchanged codes): 1100 Merchant Receivable, 1150 Merchant Reserve, 2100 Merchant Payable, 2200 Chargeback Payable, **2110 Payouts in Transit (new)**, 1350 Network Fees Payable (new), 4100 MDR Revenue, 4200 Gateway Fee Revenue, 5100 Interchange Expense, 5200 Scheme Fee Expense, 1300 Acquirer Clearing.

**EMI** (unchanged codes): 1000 Safeguarding Cash, 1010 Safeguarding Approved Assets, 2000 E-Money Liability — Wallets, 2010 E-Money Liability — Pending Redemption, 4000/4010/4020 Fee Revenue, 5000 Safeguarding Shortfall Expense, 1300 EMI Clearing.

### 7.4 Account Semantics for PSP/EMI

- 2100 Merchant Payable: `balance_bound = CREDIT_BOUND` (merchant cannot be owed negative; chargebacks are posted to 2200 and 1150, not by driving 2100 negative).
- 1150 Merchant Reserve: `balance_bound = DEBIT_BOUND`.
- 2000 E-Money Liability: `balance_bound = CREDIT_BOUND` (a negative wallet balance is a breach).
- 1000 Safeguarding Cash: `balance_bound = DEBIT_BOUND` (negative safeguarded cash is a breach).
- 1300 Acquirer/EMI Clearing: `balance_bound = NONE` (transit).
- 2110 Payouts in Transit: `balance_bound = DEBIT_BOUND`.

### 7.5 PSP Reference Flows (Corrected) (Revised)

#### 7.5.1 Authorization and Capture

**Authorization** creates a **pending** JE in `PENDING` state backed by a pending two-phase transfer. The pending transfer is a **single-event request** and therefore does **not** carry `flags.linked` on its final event; if the authorization is later part of a larger linked submission, it is never the final event of that submission.

```
auth.hold (pending, JE status = PENDING):
  T: debit  1300 Acquirer Clearing (pending)  → credit 2100 Merchant Payable (pending)
     flags.pending   (no linked flag as single-event request)
```

**Expiry/void of an unposted hold** is a distinct state transition: `void_pending_transfer` releases the hold; the JE moves `PENDING → REJECTED` (or `CANCELLED`); no posted JE is mutated.

**Capture** posts the JE and the corresponding transfers:

```
payment.captured:
  Dr  1300 Acquirer Clearing        {{ gross }}
  Cr  2100 Merchant Payable         {{ net_to_merchant }}
  Cr  4100 Merchant Discount Revenue {{ mdr }}
```
where `gross = net_to_merchant + mdr`.

**Network costs are a separate balanced entry** — not additions to the debit side of the capture JE. Two variants depending on contract settlement:

```
network.costs.gross_settle:
  Dr  5100 Interchange Expense      {{ interchange }}
  Dr  5200 Scheme Fee Expense       {{ scheme_fee }}
  Cr  1350 Network Fees Payable     {{ interchange + scheme_fee }}

network.costs.net_settle:
  Dr  5100 Interchange Expense      {{ interchange }}
  Dr  5200 Scheme Fee Expense       {{ scheme_fee }}
  Cr  1300 Acquirer Clearing        {{ interchange + scheme_fee }}
```

**Verification requirement:** the settlement identity `gross = net_to_merchant + mdr` is checked against the **capture event and applied fee schedule** — a balanced trial balance alone cannot prove the merchant received the correct amount. The `psp-reconciliation` plugin asserts this identity per capture event and per settlement batch.

#### 7.5.2 Payout (Defined Custody Model)

Payout initiation reduces merchant payable into a **payouts-in-transit** custody account; the actual cash movement to the merchant's bank is a separate, later step:

```
payout.initiated:
  Dr  2100 Merchant Payable         {{ amount }}
  Cr  2110 Payouts in Transit       {{ amount }}

payout.executed (bank confirmation via bank-connector):
  Dr  2110 Payouts in Transit       {{ amount }}
  Cr  1000 Cash at Bank             {{ amount }}

payout.rejected / timeout / failed:
  Dr  2110 Payouts in Transit       {{ amount }}
  Cr  2100 Merchant Payable         {{ amount }}
```

**Late confirmation** after a timeout-triggered reversal is an explicit reconciliation case: if the bank later confirms a payout already reversed, a new JE re-recognizes the outflow and a reconciliation exception is opened. The `psp-reconciliation` plugin owns the exception lifecycle.

#### 7.5.3 Reserve (Modeled Once)

Reserve restrictions are modeled **once**: reserved amounts are held in 1150 and are **excluded from 2100**. `available_to_payout` is the 2100 balance after any pending payout JE, **not** `2100 − 1150 − 2200` recomputed at payout time.

```
chargeback.reserve_hold:
  Dr  2100 Merchant Payable         {{ reserve_amount }}
  Cr  1150 Merchant Reserve         {{ reserve_amount }}
```

Release is a separate JE after the chargeback window. Both four-eyes above threshold.

#### 7.5.4 Chargeback vs. Reversal

A chargeback is a **new adjustment JE linked to the capture** via `correlation_id`/`reference`. `reversal_of_entry_id` is reserved for a **true reversal** that satisfies §5.5 (full mirror of the original, original `POSTED` and not already reversed). A partial or economic chargeback is not a reversal.

```
chargeback.received:
  Dr  2200 Chargeback Payable       {{ amount }}
  Cr  1300 Acquirer Clearing        {{ amount }}
```

#### 7.5.5 Worked Flow — Expected Balances at Each Step

Starting state: all accounts zero. Capture of gross 110, mdr 10, net 100; interchange 1, scheme fee 0.5, net-settle against acquirer clearing.

| Step | JE | 1300 | 2100 | 4100 | 5100 | 5200 | 1350 | 1000 |
|---|---|---|---|---|---|---|---|---|
| Authorization (pending) | hold | 0 (pending) | 0 (pending) | 0 | 0 | 0 | 0 | 0 |
| Capture | capture | **−110** | **+100 Cr** | **+10 Cr** | 0 | 0 | 0 | 0 |
| Network costs (net-settle) | network | **−108.5** | +100 Cr | +10 Cr | **+1** | **+0.5** | 0 | 0 |
| Payout initiated (100) | payout | −108.5 | **0** | +10 Cr | +1 | +0.5 | 0 | 0 |
| Payout executed | payout | −108.5 | 0 | +10 Cr | +1 | +0.5 | 0 | **−100** |

Each step's JE balances independently. 1300 (acquirer clearing) carries a residual that the acquirer settlement file clears; 1300 is a transit account and its net-zero is asserted per settlement batch by `psp-reconciliation`, not after every single JE.

### 7.6 EMI Reference Flows (Unchanged in Outline)

`e_money.issued` (Dr 1000 / Cr 2000), `e_money.redeemed` (Dr 2000 / Cr 1000), wallet transfers (Dr 2000 sender / Cr 2000 receiver, distinct TB accounts), payments (through 1300 clearing), multi-currency wallets (separate TB accounts per currency, FX via `fx` plugin rates and core-constructed cross-currency `PostingGroup`).

### 7.7 Safeguarding: Prevention vs. Detection (Revised)

v1 conflated prevention and detection. v2 separates them.

**7.7.1 Prevention — synchronous issuance control (core + plugin policy).**

Before `e_money.issued` is posted, the core applies a **synchronous issuance control** at the relevant **legal entity + currency** boundary:

- **Ledger-known coverage**: under a concurrency-safe lock per (legal entity, currency), compute `Σ(2000 + 2010) + new_issuance ≤ Σ(1000 + 1010)`. If the check fails, issuance is rejected **before submission** — the JE never reaches `READY`.
- **Verified funding evidence**: if the operational policy is to require fresh evidence that eligible funds have been received and are held externally, that evidence is checked at the same write boundary; stale or insufficient evidence blocks issuance per policy (fail-closed).
- The prevention control is **not** a subscriber to `JournalEntry.Posted`. Subscribers run after commit and cannot prevent a breach.

**7.7.2 Detection — internal and external reconciliation (plugin).**

`emi-safeguarding` runs, distinct from prevention:

- **Internal reconciliation**: recompute safeguarding coverage from the ledger on every `JournalEntry.Posted`; emit `SafeguardingBreach` if coverage falls below 100% *after* commit — this is a detection signal and a P1 incident that halts further issuance via the prevention control.
- **External reconciliation**: reconcile the ledger's safeguarding positions against records of the parties actually holding the funds (banks, custodians) on the jurisdiction's required cadence. External reconciliation is independent of ledger balance and is the evidence regulators expect (e.g., FCA CASS 15 distinguishes internal and external reconciliations).
- **Regulatory calculation and evidence generation** (daily reconciliation records with timestamps, method, outcome, D+1 comparison; monthly returns) are produced from the same ledger state and external records, scoped to the applicable UK regime and licence where relevant.

The core enforces ledger invariants (balanced JEs, `CREDIT_BOUND` on 2000, `DEBIT_BOUND` on 1000). The plugin owns regulatory interpretation and the external-reconciliation evidence pack.

### 7.8 RBAC and Four-Eyes Additions

Unchanged from v1, plus: `emi.issuance.block` (prevention override, four-eyes, P1-audited) and `emi.safeguarding.external_recon_confirm` (four-eyes).

### 7.9 SCA, Dynamic Linking, and TRA (Revised)

- **SCA and exemption handling are defined per jurisdiction, rail, and transaction type.** A rail that does not require SCA is explicitly marked as such; a transaction type eligible for an exemption is explicitly marked and its conditions are enforced.
- **Authorization evidence is bound to the approved operation** — amount, payee, and other relevant binding fields — at token issuance and **rechecked at the core write boundary** before a payment-initiation JE is admitted. A token whose binding does not match the admitted operation is rejected with a security event.
- **General transaction monitoring is distinct from the regulatory TRA exemption.** `emi-transaction-monitoring` and `psp-acquiring` may produce risk signals used for both purposes, but the TRA exemption decision is a distinct, auditable decision with its own evidence record, and cannot be inferred from general monitoring.
- **RAR scoping** (merchant, currency, amount ceiling) is an FSP policy layered on the baseline FAPI profile.

### 7.10 Hierarchy and Inheritance

As in v1, updated for the `REQUIRED`/`PROHIBITED` split: a parent EMI may mark `emi-safeguarding` as `REQUIRED` (children cannot disable compliance monitoring). Merchant GL accounts are tenant-scoped to the merchant book; PSP clearing/revenue accounts live at the PSP book. Inter-org flows use `PostingGroup`s.

### 7.11 Consolidated PSP/EMI Invariants (Updated)

1. No PSP/EMI logic in the core.
2. Every merchant and e-money movement produces a balanced JE per book.
3. **Safeguarding is prevented synchronously and detected internally and externally** — the two guarantees are distinct.
4. Merchant settlement identity `gross = net_to_merchant + mdr` is verified per capture event and per settlement batch.
5. PSP/EMI plugins cannot call TigerBeetle; they submit intents.
6. Four-eyes covers merchant onboarding, reserve release, payout approval, high-value wallet creation, breach acknowledgement, and prevention-override.
7. Regulatory evidence is first-class and anchored.
8. SCA evidence is bound to the operation and rechecked at the core write boundary.

---

## 8. SERVICE ECONOMICS

Unchanged in substance: plugins declare `FeeSchema`; the core resolves hierarchical fee/commission/tax rules and emits the corresponding lines in the `PostingGroup`; fee changes are four-eyes and versioned. Commission splits use `ANCESTOR:<share_pct>` resolvers.

---

## 9. SECURITY & COMPLIANCE: FAPI 2.0

### 9.1 Baseline Controls

`private_key_jwt` or `mTLS`; DPoP or mTLS-bound tokens; PKCE; **PAR (Pushed Authorization Requests)** for authorization-code flows; PS256/ES256 only; TLS 1.2+ with approved ciphers, HSTS, DNSSEC recommended; RAR for transaction-type and amount-ceiling scoping.

### 9.2 Role Split (New)

- **Federated IdP**: authenticates users and supplies attributes. It does not issue platform tokens or make authorization decisions.
- **FSP Authorization Server (FAPI 2.0)**: issues platform access tokens after federated authentication, applies core-approved claim mappings, enforces RAR scoping bounded to the caller's subtree, and enforces sender-constraint.
- **Gateway**: enforces token validation, DPoP binding, route-level authorization, rate limits, and request budgets; logs raw provider callbacks before dispatch.
- **Resource server (core/plugin routes)**: enforces object-level authorization at the write boundary (§3.7.6, §5.9).

### 9.3 Route Inventory (New)

The platform maintains an explicit route inventory covering public protocol endpoints (discovery, JWKS, token, PAR, authorization), provider callbacks (webhooks), and financial routes. Each route records its authentication requirement (public, mTLS, bearer + DPoP, signed webhook), its authorization scope, and its rate-limit class. Financial routes become eligible only after the activation readiness gate (§6.6).

### 9.4 Denial-of-Service Resilience (New)

Measurable requirements for rate limits per client, request budgets per tenant and per route class, overload behavior (shed vs. queue vs. reject with `429`), and isolation between tenants. Provider callback endpoints have their own budgets so that a misbehaving provider cannot starve financial traffic. All limits are configurable per tenant and audited.

### 9.5 Data Protection

As v1: tenant-specific keys, field-level encryption for audit payloads, TLS everywhere.

---

## 10. FOUR-EYES (MAKER-CHECKER)

Four-eyes is a core enforcement layer. Operation classes requiring four-eyes: transactions above threshold; org activation/deactivation; role and grant changes; plugin activation/deactivation/installation/credential rotation; fee/commission/tax changes; IdP changes; bulk audit/transaction exports; GL account create/close/suspend/reparent; JE approval; period close/reopen; ledger topology migration; PSP merchant onboarding, reserve release, payout approval, wallet creation, safeguarding breach acknowledgement; child onboarding and reparenting; inter-org transfer initiation.

**Mechanics**: maker submits `ApprovalRequest` with canonical payload hash; `PENDING_CHECKER`; **maker cannot approve (enforced at `person_id`, §3.7.5)**; checker sees diff; approval executes atomically and writes two audit records linked by `correlation_id`; rejection discards the operation and records rationale. All requests and decisions are immutable and queryable by compliance.

**Interaction with the posting fence (§5.9)**: approval does not guarantee execution. Execution revalidates at the write boundary; if the posting epoch advanced or the delegation chain changed, execution may be rejected and the approval must be re-obtained.

---

## 11. AUDIT & EVIDENCE

- **Authoritative evidence at core-controlled boundaries**: intent acceptance, approval resolution, plan persistence, submission, commit confirmation, finalization; and at gateway level for provider-initiated calls.
- **Tamper-evident chain** per tenant per day; `prev_hash`/`record_hash`; signed checkpoints; **external anchoring** of signed checkpoints outside the mutable operational store at a policy cadence.
- **Query surface**: compliance roles query by actor, checker, tenant, book, resource, time range, correlation ID. Plugins receive `AuditReceipt` tokens only.
- **Retention**: per jurisdiction; WORM cold tier.
- **Subtree checkpoints**: chain-of-chains; parents hold children's roots.
- **Cross-node operations** produce mirrored, independently hashed records.
- **No plugin-written audit**: plugins cannot forge or omit; the core records the money-movement and approval facts the platform actually observed.

---

## 12. MULTI-TENANCY MODEL

- **Data isolation**: `tenant_id` (and `book_id`) with RLS at the database layer, not just application code.
- **Plugin isolation**: `tenant_plugins` + middleware check; plugin-owned tables carry `installation_id` and `tenant_id` with RLS; **per-installation secret scope**.
- **TigerBeetle isolation**: account IDs encode book scope; cross-book transfers structurally impossible without a `PostingGroup`.
- **Configuration isolation**: fee schemas, IdP settings, approval thresholds, CoA templates, posting rules, **permission ceilings and delegation graphs** are tenant-scoped and validated against core schemas.
- **Hierarchy isolation**: subtree-only visibility; ancestor visibility bounded by inheritance grants and `EDGE` scope.
- **Accounting-boundary isolation**: a book's accounts and JEs are single-currency and single-legal-entity; cross-book flows require a `PostingGroup`.

---

## 13. EVENT-DRIVEN INTEGRATION (Revised)

**Canonical event contract**: every event has a name (versioned), schema, `tenant_id`, `book_id` (where applicable), `correlation_id`, `causation_id`, `sequence` (per aggregate), and idempotency key. Replay rules are defined per event class; consumers must be idempotent. Sequence gaps are detectable and are a reconciliation signal.

**Core events** (representative): `Organization.Onboarded`, `Organization.ChildOnboarded`, `Organization.Activated/Deactivated/Reparented`; `Grant.Delegated`, `Grant.Revoked`; `Service.Enabled/Disabled`; `PluginInstallation.Created/Inherited/Revoked/CredentialsRotated`; `Approval.Requested/Granted/Rejected`; `JournalEntry.Drafted/Submitted/Posted/Rejected/Reversed`; `PostingGroup.Committed/Finalized/CommitUnknown`; `Period.Closed/Reopened`; `TrialBalance.ImbalanceDetected` (P1); `GL_ACCOUNT_CREATED/CLOSED/SUSPENDED`; `InterOrgTransfer.Requested/Approved/Posted/Failed`; `PSP.*` and `EMI.*` as in v1 plus `EMI.SafeguardingBreach` (detection) and `EMI.IssuanceBlocked` (prevention).

**CDC correlation**: the TigerBeetle CDC bridge streams raw ledger events; a correlation layer maps each raw transfer to its `JournalEntry`/`PostingGroup` and `correlation_id`. Reconciliation asserts that every posted JE has a matching CDC record and vice versa. The bus is not a system of record; TigerBeetle and OLGP are.

**At-least-once delivery** with idempotency keys; plugins must implement idempotent handlers.

---

## 14. NON-FUNCTIONAL REQUIREMENTS (Updated)

| Dimension | Requirement |
|---|---|
| Transaction latency | p99 < 50 ms API ingress → TigerBeetle commit (excluding external rails). **Separately measured: time to ledger commit; time to durable client acknowledgement (§5.7).** |
| Ledger durability | RF=3; zero data loss on single-node failure. |
| Audit durability | Synchronous write to ≥2 AZs before ack; **external checkpoint anchoring** at policy cadence. |
| Plugin activation latency | < 2 s to propagate permissions/routes after readiness gate passes. |
| FAPI compliance | Annual third-party conformance; PAR included; route inventory reviewed. |
| Four-eyes bypass | Zero tolerance; automated tests assert no path executes a sensitive operation for a single `person_id`. |
| Trial balance integrity | `Σ debits == Σ credits` per book; violation halts official reporting for that book. |
| Transit clearing | Zero after each batch per designated transit account; FX liquidity excluded. |
| Safeguarding prevention | Synchronous issuance check never admits a JE that violates coverage; detection emits P1 on post-commit breach. |
| Recovery | Uncertain commits resolve to exactly one economic outcome; property tests cover crash-after-commit and crash-before-commit. |
| DoS resilience | Per-client rate limits, per-tenant request budgets, defined overload behavior, provider-callback isolation. |

---

## 15. CONSOLIDATED INVARIANTS (v2)

### Tenancy, authority, hierarchy
1. Hierarchy membership and depth are core-validated.
2. **A principal's effective grant is covered by active delegation on every edge from root; local roles alone never confer authority.** Revoking an ancestor delegation invalidates downstream grants; reparenting recomputes inherited authority.
3. **Use and delegate are separate rights.** A principal cannot delegate a permission they do not hold within their ceiling.
4. **Maker-checker separation is enforced at `person_id`**, not credential. First-admin bootstrap is parent- or platform-assisted; no single-person activation path exists.
5. No sibling-to-sibling money movement; intercompany flows use `PostingGroup`s with per-book balanced entries.

### Accounting boundaries and ledger
6. **Tenant, legal entity, accounting book, and TigerBeetle ledger are independent.** A book is single-currency, single-legal-entity, mapped to exactly one TB ledger.
7. Every leaf GL account is a TB account; header accounts never receive postings.
8. Account IDs are deterministic: `UUIDv5(namespace, book_id + ":" + gl_account_id)`.
9. **Normal balance is presentation only; enforced bounds are per-account by purpose.** Blanket type-to-flag mapping is not used.
10. **Closure requires zero posted balance, resolved pending obligations, an admission fence, and a terminally resolved closing transfer.**
11. **Transit clearing nets to zero; FX liquidity accounts carry inventory and are excluded.**
12. TigerBeetle IDs are never reused; closed accounts remain queryable.

### Journal and posting
13. **No money moves without a balanced JE per book and currency.**
14. **Decomposition uses direct debit-to-credit matching**; per-account gross debit and credit turnover equal the JE's lines. Star decomposition is removed. Same-account-both-sides is rejected.
15. **Every JE is atomic** (one linked chain, within the validated batch limit) **and idempotent** (deterministic IDs from `entry_id` + leg index).
16. **Posted JEs are immutable**; corrections are reversal + new entry; `reversal_of_entry_id` is reserved for true reversals.
17. **Periods close, never rewrite**; hard-closed periods reject postings.
18. **Trial balance balances per book**; a violation halts official reporting.
19. **Uncertain commits resolve to exactly one economic outcome**; no fresh IDs while the original outcome is uncertain.
20. **As-of reports use a reproducible cutoff** distinguishing ledger commit time from accounting posting date, and reconcile journal-derived turnover to TigerBeetle.

### Posting fence
21. **Every policy that can affect a posting is versioned**; the write boundary revalidates at a posting epoch; close/freeze/suspend/revoke fence new admissions, drain in-flight, and record an effective point. Revocation cannot authorize a posting admitted after the fence.

### Plugins
22. Plugins cannot call TigerBeetle, hold `ledger.write`, or construct JEs; they submit intents.
23. Every installation is bound to one tenant; **each installation has its own secret scope**; shared credentials are explicit brokered capabilities.
24. **Financial routes become eligible only after accounts, rules, permissions, and dependencies are ready** (§6.6).

### PSP / EMI
25. No PSP/EMI logic in core; balanced JEs per movement; two-phase auth maps to JE `PENDING`; captures post; chargebacks are new linked adjustments; true reversals use `reversal_of_entry_id`.
26. **Merchant settlement identity is verified per event and per batch**, not inferred from trial balance.
27. **Safeguarding prevention is synchronous and pre-submission; detection is internal + external reconciliation.** A post-commit breach is a P1 that blocks further issuance via the prevention control.
28. SCA evidence is bound to the operation and rechecked at the core write boundary; TRA exemption is a distinct auditable decision from general monitoring.

---

## 16. EXPLICIT NON-GOALS & CONSTRAINTS

- The core will not contain KYC logic, document parsing, bank-specific connectors, notification templates, inventory models, PSP acquiring logic, or EMI issuance logic.
- No general-purpose plugin marketplace with third-party execution in v1.
- Plugins cannot call TigerBeetle, create/close GL accounts, construct JEs, close periods, or modify TB flags.
- External IdP integration does not permit authorization rules outside the core RBAC matrix; claim mappings are four-eyes-controlled.
- The platform does not claim to hold external funds; custodians, banks, and acquirers do. TigerBeetle records booked positions and internal movements; reconciliation against external records is required for regulatory evidence.

---

## 17. DELIVERABLES (Updated)

**Core**
1. Six bounded contexts with the v2 data models (books, `PostingGroup`, posting state machine, delegation graph, posting epoch).
2. `GLAccountService` with the §4.5 provisioning recovery workflow.
3. `JournalEntryService` with **direct debit-to-credit matching** (§5.4), `PostingGroup` construction (§5.6), and the uncertain-commit recovery state machine (§5.7).
4. Posting Rule Engine (versioned DSL, resolution order, four-eyes).
5. `PeriodService` with posting fence and drain (§5.9).
6. `TrialBalanceService` and `FinancialStatementsService` with as-of cutoff and journal-vs-ledger reconciliation (§5.10).
7. `InterOrgTransferService` building `PostingGroup`s with intercompany due-to/due-from.
8. RBAC with delegation graph, permission ceilings, use-vs-delegate, identity binding, descendant invalidation, reparent recomputation (§3.7).
9. Audit with core-boundary evidence, canonical events, external checkpoint anchoring (§11).
10. FAPI gateway with PAR, role split, route inventory, DoS controls (§9).

**Libraries / tooling**
11. Direct-matching decomposition library with **property tests for gross debits, gross credits, net effect, deterministic IDs, bounded accounts, and rollback on a rejected leg**.
12. Uncertain-commit recovery harness (crash-after-commit, crash-before-commit, lost-response).
13. Subtree Merkle verification CLI with external anchor verification.
14. Collision-checked ledger-ID registry for per-book topology.

**Reference plugins**
15. Reconciliation plugin asserting: per-book trial balance; transit clearing net-zero; no header postings; FX liquidity excluded; every JE has a matching CDC record; PSP settlement identity per capture and per batch.
16. PSP family with corrected templates and worked flows (§7.5).
17. EMI family with **separated prevention and detection** (§7.7).
18. KYC (inherited-verification mode), Bank Connector, Notification, ERP Connector (multi-instance, per-installation secrets), Inventory, FX.

**Operational**
19. Runbooks: TB cluster recovery; four-eyes break-glass; audit chain verification; tenant deactivation with drain; ledger topology migration; safeguarding breach response; **uncertain-commit recovery**.
20. ADRs: why JE is core; **why direct matching replaced star (with the gross-turnover proof)**; why books are separate from tenants; **`PostingGroup` rationale and intercompany model**; **posting state machine and recovery proof**; **delegation-graph invariant proof**; per-account bounds rationale; closure procedure; period fence and drain semantics; safeguarding prevention-vs-detection separation; SCA/TRA boundary; external anchoring.
21. API surface per v1 plus `POST /posting-groups`, `GET /posting-groups/{id}` (status incl. `COMMIT_UNKNOWN`), `GET /reports/trial-balance?bookId=&asOfCutoff=`.

---

## 18. FIRST IMPLEMENTATION MILESTONE

Build one end-to-end slice around **a parent and a child, one currency, one shared TigerBeetle ledger, two accounting books, and one plugin**. Exercise: delegated onboarding; account provisioning with recovery; grant, delegation, and revocation; an approved inter-org `PostingGroup`; an **uncertain commit resolved to one outcome**; a reversal; a period close racing an in-flight posting; and a reproducible as-of trial balance.

**Acceptance checks (must pass before PSP, EMI, FX, or ledger migration build on this slice):**

1. **Accounting** — each book balances independently; **gross account turnover matches the JE** (direct matching); transit clearing returns to zero; FX liquidity (if present) is not asserted to zero.
2. **Recovery** — a crash after TigerBeetle commit produces exactly one economic posting and one finalized journal outcome after recovery; a crash before commit produces zero economic postings and a clean `REJECTED` or a single retried commit.
3. **Authority** — a child cannot grant beyond the root delegation chain; a revoked permission cannot authorize a newly admitted posting; a reparented subtree recomputes inherited authority before resuming sensitive operations; maker-checker at the same `person_id` is rejected.
4. **Close and evidence** — a racing period close has a deterministic outcome (drain-then-close) recorded with its effective epoch; an auditor can trace the maker's request, the checker's approval, the persisted plan, and the exact ledger transfers, with the signed checkpoint anchored outside the operational store.

Only after these checks pass does the platform extend to PSP, EMI, FX, and per-book ledger topology.
