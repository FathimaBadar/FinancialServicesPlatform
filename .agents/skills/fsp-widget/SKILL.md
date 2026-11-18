---
name: fsp-widget
description: Builds FSP React UI widgets for the widget harness - manifest, component, contracts, fixtures, tests. Self-updates by scanning backend controllers for @FspOperation endpoints so it never has to ask the user for server details that already exist in code.
---

# fsp-widget skill — FSP React widget builder (self-updating)

**How to use:** describe the widget you need (what it shows, what it mutates, who uses it). The skill walks you through an operations sheet, then emits the complete widget files in the FSP output format. Save the answer as `frontend/src/portals/shared/widgets/<area>/<name>/index.tsx` and run `bun run tools/widgets.ts check`.

---

## Self-update principle (read this first)

The skill is a static `SKILL.md` — it cannot execute code itself. Instead, **you (the AI) run a controller-scan procedure before every widget** so the skill stays up-to-date with the codebase:

1. **Scan every `*Controller.java`** under `backend/core/src/main/java/com/fsp/core/`.
2. **Extract** for each handler method: HTTP method + full path (class `@RequestMapping` + method `@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping`), `@FspOperation{id, permission, component, risk, resource, resourceVariable, title}`, `@PathVariable` names/types, `@RequestParam` names, request body type, response type.
3. **Build a mental API catalogue** keyed by logical operation. This catalogue is your source of truth — do **not** ask the user for endpoint details that exist in code.
4. **Reuse first.** If an operation matches an existing endpoint (same path/method/permission), mark it EXISTING and use the exact cell + shapes.
5. **New only when nothing matches.** If no controller method serves the needed operation after a full scan, it is genuinely new → propose an endpoint + permission cell + backend stub with `@FspOperation`, add it to `sources.ts`, and mark it NEW.

**Rule:** If you cannot find an endpoint in the scanned controllers, it does not exist in the codebase. Do not guess a URL — propose it as NEW with a stub.

---

## What this skill produces

One FSP widget: a React component registered through `defineWidget`, plus its data sources/commands mapped in `sources.ts`, permission cells from the FSP catalogue (`ui.widget.register`, `ui.layout.manage`, `je.approve`, `kyc.approve`, `user.manage`, etc.), React size spans for xs/sm/md/lg, fixtures for default/empty/error/forbidden, and Vitest tests.

**Stack:** React 18 + TypeScript strict + Vite/Bun. **Never Angular.** The widget reaches the API ONLY through the widget data port (`port.request` / `port.command`) — never `fetch`, `HttpClient`, `localStorage`, etc.

**Backend contract (widget harness PRD §4):**

| Op | Endpoint | Permission cell |
|---|---|---|
| register/upsert widget | `PUT /v1/ui/widgets` | `ui.widget.register` |
| list widget registry | `GET /v1/ui/widgets` | `ui.widget.register` |
| save draft layout | `PUT /v1/ui/layouts/{portal}/draft` | `ui.layout.manage` |
| submit to publish | `POST /v1/ui/layouts/{portal}/submit` | `ui.layout.manage` (maker) |
| approve/reject via queue | `/v1/approvals` (OpType `UI_LAYOUT_PUBLISH`) | `ui.layout.manage` (checker ≠ maker) |
| read published layout | `GET /v1/ui/layouts/{portal}/published` | authenticated-only |

Existing FSP widgets also use: `kyc.orgs.tree`, `users.list`, `approvals.get`, `journal.get`, etc. — reuse first, never invent an endpoint.

---

## Step 0 — Scan controllers (run before drafting the sheet)

For each file matching `backend/core/src/main/java/com/fsp/core/**/*Controller.java`:

**A. Read the class-level mapping** (optional but common):
```java
@RestController
@RequestMapping("/v1/tenants/{tenantId}/journal-entries")
public class JournalController { ... }
```

**B. For each method, read the method-level mapping + annotation.** Example from `JournalController`:

