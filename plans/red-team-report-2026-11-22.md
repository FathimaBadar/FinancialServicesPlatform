# Red-Team Exercise — FSP Fortress Breach Report

**Date:** 2026-11-22 · **Squad:** 7 attacker personas vs the live stack (IdP :8082, BFF :8080, Gateway :8090, Core :8081, PSP :8085, EMI :8086, recon-worker, TigerBeetle, Postgres)

## Executive summary

The **outer shell held completely** — gateway default-deny, RS256+DPoP, CSRF/PAR/session, bounded
pagination, money-string validation, idempotency charset all survived an industrial assault.

The **inner zero-trust hop collapsed in one shot**: a single static, git-tracked internal
credential (`dev-internal-credential`) is a **god-key**. Holding it, the red team impersonated any
person, forged MACHINE actors with unregistered client ids, executed real writes on PSP, created a
real four-eyes journal entry in the ledger, and played BOTH maker and checker. And independently,
a chain-math bug in core RBAC lets any tenant escape into **unrelated tenant trees** — the exact
P0 the platform doctrine forbids.

## Scoreboard

| Wave | Vector | Verdict | Severity |
|---|---|---|---|
| 1 | Perimeter: no-session, CSRF-less POST, forged session cookie, default-deny catalog | **HELD** | — |
| 2 | Forged JWTs (garbage / alg=none), Authorization + X-FSP-* smuggling through BFF proxy | **HELD** | — |
| 3 | Internal credential brute force (6 guesses) | **HELD** | — |
| 3d | **Known credential → full identity forgery (read platform-admin's notifications)** | **BREACH** | **P0** |
| 4 | **Forged MACHINE actor + unregistered client id → accepted recon page** | **BREACH** | **P1** |
| 4c | **God-key → real JE created (four-eyes maker), checker pair accepted (two pens, one hand)** | **BREACH** | **P0** |
| 5b | **God-key → real PSP settlement sweep executed as forged user** | **BREACH** | **P0** |
| 6 | Money tampering: negative / zero / NUMERIC(20,0) overflow amounts | **HELD** | — |
| 7 | Pagination bomb (`size=100000`→100), sort injection (`sort=1;DROP…`→400), idempotency charset | **HELD** | — |
| 7c | Alarm flood: 3 arbitrary-machine recon pages accepted (200 ×3) | **BREACH** | **P1** |
| 8d | **Cross-TENANT-TREE escape: psp-admin journaled entries of unrelated tenant 2712b509** | **BREACH** | **P0** |

## The two P0 root causes

### 1. The god-key (internal hop is bearer-secret-only)

- `dev-internal-credential` is a single static shared secret in git-tracked `application.yml`s and
  module sources — any reader of the repo (or one leaked config) owns it.
- Core/PSP/EMI build the ENTIRE `Actor` from client-supplied `X-FSP-*` headers once the secret is
  presented: identity, tenant, username, actor type, client id — all forgeable at will
  (verified: `unread=2 RECON_VIOLATION` for forged person 201, `0` for b1).
- No per-service credentials, no rotation, no mTLS, no anomaly detection, no rate limiting
  (6 attempts fired with zero throttle/punitive response).
- Machine-plane ops accept ANY `X-FSP-Client-Id` (no allowlist/registration check).

### 2. Chain-math tenant escape (`PermissionService.chainFor`)

`PermissionService.chainFor()` builds the target tenant's ancestor chain **then adds
`actor.activeTenantId()`**:

```java
chain.add(actor.activeTenantId());   // ← the escape hatch
...
if (role == null || !chain.contains(role.tenantId)) continue;
```

Because the actor's **own** tenant is injected into the chain, a role held at tenant X passes the
`chain.contains(role.tenantId)` test for ANY target tenant Y — even a totally unrelated tree.
Verified: PSP_ADMIN (tree a1) read tenant `2712b509-…`'s ledger (different root). The actor's
tenant should never qualify as an "ancestor of the target" — target-tree membership must be proven
from the platform root only.

## What held (give the defenders their credit)

- **Gateway:** route default-deny (`ROUTE_NOT_IN_CATALOG`) on every unpublished path; RS256
  signature + DPoP proof mandatory; `/internal/**` unreachable through the gateway (404 not 200).
- **BFF:** `HttpOnly` session cookie; CSRF double-submit (403 without token); PAR flow state-bound
  (`state_mismatch` on replay); **client-supplied `Authorization`, `X-FSP-*`, internal credential
  headers all stripped before trusted re-issue** — smuggling produced zero effect.
- **RBAC plane:** permission denial surfaced for `tenant.act_as` from PSP_ADMIN (403).
- **Money representation:** negative, zero and 36-digit overflow amounts rejected at the door
  (`JE_AMOUNT` / positive-minor-unit-string rule); `NUMERIC(20,0)` wire-string contract enforced.
- **REST collection standard:** `size=100000` clamped server-side; sort/search parameter injection
  rejected 400.
- **Idempotency:** charset `[A-Za-z0-9._-]` enforced (colons/spaces → 400); 5xx deletes the PENDING
  row (retry-clean).
- **Append-only audit:** even breached hops record decisions (`JE_APPROVAL_RESOLVED` rows observed).

## Remediation plan (prioritized)

1. **P0 — Kill the god-key.** Per-service credentials (secret per caller, git-ignored env only),
   rotation support, mTLS or signed-internal-JWT on the internal hop, machine-client allowlists
   (`recon.page` must accept only `recon-worker`), rate-limit + lockout on credential failures.
2. **P0 — Fix chainFor:** remove `chain.add(actor.activeTenantId())`; permission reachability must
   be computed ONLY from the target tenant's `hierarchy_path` (plus act-as home-tenant
   ceilings). Add a regression test asserting a role at tenant X cannot touch tenant Y of an
   unrelated root.
3. **P1 — Recon paging hardening:** bound `recon.page` recipients, per-invariant rate ceiling,
   reject unregistered machine clients, and consider requiring the page body to echo a
   worker-specific nonce.
4. **P2 — BFF Origin check** (defense-in-depth on top of CSRF), and rate-limiting at the BFF.
5. **P2 — Demo hygiene:** demo passwords (`demo1234`) and the dev internal credential live in git;
   document loudly + gate demo profile-only (already partially done), and never reuse in staging.

## Exercise hygiene

All red-team artifacts were cleaned: forged JEs, REDTEAM/FLOOD notifications, outbox events,
idempotency rows, and the PSP sweep batch. Logs: `/tmp/{core,psp,emi,gw,bff,idp}-red.log`.
