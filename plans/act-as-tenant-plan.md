# Plan: Act-as Tenant ("sudo into a tenant")

**Status:** PROPOSED · **Owner:** platform engineering
**Binding sources:** `AGENTS.md` §2b–§2e, §3, §4b, §6 · `plans/plugin-platform-plan.md` §12 · pi skill `fapi2-compliance`

> A platform admin or admin-checker who holds `tenant.act_as:execute` can step into any tenant
> **below their own** and work as that tenant: onboard its KYC, add users, give roles, onboard
> child organizations. Like `sudo` on Linux: the power is granted on purpose, bounded, and every
> action still names the real person.

---

## 1. Example

Ravi (`platform-admin`) holds `tenant.act_as:execute` at the platform root.

1. **Onboard Namib Foods** (PSP → tenant) — Namib Foods, its admin and checker are created.
2. **Act as Namib Foods** — banner reads *"Ravi (Platform) acting as Platform › PSP › Namib Foods — Exit"*.
3. Acting as Namib Foods, Ravi adds users, assigns roles from Namib Foods' ceiling, and onboards
   *Oshana Distributors* under Namib Foods.
4. From there he may act as Oshana in turn (banner shows *Platform › PSP › Namib Foods › Oshana*).
5. **Exit** returns to the platform portal. Audit shows every action as *ravi acting as …*.

---

## 2. Capabilities

| # | Capability | Description |
|---|---|---|
| C1 | **Start act-as session** | `POST /v1/act-as {tenantId}` — person with `tenant.act_as` at home org acts as a tenant strictly below their home |
| C2 | **View current session** | `GET /v1/act-as` — returns live session: org, type, path home›…›target, expiry (or 204) |
| C3 | **Exit act-as** | `DELETE /v1/act-as` — end the live session, return to home org |
| C4 | **Permission ceiling cap** | While acting, permissions = (home ∪ target grants) ∩ target ceiling — no privilege escalation |
| C5 | **Session lifecycle** | 30 min idle, 8 hours max, one live session per person, new session ends previous |
| C6 | **Audit never hides the real person** | `actor_id` = signed-in user; `acting_tenant_id` + `act_session_id` recorded on every audit row while acting |
| C7 | **Maker-checker binds to real person** | A person cannot submit as tenant A and approve as platform (four-eyes on real person IDs) |
| C8 | **RBAC-enforced start** | Act-as requires `rbac.mode=enforce` (refused otherwise with `ACT_AS_NEEDS_RBAC`) |

---

## 3. Design

### 3.1 Database migration (V14)

`act_as_sessions(id, person_id, home_tenant_id, target_tenant_id, started_at, last_seen_at,
expires_at, ended_at, end_reason)` — one live session per person.

`audit_log` gains `acting_tenant_id` and `act_session_id` columns.

Permission `tenant.act_as` (risk FOUR_EYES) granted to PLATFORM_ADMIN at platform root.

### 3.2 Endpoints (all under `/v1/act-as`, person-only)

| Endpoint | Method | Cell | Body | What |
|---|---|---|---|---|
| `/v1/act-as` | POST | `tenant.act_as` (home) | `{tenantId}` | Start session |
| `/v1/act-as` | GET | session | — | Current session view |
| `/v1/act-as` | DELETE | session | — | Exit session |

Start is refused unless:
- RBAC enforces (`ACT_AS_NEEDS_RBAC`)
- Person holds `tenant.act_as` at their **home** tenant (never borrowed from an acted-as org)
- Target is strictly below home (checked via `hierarchy_path` / closure)
- Target is not SUSPENDED/DEACTIVATED

### 3.3 Every request while acting

Browser/BFF sends `X-Act-As: <sessionId>`. `ActAsFilter` runs after `ActorContextFilter`:

1. Loads session; must belong to the **authenticated** user, be live, not idle > 30 min
   (else **401 `ACT_AS_EXPIRED`** — never silently falls back to home org)
2. Touches `last_seen_at` (max once per minute)
3. Replaces the principal with the **acting principal**: same `personId`, name; `activeTenantId` =
   target tenant; `type` = DELEGATED; `homeTenantId` tracked separately

The `PermissionService.effectiveKeysForActing()` caps permissions by the target tenant's ceiling.

### 3.4 Permission decision while acting

```
holds = effectiveKeys(actor at target) ∪ effectiveKeys(actor at home)
ceiling = permissions of roles directly at target tenant
result = holds ∩ ceiling
```

Platform-wide assignments cover the target; org-scoped assignments count at their own org.
The ceiling prevents privilege escalation: acting can only narrow what you may do.

### 3.5 Audit

`AuditRecord` gains `actingTenantId` and `actSessionId`. `actorId` is always the real user.
`AuditService.record()` fills them from the `ActorContext`. Start and exit are audited
(`ACT_AS_START`, `ACT_AS_END`).

### 3.6 Actor changes

`Actor` already has `type` (PERSON/MACHINE/DELEGATED). While acting:
- `personId` = real person
- `activeTenantId` = target tenant
- `type` = DELEGATED
- `clientId` = null
- `homeTenantId` carried in `RequestCorrelation` (thread-local)

---

## 4. Build order

| Step | Work |
|---|---|
| AA1 | Plan (this doc) + sign-off |
| AA2 | `V14__act_as_sessions.sql` migration + `ActAsSession` entity + `ActAsRepository` |
| AA3 | `ActAsService` (start/end/current/live with TTL + idle) |
| AA4 | `ActAsController` (POST/GET/DELETE `/v1/act-as`) |
| AA5 | `ActAsFilter` (X-Act-As header, replaces principal) + `CoreConfig` registration | ✅ gateway strip list excludes `X-Act-As` (validated person-anchored in core, fails closed) |
| AA6 | `PermissionService.effectiveKeysForActing()` (ceiling cap) |
| AA7 | `AuditRecord` + `AuditService` acting columns + `RequestCorrelation.homeTenantId` |
| AA8 | Permission `tenant.act_as` seeded to PLATFORM_ADMIN (system seed or new migration) | ✅ V14 explicit grant to PLATFORM_ADMIN — covers BOTH `platform-admin` and `admin-checker` (both hold that role in V2; V2's blanket grant predates the key) |
| AA9 | Unit tests: start/exit, outside-subtree refused, expiry, ceiling cap, audit row, nested act-as | ✅ `ActAsServiceTest` (7) + `PermissionServiceActingCeilingTest` (5) |
| AA10 | AGENTS.md updates (§6 RBAC contract, §5c FAPI2 ledger) | ✅ §6.7 act-as contract, §5c §7 audit-evidence row, §6b layout map |

---

## 5. Decisions needing sign-off

| # | Decision | Proposed default |
|---|---|---|
| D1 | Permission cell `tenant.act_as` (FOUR_EYES), granted to PLATFORM_ADMIN only | Yes |
| D2 | Session TTL: 30 min idle, 8 hours max | Yes |
| D3 | One live session per person; new starts previous | Yes |
| D4 | `X-Act-As` header passthrough through gateway (not stripped) | Yes |
| D5 | Ceiling cap = roles directly at target tenant (no ancestor roles in ceiling) | Yes |
| D6 | Actor `type` = DELEGATED while acting, `homeTenantId` in `RequestCorrelation` | Yes |
| D7 | Act-as needs `rbac.mode=enforce` (refused otherwise) | Yes |

---

## 6. Out of scope (later)

- Frontend banner + `ActAsService` SPA client (widget harness slice)
- Nested act-as depth limit (no hard limit; path shown in session view)
- Business screens while acting (merchant sales, supplier stock — read legacy IDs, stay unavailable)
- Risk tier / step-up at session start
