/** rbac.matrix — wire types + hooks. Every write is STAGED (202) for a checker; never optimistic. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { cellsOf, requiresRows } from '../../core/manifest';
import type { WidgetDataPortLike, WidgetDef } from '../../core/manifest';
import { placedDef, screenLink } from '../../../../signed/signed-layout';
import { signedLayoutSchema } from '../../../../signed/signed-layout';
import type { SignedLayout } from '../../../../signed/signed-layout';
import { verifyDelivery } from '../../../../signed/delivery';
import type { Delivery } from '../../../../signed/delivery';
import type { SignedBundle } from '../../../../signed/verify';
import { deliveryKeyForTenant } from '../../../../portal-config';
import { toProblem } from '../../kit/problem';

export interface RoleView {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  scope: string;
  status: 'ACTIVE' | 'PENDING_CREATE';
  permissionKeys: string[];
  version: number;
  assignedCount: number;
  protectedRole: boolean;
  pendingApprovalId: string | null;
  pendingOperation: string | null;
}

export interface PermissionDef {
  key: string;
  title: string;
  risk: 'READ' | 'WRITE' | 'FOUR_EYES';
  component: string;
}

export interface RoleChange {
  pendingApprovalId: string;
  operationType: string;
  roleId: string;
  status: string;
}

/** Role Name = the role key; Role Description = its display name (FSP has no separate description). */
export const newRoleSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,47}$/, '2–48 characters: A–Z, 0–9 and _, starting with a letter'),
  name: z.string().trim().min(2, 'Describe the role').max(80, 'Keep it under 80 characters'),
});
export type NewRoleValues = z.infer<typeof newRoleSchema>;

export const rbacKeys = {
  all: (orgId: string) => ['rbac', orgId] as const,
  roles: (orgId: string) => ['rbac', orgId, 'roles'] as const,
  catalog: ['rbac', 'catalog'] as const,
};

export function useRoles(port: WidgetDataPortLike, orgId: string) {
  return useQuery({
    queryKey: rbacKeys.roles(orgId),
    queryFn: () => port.request<RoleView[]>('rbac.matrix.roles', { tenantId: orgId }),
    enabled: orgId !== '',
  });
}

export function useCatalog(port: WidgetDataPortLike) {
  return useQuery({
    queryKey: rbacKeys.catalog,
    queryFn: () => port.request<PermissionDef[]>('rbac.matrix.catalog'),
    staleTime: 10 * 60_000,
  });
}

/** GET /api/tenants/{id} — only what picks the org's portal. */
export interface OrgPortalView {
  id: string;
  type: string;
  subType: string | null;
}

/** The role's portal's published menu, as the matrix sees it. */
export type MenuState =
  | { kind: 'loading' }
  | { kind: 'ready'; portal: string; layout: SignedLayout }
  | { kind: 'missing'; portal: string | null }
  | { kind: 'closed'; portal: string; reason: string }
  | { kind: 'error'; message: string; retry: () => void };

/**
 * Fixture lane only (workbench, signed out): the fixture is an unsigned layout payload — no
 * network was touched and no signing key exists for it — so it is shape- and portal-checked but
 * cannot be signature-checked. The live lane ALWAYS goes through verifyDelivery.
 */
async function fixtureDelivery(portal: string, load: () => Promise<unknown>): Promise<Delivery> {
  try {
    const parsed = signedLayoutSchema.safeParse(await load());
    if (!parsed.success || parsed.data.portal !== portal) return { kind: 'closed', reason: 'payload_shape', evidenceId: 'fixture' };
    return { kind: 'layout', layout: parsed.data };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return { kind: 'missing' };
    throw err;
  }
}

/**
 * The matrix rows' ONLY source: the published, signature-verified menu of the portal the org's
 * people sign in to (platform org → admin console; a tenant → its sub-type's portal; when acting
 * as a tenant, the TARGET's). No published layout → no rows (never the coded menu).
 */
