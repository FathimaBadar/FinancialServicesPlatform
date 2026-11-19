# Runbook — "UI metadata tampered — this portal will not load"

Works the same on **Linux, macOS and Windows**. Every step is a `bun run …` command from
`frontend/`. You don't need `make`, bash, openssl or python, and no step changes per OS.

> **Before you fix anything:** this screen is a security control. It means the browser could not
> verify the portal layout's ES256 signature against the key pinned into the SPA. On a **dev
> machine** the cause is almost always key drift (below). On a **shared, staging or production
> environment**, do **not** re-sign. Capture the *Evidence id* from the card and escalate.
> Re-signing would hide real tampering.

---

## 1. How the check works (30 seconds)

```
infrastructure/pki/dev/ui-builder-signing.pem      core SIGNS portal bundles with this (loaded at core startup)
infrastructure/pki/dev/ui-builder-signing-pub.pem  its public half
frontend/src/portals/signed/trust-store.json       the SPA VERIFIES against this pinned public key (kid ui-builder-dev-1)
Postgres (core schema)                             the published bundle + its stored signature
```

The portal renders only when all three agree: the stored bundle was signed by the key core
holds, and that key's public half is the one pinned in `trust-store.json`.

## 2. Why it happens on dev machines

| Cause | Typical trigger | Card reason |
|---|---|---|
| **A. Stored bundle signed by an older key** | `make pki` / `dev-windows.ps1 pki` was re-run (it regenerates keys if they are missing), or the DB came from another machine | *Signature does not validate* |
| **B. SPA pins someone else's key** | `trust-store.json` is a **tracked** file. You pulled a teammate's pin, or never ran the pki step after cloning | *Signature does not validate* |
| **C. No bundle published yet** | Fresh database | *No signed layout has been published for this portal* |
| **D. Core still holds the old key** | Keys regenerated while core was running (core reads them only at startup) | *Signature does not validate* (persists after re-signing) |

## 3. Fix (all OSes)

Prerequisites: the full stack is up (Postgres, TigerBeetle, IdP, core, gateway, BFF, Vite on
`:5173`). See `docs/README-dev.md` (Linux/macOS) or `docs/windows-dev.md` (Windows).

```bash
cd frontend

# 1. Diagnose. Tells you whether the SPA pin matches this machine's signing key.
bun run portal:check

# 2. Only if step 1 reported a DIFFERENT key (cause B): re-pin the SPA to your key.
bun run portal:pin

# 3. If the pki step ran since core started (cause D): restart core now.

# 4. Re-sign the portal's bundle with your key (causes A/B/D). Runs the real four-eyes
#    publish flow: platform-admin submits, admin-checker approves, core signs.
bun run portal:republish                      # admin portal (default)
bun run portal:republish --portal=merchant    # any other builder portal key

#    Fresh DB with no bundle yet (cause C): `bun run portal:publish` (skips portals already published).
```

5. Reload `http://localhost:5173/admin` and sign in again. The console should render.

If `portal:check` reports **missing keys**, generate them once and restart core:

| OS | Command (repo root) |
|---|---|
| Linux / macOS | `make pki` |
| Windows | `powershell -File scripts\dev-windows.ps1 pki` (uses Git for Windows' bash) |

Then run steps 1 to 5 again.

## 4. Things not to do

- **Don't commit your `trust-store.json` change** from `portal:pin` or the pki step. It pins
  *your* machine's key, and committing it causes cause B for everyone else. Leave the diff local.
- **Don't edit the bundle in the database** or hand-craft a signature. Always go through
  `portal:republish`, which uses the same signing path as production.
- **Don't delete `ui-builder-signing.pem` casually.** A new key invalidates every portal you
  have published locally, so you would need to republish each one.
- **Don't treat this as a dev-only nuisance outside dev.** See the warning at the top.

## 5. Reference

| Command | What it does |
|---|---|
| `bun run portal:check` | Verifies the key pair belongs together and that `trust-store.json` pins it. Reads public material only. |
| `bun run portal:pin` | Rewrites `trust-store.json` from `ui-builder-signing-pub.pem` (same output as `dev-pki.sh`). |
| `bun run portal:publish [--portal=x]` | Publishes and signs a bundle if the portal has none. |
| `bun run portal:republish [--portal=x]` | Same flow with `FSP_PUBLISH_FORCE=1`: re-signs even if a bundle exists. |

Implementation: `frontend/tools/portal-trust.ts` (Bun + `node:crypto`) drives
`frontend/tests/setup/portal-publish.spec.ts`. Design: `plans/signed-portal-delivery-plan.md`.
Seeded credentials: `platform-admin` / `admin-checker`, password `fsp-admin` or `$FSP_BOOTSTRAP_PASSWORD`.
