/** rbac.matrix — wire types + hooks. Every write is STAGED (202) for a checker; never optimistic. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { WidgetDataPortLike } from '../../core/manifest';
import type { MenuItem } from '../../../web-core/menu';

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

/* ───────────────────────────── permission matrix (menu link × verb) ─────────────────────────────
 * Rows are EXACTLY the portal's sidebar: one header row per menu group, one row per menu link, in
 * menu order. A link's keys = its own gate (MenuItem.perm) ∪ every key its screen's widgets name
 * (requires + action cells), limited to keys the catalogue has. The FSP catalogue is flat keys
 * `<resource>.<verb>` (no verb grid server-side); the matrix only PRESENTS each link's keys by verb
 * family. A cell is ONE box: ticking it grants every key in it (Authorize = kyc.approve + kyc.reject).
 *
 * "Active" is one more box per link: it is the link itself — on when the role holds any key of the
 * link's gate (the link shows in the sidebar), ticking it grants the gate key, unticking revokes the
 * gate. Keys no link uses are not shown, and editing a role never strips them.
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
  /** the menu link (route), unique per portal */
  link: string;
  label: string;
  cells: Record<VerbColumn, MatrixCell[]>;
  /** every key the link covers (gate ∪ widget keys) */
  keys: string[];
  /** the link's gate — holding any one shows the link (the Active box) */
  gate: string[];
}

export interface MatrixGroup {
  /** the sidebar group header ('Menu' for links shown without one) */
  label: string;
  rows: MatrixRow[];
  keys: string[];
}

export interface PermissionMatrixModel {
  /** only the verb families the rows actually use */
  columns: VerbColumn[];
  groups: MatrixGroup[];
}

/** Label of the group for menu links rendered without a sidebar header. */
export const UNGROUPED = 'Menu';

export function splitKey(key: string): { resource: string; verb: string } {
  const i = key.lastIndexOf('.');
  return i < 0 ? { resource: key, verb: '' } : { resource: key.slice(0, i), verb: key.slice(i + 1) };
}

export function columnOf(key: string): VerbColumn {
  return VERB_TO_COLUMN[splitKey(key).verb] ?? 'update';
}

/**
 * Build the matrix from a portal's menu (registry order). `widgetKeys` returns every permission key
 * a widget names (its requires + action cells) — passed in so the model stays pure.
 */
export function buildMatrix(
  menu: readonly MenuItem[],
  defs: readonly PermissionDef[],
  widgetKeys: (widgetId: string) => readonly string[],
): PermissionMatrixModel {
  const byKey = new Map(defs.map((d) => [d.key, d] as const));
  const used = new Set<VerbColumn>();
  const groups: MatrixGroup[] = [];
  for (const item of menu) {
    const label = item.group ?? UNGROUPED;
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { label, rows: [], keys: [] };
      groups.push(group);
    }
    const keys = [...new Set([...item.perm, ...item.widgets.flatMap((w) => widgetKeys(w))])]
      .filter((k) => byKey.has(k))
      .sort();
    const cells: Record<VerbColumn, MatrixCell[]> = { create: [], view: [], update: [], authorize: [] };
    for (const k of keys) {
      const d = byKey.get(k)!;
      const col = columnOf(k);
      used.add(col);
      cells[col].push({ key: k, title: d.title, risk: d.risk });
    }
    group.rows.push({ link: item.link, label: item.label, cells, keys, gate: item.perm.filter((k) => byKey.has(k)) });
    for (const k of keys) if (!group.keys.includes(k)) group.keys.push(k);
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