```java
@PostMapping("/v1/tenants/{tenantId}/journal-entries")
@FspOperation(id = "journal.entry.create", permission = "je.create", component = "journal",
    risk = FspOperation.OperationRisk.WRITE, title = "Create journal entry draft")
public JournalDtos.EntryView create(HttpServletRequest request,
    @PathVariable("tenantId") UUID tenantId,
    @RequestBody JournalDtos.CreateEntryRequest body)
```

Extract into a record like:

| Field | From this example |
|---|---|
| method | POST |
| path | `/v1/tenants/{tenantId}/journal-entries` |
| opId | `journal.entry.create` |
| permission (cell) | `je.create` |
| component | `journal` |
| risk | `WRITE` |
| title | `Create journal entry draft` |
| pathVars | `{tenantId: UUID}` |
| body | `JournalDtos.CreateEntryRequest` |
| response | `JournalDtos.EntryView` |

**C. Note class-level `@RequestMapping` prefix** — prepend it to method paths when present (e.g. `UiHarnessController` uses `@RequestMapping("/v1/ui")`).

**D. Also scan `sources.ts`** (`frontend/src/portals/shared/widgets/core/sources.ts`, `SOURCES` and `COMMANDS` maps) to see which endpoints already have logical names widgets can reuse.

---

## Step 1 - the operations sheet

List every operation the UI performs (each read and each write: load, save draft, submit, approve, …). For each:

- **endpoint** (METHOD /v1/path — BFF-relative; `/v1/...` rides BffProxyController → gateway → core)
- **permission cell** (FSP flat key, e.g. `ui.widget.register`, `je.approve`, `kyc.approve`)
- **shape it RECEIVES** (response)
- **shape it SENDS** (request body / params)
- **what the UI does after success, a refusal (422 / 409) and 403**
- **KIND** — exactly one of:
  - `View` (every read)
  - `Create` (makes a new record, including submitting a new one)
  - `Modify` (changes an existing record: edit, save draft, submit)
  - `Approve` (every other action: execute, schedule, approve, reject, withdraw, cancel, …)

Rules:
- **Reuse first.** Look for each operation in the scanned controller catalogue and `sources.ts`. Mark it EXISTING and use that logical name, its cell and its exact shapes.
- **New when nothing fits.** Mark it NEW and propose: a logical source/command name, an endpoint (`/v1/<area>/…`), a permission cell — reuse an existing row and verb when the meaning matches, else a new row `<area>.<resource>` with one of the ten verbs — and the request/response shapes this UI needs. Also deliver a backend controller stub.
- **If an endpoint, permission, or shape you need is missing after a full controller scan, it is genuinely new.** Do NOT ask the user for what you could not find in code — propose it as NEW with a stub.
- Complex UIs (draft → submit, approve/reject…) are several operations: each has its own command, request contract and response contract; chained writes run in order and a later failure says the earlier step succeeded.

### Verbs (the only ten) and tenant sources

| verb | meaning |
|---|---|
| read | view / list |
| create | create / add |
| modify | change / update |
| delete | delete / retire |
| submit | submit (maker) |
| authorize | approve (checker) — never in the same role as submit on the same row |
| execute | run / act with effect |
| export | download / export |
| administer | administer / control |
| simulate | simulate (sandbox only) |

Tenant source:
- **PATH** — named by a path variable: `tenant = "{tenantId}"`
- **SELF** — the caller's own org: `tenant = "null"`
- **LOOKUP** — derived from an object: `lookup = "<resolver>"`
- **NONE** — platform-wide: `tenant = "null"`

---

## Step 2 - the files

When the sheet is complete, print it briefly, then output the files in the Output format, then the self-check list. Nothing else.

### Hard rules (the checker enforces every one)

