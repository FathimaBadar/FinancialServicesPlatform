# Federated Identity + Departments — Design Plan

**Status:** PROPOSED — awaiting sign-off (§6 lists the decisions; each defaults are best-practice-backed).
**Date:** 2026-11-18 · **Owner:** platform engineering
**Binding sources:** `AGENTS.md` §4b (IdP seam, per-tenant IdP policy), §2c (logging), §2d (concurrency),
§6 (RBAC stays in core), §7 (evidence tiers) · `plans/plugin-platform-plan.md` (V11/V12 migration ordering,
saga, `tenant.verification` activation) · pi skill `fapi2-compliance` (guide §1 trust boundaries, §7 audit).

This plan settles three requested capabilities and the **best practices** for each open question:

1. **Org activation is verdict-driven** — an org becomes ACTIVE only when its KYC is approved
   (already settled by the plugin plan §7.3; restated here as the baseline, not re-designed).
2. **Departments** — orgs have departments; users belong to departments.
3. **Federated users with role-claim mapping** — a user is identified by the FSP native IdP OR the
   organization's own IdP; the org IdP's role claim is mapped to an internal role so core RBAC
   resolves permissions through the unchanged `PermissionService` path.

> Nothing here amends AGENTS.md yet — AGENTS §4b gets amended as an exit criterion of phase F3,
> same pattern the plugin plan uses for §3.9.

---

## 1. Capability 1 — KYC-gated org activation (baseline, already designed)

Tenant activation is the four-eyes verdict, not a plugin action:

- Plugin plan §7.3: core accepts `VERIFIED` only when an approval `APPROVED` exists with matching
  `payloadHash`, verdict-capable action, target tenant, and `maker ≠ checker`.
- Plugin plan §12.5/§12.6: `TENANT_PENDING` can never activate without the verdict; rejected KYC
  leaves the tenant permanently non-activatable (`verificationStatus = REJECTED`).
- **Best practice carried forward:** activation is always evidence-backed; there is no
  force-activation path (the rev-1 `tenant.activate.force` claim was removed as fictional).

No new work — this section exists so this plan is self-contained.

---

## 2. Capability 2 — Departments

### 2.1 Model decision — org-unit rows, NOT child tenants (default)

| Option | Assessment |
|---|---|
| **B (chosen): `departments` table + `persons.department_id`** | Departments are cost/reporting units; no TigerBeetle book, no KYC, no separate IdP policy. Lighter; one table; no depth change; hierarchy stays platform→PSP→org as settled in Phase-0. |
| A: department = child tenant (depth 3) | Only if a department needs its own books, IdP config, or four-eyes node. Rejected as default; can be added later for a specific tenant by onboarding a child tenant — nothing in this design blocks it. |

### 2.2 Schema (next available migration — F-phase, after plugin V12; never edits V1–V12)

```sql
CREATE TABLE departments (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | ARCHIVED (never hard-delete)
    version     BIGINT       NOT NULL DEFAULT 0,          -- optimistic locking (AGENTS §2d)
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
-- persons gains:  department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL
-- user_roles gains: department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL
--                   provisioned_via VARCHAR(64) NOT NULL DEFAULT 'NATIVE'   -- see §3.2
CREATE INDEX ix_departments_tenant ON departments(tenant_id);
```

### 2.3 Department-scoped RBAC (small, additive rule)