export function usePublishedMenu(port: WidgetDataPortLike, orgId: string, mode: 'live' | 'fixture'): MenuState {
  const org = useQuery({
    queryKey: ['rbac-menu', orgId, 'org'],
    queryFn: () => port.request<OrgPortalView>('rbac.matrix.org', { tenantId: orgId }),
    enabled: orgId !== '',
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const portal = org.data ? deliveryKeyForTenant(org.data) : null;
  const menu = useQuery({
    queryKey: ['rbac-menu', orgId, 'layout', portal, mode],
    queryFn: () => {
      const load = () => port.request<SignedBundle>('rbac.matrix.menu', { portal: portal! });
      return mode === 'live' ? verifyDelivery(portal!, load) : fixtureDelivery(portal!, load);
    },
    enabled: portal !== null,
    staleTime: 60_000,
    retry: 0, // money-grade rule (ui-std §7): zero auto-retries — the outcome is surfaced
  });

  if (org.isError) return { kind: 'error', message: toProblem(org.error).message, retry: () => void org.refetch() };
  if (org.isPending) return { kind: 'loading' };
  if (portal === null) return { kind: 'missing', portal: null };
  if (menu.isError) return { kind: 'error', message: toProblem(menu.error).message, retry: () => void menu.refetch() };
  if (menu.isPending) return { kind: 'loading' };
  const d = menu.data;
  switch (d.kind) {
    case 'layout': return { kind: 'ready', portal, layout: d.layout };
    case 'missing': return { kind: 'missing', portal };
    case 'reauth': return { kind: 'error', message: 'Your session has ended — sign in again.', retry: () => void menu.refetch() };
    case 'closed': return { kind: 'closed', portal, reason: d.reason };
  }
}

export type RoleCommand =
  | { kind: 'create'; key: string; name: string; permissionKeys: string[] }
  | { kind: 'update'; role: RoleView; permissionKeys: string[] }
  | { kind: 'delete'; role: RoleView };

export function useRoleCommand(port: WidgetDataPortLike, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: RoleCommand): Promise<RoleChange> => {
      switch (c.kind) {
        case 'create':
          return port.command<RoleChange>('rbac.matrix.create', { key: c.key, name: c.name, permissionKeys: c.permissionKeys }, { tenantId: orgId });
        case 'update':
          return port.command<RoleChange>('rbac.matrix.update', { permissionKeys: c.permissionKeys, expectedVersion: c.role.version },
            { tenantId: orgId, roleId: c.role.id });
        case 'delete':
          return port.command<RoleChange>('rbac.matrix.delete', undefined,
            { tenantId: orgId, roleId: c.role.id, expectedVersion: String(c.role.version) });
      }
    },
    retry: 0,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: rbacKeys.all(orgId) });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** Group the catalog by owning component, stable order. */