1. **One file:** `frontend/src/portals/shared/widgets/<area>/<name>/index.tsx` — `<area>`/`<name>` are lower case (name may contain dashes); the widget id is `<area>.<name>`.
2. **Reuse, never import from MiPay.** Only the FSP widget runtime elements (import them relative from the widget folder — a widget at `widgets/<area>/<name>/` is two levels under `widgets/`):
   - `defineWidget`, `WidgetDef`, `WidgetAction`, `OPERATIONS` from `../../core/manifest`
   - `span`, `tierOf`, `COLS`, `TIERS` from `../../core/grid`
   - `useWidgetRuntime`, `usePortData`, `WidgetContextProvider` from `../../core/context`
   - `WidgetDataPortLike` from `../../core/manifest`
   - Design-system atoms from `../../../ui/atoms` (Chip, EmptyState, Panel, PageHeader, StatusBadge, etc.) — design tokens only per ui-std §2
3. **Never define a component, directive or pipe other than the widget itself.** Never use raw `<table>`, `<button>`, `<input>`, `<select>`, `<textarea>`. Use the design-system atoms.
4. **One network path:** never `fetch`, `XMLHttpRequest`, `HttpClient`, `localStorage`, `sessionStorage`, `indexedDB`. Only `port.request(name, params)` and `port.command(name, body, params)`.
5. **Every source and command has a response contract; every command that sends a body (POST/PUT/PATCH) has a request contract.** TypeScript interfaces/types for contracts — export them.
6. **Every gated action:** `data-action="<action id>"` on the element AND the widget manifest `actions[]` declares the cell (`ui.widget.register`, etc.). Permission gating is enforced by `WidgetHost` (the `requires` list).
7. **Mobile first:** `size` for xs, sm, md, lg with `span.*` (xs max 4 columns, sm 8, md/lg 12). Style with `@container`, never `@media`. For structural phone changes (fewer table columns) use `tier === 'xs'`.
8. **Fixtures:** scenarios `default`, `empty`, `error`, plus `forbidden` (fail 403) when the widget hides on 403, and one per refusal you handle. Every value must match the response contract exactly (types, nulls, every field present). Realistic Namibian data (organisations, people, NAD amounts, ISO dates).
9. **Tests (Vitest globals `describe`/`it`/`expect`):** at least 4 — the right sources and params, the data rendered, actions hidden without their cell and shown after grant, each write's params/body, no `[data-diagnostics]` with fixtures, and a drifted answer diagnosed in `[data-diagnostics]`.
10. **TypeScript strict, no `any` leaks in templates, signals for state, React `memo`/`useCallback` equivalents.** No `TODO` left anywhere.
11. **Permissions are flat keys** (not `row:verb`). A widget's `requires` is `string[]` (OR) or `{ all: [...] }` (AND). `commandOperations` maps each command to one of `view | create | modify | approve`.
12. **Keep sources.ts in sync.** When you mark an operation NEW with a new endpoint, add its logical name to `SOURCES` (reads) or `COMMANDS` (writes) in `sources.ts` so the widget's `port.request`/`port.command` can resolve it.

---

## Output format (machine-applied — exactly this, paths from the repository root)

```
=== FILE: frontend/src/portals/shared/widgets/<area>/<name>/index.tsx ===
…the whole file…
=== END FILE ===
=== FILE: frontend/src/portals/shared/widgets/core/sources.ts === (only if adding new SOURCES/COMMANDS entries)
…the diff or full file…
=== END FILE ===
=== DATA-SOURCES ===
  '<area.thing.verb>': { '*': { method: 'GET', path: '/v1/…', query: ['…'] } },
=== END DATA-SOURCES ===
(only when an operation is NEW:)
=== BACKEND: backend/core/src/main/java/com/fsp/core/<area>/<Thing>Controller.java ===
…the whole stub controller…
=== END BACKEND ===
=== BACKEND-NOTES ===
…what each stub endpoint must do…
=== END BACKEND-NOTES ===
```

### Backend stub template (for NEW operations only)

```java
package com.fsp.core.<area>;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** STUB generated for widget <area.name>: implement the service calls. */
@RestController
@RequestMapping("/v1/<area>/<resource>")
public class <Thing>Controller {

    @FspOperation(id = "<area>.<resource>.<verb>", component = "<area>",
        permission = "<area>.<resource>.read", risk = FspOperation.OperationRisk.READ,
        resource = "<resource>", resourceVariable = "id", title = "<Title>")
    @GetMapping("/{id}")
    public <ResponseRow> get(HttpServletRequest request, @PathVariable("id") UUID id) {
        Actor actor = actor(request);
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "<area>.<resource>: not implemented yet");
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }
}
```