- A role assignment with `department_id = NULL` behaves exactly as today (org-wide within the
  role's tenant scope).
- A role assignment with `department_id != NULL` resolves **only** when the actor's
  `persons.department_id` equals it. The check is added inside
  `PermissionService.effectiveKeys` after the existing chain-scope filter — the reachability
  math (hierarchy chain) is unchanged, the department is an additional AND-filter.
- **Best practice:** department membership (moving a person between departments) is a plain
  `WRITE` (audited, not four-eyes) — it is not a money path. Role grants remain governed as
  today; an entitlement change audit row with before/after hashes (AGENTS §7) is emitted for
  both membership and department-scoped grant changes.

---

## 3. Capability 3 — Federated users with role-claim mapping

### 3.1 Existing scaffolding (already in the codebase — V6)

- `idp_configs (tenant_id, provider FSP_NATIVE|THIRD_PARTY, issuer_url, jwks_uri, audience, …)` —
  the org overrides the native IdP for its subtree.
- `idp_identities (issuer, subject) → person_id` — the federation anchor. Identity is anchored in
  the person graph; four-eyes stays person-based regardless of who authenticated (AGENTS §4b).
- The third-party login path today answers `503 IDP_EXTERNAL_FEDERATION_PENDING` — this plan
  implements the federation client that replaces the stub.

### 3.2 New table — the mapping IS the allow-list

```sql
CREATE TABLE idp_role_mappings (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    issuer          VARCHAR(512) NOT NULL,                 -- must match the idp_configs row
    external_role   VARCHAR(255) NOT NULL,                 -- role claim value the org IdP sends
    internal_role_id UUID NOT NULL REFERENCES roles(id),
    department_id   UUID NULL REFERENCES departments(id),  -- optional department-scoped grant
    granted_by      UUID NOT NULL,                         -- maker (four-eyes)
    approved_by     UUID NULL,                             -- checker (four-eyes) — set on resolve
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_idp_role_map UNIQUE (issuer, external_role, tenant_id)
);
-- idp_configs gains: jit_provision BOOLEAN NOT NULL DEFAULT FALSE
--                    federated_token_ttl_s INTEGER NULL   -- see §3.6

-- user_roles gains provisioned_via (schema in §2.2): 'NATIVE' | 'FEDERATED:<issuer>'
```

**Why the mapping table is the allow-list:** there is no separate "trusted roles" list. A role is
grantable from an issuer **iff** a mapping row exists, and the row carries its own four-eyes
evidence (`granted_by`/`approved_by`). Deny-by-default falls out of the data model.

### 3.3 Login / reconciliation flow

```
1 SPA → BFF: org-IdP login ( federation client validates org IdP JWT: sig vs issuer JWKS,
   iss == registered issuer_url, aud == registered audience, exp/nbf)
2 (issuer, subject) → idp_identities → person_id                        [identity is anchored]
3 roles claim → idp_role_mappings (issuer + tenant scoped) → desired role set
4 RECONCILE (one core transaction, idempotent):
   desired := mapped roles (department scoping attached)
   current := user_roles WHERE person AND provisioned_via = 'FEDERATED:<issuer>'
   diff upsert: insert missing (provisioned_via='FEDERATED:<issuer>'),
                delete no-longer-mapped federated rows   — NATIVE rows are NEVER touched
5 audit entitlement change (before/after role-key hashes, actor=person, issuer)   [AGENTS §7]
6 session established; permissions flow through PermissionService.effectiveKeys UNCHANGED
```

**The non-negotiable rule (AGENTS §4b, unchanged):** the role claim is *advisory input*. It never
reaches the enforcement path directly; core materializes it into `user_roles` and remains the
only policy decision point. The gateway never consults mappings; BFF never evaluates claims.

### 3.4–3.9 The six open questions — best practices (the heart of this plan)

| # | Question | **Best practice (default)** | Enforced by / tested by |
|---|---|---|---|
| **3.4** | **Privilege ceiling** — the org IdP must not be able to mint platform reach | **(a)** Mapping row = allow-list, deny-by-default. **(b) "You can only map roles you possess":** the mapping approver must hold the internal role (or `plugin.manage`/platform admin) — mapping an unpossessed role → `403 ROLE_MAP_FORBIDDEN`. **(c)** A mapping may never grant a role whose tenant scope is ABOVE the `idp_configs` tenant (scope ≤ issuer's tenant subtree). Mapping changes are four-eyes (maker/checker columns on the row). | Service precondition + unit test; migration check constraint not possible (needs person graph → service-level, WARN-logged) |
| **3.5** | **Reconciliation timing** — role changed at the org IdP | **Reconcile-on-login** (§3.3 step 4), transactional with session establishment; demotion effective at the next token boundary (bounded by token TTL). SCIM push = later additive slice (same shape as webhook events). `provisioned_via` makes the diff safe: reconcile deletes ONLY federated rows; native admin-granted roles survive any IdP change. | Integration test: IdP drops role → next login loses permission → native role untouched; audit row has before/after hashes |
| **3.6** | **Person token TTL for federated logins** — offboarding staleness | **Bounded TTL instead of a blacklist** (I7): federated person tokens get `federated_token_ttl_s` (default **900 s / 15 min**, cap 3600) set in `idp_configs`; core honours it at session/token mint. Offboarding at the org IdP propagates within ≤ TTL + reconcile-at-login. `user deactivate` (four-eyes, exists today) remains the manual backstop; `PermissionService` already zeroes non-ACTIVE persons. Revocation latency is documented, not zero — same DB-truth philosophy as §I7. | Token TTL test; deactivate test; no token blacklist introduced |
| **3.7** | **JIT person provisioning** — first login, unknown identity | **Opt-in per tenant** (`idp_configs.jit_provision`, default **FALSE**): off → unknown `(issuer,subject)` → `403 IDP_EXTERNAL_NO_IDENTITY` (the org must invite/create the user first — admin creates user with `issuer`+`subject` instead of a password, reusing today's four-eyes user creation). On → auto-create `person` (UsernamePolicy; status ACTIVE; **zero roles**) + `idp_identities` row, tenant = the `idp_configs` tenant, audit `person.created_via_federation`. JIT persons deny-by-default until mapped roles arrive. PII from claims: name/email length+charset validated, no national IDs accepted from tokens. | Both branches tested; UsernamePolicy collision test (-2,-3 fallback); WARN log `federated_login_no_identity` |
| **3.8** | **No / unmapped role claim** | **Login succeeds, zero permissions** (effectiveKeys already returns `Set.of()` for unassigned persons). Never an implicit default role — a default is itself a grant and must be explicit: if the org wants "everyone = Viewer", they create a mapping for the claim value their IdP actually sends. DEBUG log `federated_login_unmapped_role issuer=… roles=<count>` (no claim values logged in full). Multi-role claims → union of mapped roles; conflicts resolve by the normal chain+department math. | Test: token with unknown role → authenticated, `PERMISSION_DENIED` with specific permission on each action; UI shows ui-std denied surface |
| **3.9** | **Federated person as four-eyes maker/checker** | **Allowed — the anchor is the person graph, not the credential source.** The four-eyes guarantee (`maker ≠ checker` at `person_id`) is credential-agnostic. Governance: tenant policy flag `allow_federated_four_eyes` (default **TRUE**, settable per tenant via `idp.manage`); approval audit rows carry the identity channel (`maker_channel = NATIVE \| FEDERATED:<issuer>`) so platform admins can filter/inspect mixed-origin approvals later. No hidden restriction that would quietly break org workflows. | `resolve()` unchanged; audit channel assertion test; policy-flag-off branch → `403 FEDERATED_FOUR_EYES_DISABLED` on resolve/open by federated actor |

### 3.10 Federation client mechanics (IdP seam)

- The **IdP service** (`:8082`) gains the federation endpoint the BFF already calls: it accepts an
  org-IdP authentication result, validates it against the tenant's `idp_configs` (issuer JWKS
  fetch with cache ≤ 10 min + forced refresh on signature failure), and performs steps 2–5 (§3.3)
  by calling core's internal hop (`/internal/identity/federated-resolve`). Core owns person and
  RBAC tables; IdP owns verification and token issuance. Same internal-credential discipline as
  today.
- **Trusted claims:** `iss`, `sub`, `aud`, `exp`, `nbf` are security claims; `roles` is the
  mapping input; `name`, `email` are informational PII (validated, maskable, never logged in
  full). Any other claim is ignored — unknown claims never widen authority.
- Org IdP outage → `503 IDP_EXTERNAL_UNAVAILABLE` (mandatory-dependency semantics, AGENTS §5b);
  no fallback to native login unless `idp_configs.provider` is flipped back by the tenant admin
  (four-eyes) — silently mixing providers during an outage would be a security downgrade.

---

## 4. Widget / UI impact (thin)

- **Users widget** (`users.organization`): add a Department column + department filter; person
  add/edit forms gain a department select (org-scoped); department list archived-status handling.
- **Federation admin (org admins, `idp.manage`):** mapping list/create/remove (four-eyes), IdP
  policy form (`issuer_url`, `audience`, `jwks_uri`, TTL, JIT flag, four-eyes flag) with a
  connection-test button (fetch JWKS, report).
- Person detail shows `Logins via: FSP native | <org issuer>` (from `idp_identities`) — helps
  support answer "why has this user no roles".
- All per `ui-std.md`: tokens, PostingStatePill not applicable, permission-denied surfaces show
  the specific permission, forms Zod-per-endpoint, blur/submit validation.

## 5. Phases & exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **F1 Schema + admin** | departments, `persons.department_id`, `user_roles.department_id/provisioned_via`, `idp_role_mappings`, `idp_configs` flags; mapping/admin APIs (four-eyes); department CRUD | Role-scoping unit tests (dept filter, chain math unchanged); mapping allow-list + possession tests; entitlement audit rows |
| **F2 Federation client** | IdP-side validation + `/internal/identity/federated-resolve`; `503` stub replaced | Signed/wrong-iss/wrong-aud/expired org token → 401; outage → 503; `(issuer,subject)` → person resolution |
| **F3 Reconcile + TTL** | Login reconciliation, `federated_token_ttl_s` honoured, audit channels | Demotion-at-next-login test; NATIVE-roles-untouched test; TTL staleness test; **AGENTS §4b amended** (federation now implemented) |
| **F4 JIT provisioning** | Opt-in auto-create, UsernamePolicy collisions | Off-by-default 403 test; on-by-default create+audit test; unmapped-claim zero-permission test |
| **F5 Widgets** | Users widget departments; federation admin mapping UI | Workbench fixtures; four-eyes mapping flow E2E (maker → checker approve → mapping active) |

Cross-cutting: log-scan (no role claim values, no tokens — I9); concurrency (reconcile idempotent
under double login — optimistic `@Version` on `user_roles` upsert path, AGENTS §2d); all
migrations are new (V13+), never edit settled ones.

## 6. Decisions that need sign-off

| # | Decision | Default | Rationale |
|---|---|---|---|
| FD1 | Departments = org-unit table (option B), not child tenants | **B** | Lightweight; department books/KYC/IdP remain possible later via child tenants |
| FD2 | Department membership = WRITE (audited), not four-eyes | **WRITE** | Not a money path; role grants stay governed as today |
| FD3 | Mapping row = allow-list; approver-must-possess-role; scope-ceiling ≤ issuer tenant | **Yes (service-enforced)** | Deny-by-default + no escalation via mapping (§3.4) |
| FD4 | Reconcile-on-login with `provisioned_via` isolation of NATIVE grants | **Yes** | Deterministic, idempotent, no SCIM infra yet (§3.5) |
| FD5 | Federated token TTL 900 s default (≤ 3600), no blacklist | **Yes** | Bounded staleness replaces blacklist (I7) (§3.6) |
| FD6 | JIT provisioning opt-in per tenant, default OFF | **OFF** | Org explicit consent to populate the person graph (§3.7) |
| FD7 | Unmapped role → login OK, zero permissions; defaults must be explicit mappings | **Yes** | No implicit grants (§3.8) |
| FD8 | Federated four-eyes allowed, tenant flag default TRUE, channel in audit | **TRUE** | Person-graph anchoring; inspectable, not restricted (§3.9) |
| FD9 | Federation validation lives in IdP; person/RBAC reconcile lives in core; internal hop between | **Yes** | AGENTS §4b seam: IdP = who you are; core = policy decision point |