export function byComponent(defs: PermissionDef[]): Array<[string, PermissionDef[]]> {
  const m = new Map<string, PermissionDef[]>();
  for (const d of [...defs].sort((a, b) => a.key.localeCompare(b.key))) {
    const list = m.get(d.component) ?? [];
    list.push(d);
    m.set(d.component, list);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/* ───────────────────────────── permission matrix (menu screen × verb) ─────────────────────────────
 * Rows are EXACTLY the role's portal's PUBLISHED menu — the signed, verified layout core delivers
 * (the same one that draws that portal's sidebar), never the coded menu registry: one header row
 * per published menu, one row per screen, in published order. A screen's keys = every key its
 * placed widgets name (requires + action cells) — counting only widgets the server approved for
 * that portal at this build's major version, exactly like the sidebar — limited to keys the
 * catalogue has. The FSP catalogue is flat keys `<resource>.<verb>` (no verb grid server-side);
 * the matrix only PRESENTS each screen's keys by verb family. A cell is ONE box: ticking it grants
 * every key in it (Authorize = kyc.approve + kyc.reject).
 *
 * "Active" is one more box per screen: on when the role holds any key of the screen's gate (what
 * its placed widgets require — the screen then shows in the sidebar); ticking it grants one gate
 * key, unticking revokes the gate. Keys no screen uses are not shown, and editing a role never
 * strips them.
 */
export type VerbColumn = 'create' | 'view' | 'update' | 'authorize';

export const VERB_COLUMNS: readonly VerbColumn[] = ['create', 'view', 'update', 'authorize'];

export const VERB_LABEL: Record<VerbColumn, string> = {
  create: 'Create', view: 'View', update: 'Update', authorize: 'Authorize',
};

const VERB_TO_COLUMN: Record<string, VerbColumn> = {
  create: 'create', register: 'create', install: 'create', onboard_child: 'create', bootstrap: 'create',
  view: 'view', review: 'view',
  manage: 'update', activate: 'update', open: 'update', close: 'update', run: 'update', act_as: 'update',
  approve: 'authorize', reject: 'authorize', approve_child: 'authorize',
};

export interface MatrixCell {
  key: string;
  title: string;
  risk: PermissionDef['risk'];
}

export interface MatrixRow {
  /** the screen's route (/p/<menu>/<screen>), unique per portal */
  link: string;
  label: string;
  cells: Record<VerbColumn, MatrixCell[]>;
  /** every key the screen covers (its placed widgets' keys) */
  keys: string[];
  /** the screen's gate — holding any one shows it (the Active box) */
  gate: string[];
}

export interface MatrixGroup {
  /** the published menu's id (unique per layout) */
  id: string;
  /** the published menu's label (the sidebar group header) */
  label: string;
  rows: MatrixRow[];
  keys: string[];
}

export interface PermissionMatrixModel {
  /** only the verb families the rows actually use */
  columns: VerbColumn[];
  groups: MatrixGroup[];
}

export function splitKey(key: string): { resource: string; verb: string } {
  const i = key.lastIndexOf('.');
  return i < 0 ? { resource: key, verb: '' } : { resource: key.slice(0, i), verb: key.slice(i + 1) };
}

export function columnOf(key: string): VerbColumn {
  return VERB_TO_COLUMN[splitKey(key).verb] ?? 'update';
}

/**
 * Build the matrix from a portal's verified, published layout. `registry` is this build's widget
 * registry — passed in so the model stays pure.
 */
export function buildMatrix(
  layout: SignedLayout,
  defs: readonly PermissionDef[],
  registry: (widgetId: string) => WidgetDef | undefined,
): PermissionMatrixModel {
  const byKey = new Map(defs.map((d) => [d.key, d] as const));
  const known = (ks: Iterable<string>) => [...new Set(ks)].filter((k) => byKey.has(k)).sort();
  const used = new Set<VerbColumn>();
  const groups: MatrixGroup[] = [];
  for (const menu of layout.menus) {
    const group: MatrixGroup = { id: menu.id, label: menu.label, rows: [], keys: [] };
    for (const screen of menu.screens) {
      const placed = screen.placedWidgets
        .map((p) => placedDef(layout, p, registry))
        .filter((d): d is WidgetDef => d !== null);
      const keys = known(placed.flatMap((d) => cellsOf(d)));
      const cells: Record<VerbColumn, MatrixCell[]> = { create: [], view: [], update: [], authorize: [] };
      for (const k of keys) {
        const d = byKey.get(k)!;
        const col = columnOf(k);
        used.add(col);
        cells[col].push({ key: k, title: d.title, risk: d.risk });
      }
      group.rows.push({ link: screenLink(menu, screen), label: screen.label, cells, keys, gate: known(placed.flatMap((d) => requiresRows(d))) });
      for (const k of keys) if (!group.keys.includes(k)) group.keys.push(k);
    }
    groups.push(group);
  }
  return { columns: VERB_COLUMNS.filter((c) => used.has(c)), groups };
}

export type CheckState = 'all' | 'some' | 'none';

export function checkState(keys: readonly string[], selected: ReadonlySet<string>): CheckState {
  const n = keys.filter((k) => selected.has(k)).length;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
}

/**
 * "Select all" over a set of keys: only keys the editor may grant change (no escalation); if every
 * grantable key is already on, they all go off, otherwise they all go on.
 */
export function toggleAll(keys: readonly string[], selected: ReadonlySet<string>, grantable: ReadonlySet<string>): Set<string> {
  const mine = keys.filter((k) => grantable.has(k));
  const next = new Set(selected);
  const allOn = mine.length > 0 && mine.every((k) => next.has(k));
  for (const k of mine) {
    if (allOn) next.delete(k);
    else next.add(k);
  }
  return next;
}

/** Active = the link shows: the role holds ANY key of the link's gate (OR, like the sidebar). */
export function isActive(gate: readonly string[], selected: ReadonlySet<string>): boolean {
  return gate.some((k) => selected.has(k));
}

/** The one key ticking Active grants: the gate's view-family key if it has one, else its first grantable key. */
export function activeKey(gate: readonly string[], grantable: ReadonlySet<string>): string | null {
  const mine = gate.filter((k) => grantable.has(k));
  return mine.find((k) => columnOf(k) === 'view') ?? mine[0] ?? null;
}

/**
 * Toggle a link's Active box. On → grant one gate key (the least privilege that shows the link).
 * Off → revoke every gate key the editor may revoke, so the link no longer shows.
 */
export function toggleActive(gate: readonly string[], selected: ReadonlySet<string>, grantable: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (isActive(gate, selected)) {
    for (const k of gate) if (grantable.has(k)) next.delete(k);
  } else {
    const k = activeKey(gate, grantable);
    if (k) next.add(k);
  }
  return next;
}

/** Other links that share a gate key with this one — unticking its Active box hides them too. */
export function sharedGateLinks(m: PermissionMatrixModel, row: MatrixRow): string[] {
  return m.groups.flatMap((g) => g.rows)
    .filter((r) => r.link !== row.link && r.gate.some((k) => row.gate.includes(k)))
    .map((r) => r.label);
}