**Stub rules:** `@NotBlank`/`@NotNull` on required request fields (the contract generator reads them); primitives (`int`, `long`, `boolean`) for never-null numbers and flags, boxed or `String`/`Instant` otherwise; the widget's contracts must describe exactly these records; `501 NOT_IMPLEMENTED` until implemented. Add a BACKEND-NOTES block saying what each stub endpoint must do.

---

## Self-check (print it, ticked, after the files)

- [ ] I ran Step 0 (scanned all `*Controller.java` + `sources.ts`) before drafting the sheet
- [ ] every operation is marked EXISTING (found in scanned controllers / sources.ts) or NEW (proposed + stub + sources.ts entry)
- [ ] every EXISTING operation uses the exact cell, path, method, and shapes from the scanned controller
- [ ] if an operation was NOT found after a full scan, I marked it NEW — I did not ask the user for something that should come from code
- [ ] every operation in the sheet has a source/command, a response contract, a request contract (writes) and a fixture answer
- [ ] only FSP design-system atoms; no raw HTML controls; no own sub-components
- [ ] every action: `data-action="<id>"` + manifest `actions[].cell`
- [ ] fixtures match the contracts field by field
- [ ] `size` for all four tiers; no `@media`
- [ ] tests as in rule 9
- [ ] widget id is `<area>.<name>`, lower case
- [ ] `requires` uses FSP flat permission keys
- [ ] NEW endpoints added to `SOURCES`/`COMMANDS` in `sources.ts`

---

## Example: a minimal read-only widget

A widget that lists journal entries (EXISTING source `journal.get`, permission `je.view` — found by scanning `JournalController`):

```tsx
import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { useWidgetRuntime, usePortData } from '../../core/context';
import { Panel, EmptyState } from '../../../ui/atoms';

export default defineWidget({
  id: 'journal.entries',
  version: '1.0.0',
  label: 'Journal entries',
  category: 'Ledger',
  contexts: ['PLATFORM', 'MANUFACTURER', 'DISTRIBUTOR', 'ANY'],
  requires: ['je.view'],
  sources: ['journal.get'],
  actions: [],
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(6), lg: span.lg(4) },
  render: JournalEntries,
});

function JournalEntries(props: { mode: 'live' | 'fixture'; state: string }) {
  const { port } = useWidgetRuntime();
  const rows = usePortData<any[]>(() => port.request('journal.get', { size: '10' }), []);

  if (rows.state === 'loading') return <Panel className="p-4"><EmptyState title="Loading…" /></Panel>;
  if (rows.state === 'forbidden') return <Panel className="p-4"><EmptyState title="Not allowed" hint="You lack je.view" /></Panel>;
  if (rows.state === 'empty') return <Panel className="p-4"><EmptyState title="No journal entries" /></Panel>;
  if (rows.state === 'error') return <Panel className="p-4"><EmptyState title="Error" hint={rows.problem?.detail} /></Panel>;

  return (
    <Panel className="p-4">
      <ul className="flex flex-col divide-y divide-line">
        {rows.data.map(r => <li key={r.id} className="py-2">{r.reference}</li>)}
      </ul>
    </Panel>
  );
}
```

`sources.ts` already contains:
```ts
'journal.get': { '*': { method: 'GET', path: '/v1/tenants/{tenantId}/journal-entries?size=10' } },
```

---

## When to ask the user

Stop and ask (once, with your drafted operations sheet) only when:
- You need a **genuinely new business domain** that has no controller at all (e.g. a brand-new area not in any scanned controller) — then propose the endpoint + permission cell + stub.
- The widget needs a config schema beyond the four canonical operations.

Do **not** ask the user for endpoint URLs, permission cells, or response shapes that you can read from a scanned controller.