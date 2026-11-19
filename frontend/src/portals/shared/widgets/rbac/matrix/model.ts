/** rbac.matrix — wire types + hooks. Every write is STAGED (202) for a checker; never optimistic. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { WidgetDataPortLike } from '../../core/manifest';

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

/* ───────────────────────────── permission matrix (component × resource × verb) ─────────────────────────────
 * The FSP catalogue is flat keys `<resource>.<verb>` (no verb grid server-side). The matrix only
 * PRESENTS them as a grid: rows = resource grouped by owning component, columns = the verb families
 * that actually occur. Every catalogue key lands in exactly one cell — nothing is invented, nothing
 * is dropped (an unknown verb falls into Update). A cell is ONE box: ticking it grants every key in
 * it (e.g. Authorize on KYC case = kyc.approve + kyc.reject).
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

const RESOURCE_LABEL: Record<string, string> = {
  audit: 'Audit trail', idp: 'Identity provider', je: 'Journal entry', 'bank.account': 'Bank account',
  kyc: 'KYC case', screening: 'Screening', 'gl.account': 'GL account', period: 'Accounting period',
  notification: 'Notification', org: 'Organization', platform: 'Platform', plugin: 'Plugin', role: 'Role',
  user: 'Back office user', tenant: 'Tenant', 'ui.layout': 'Portal layout', 'ui.widget': 'Widget',
};

const COMPONENT_LABEL: Record<string, string> = {
  audit: 'Audit', identity: 'Identity', journal: 'Journal', kyc: 'KYC', ledger: 'Ledger',
  notify: 'Notifications', org: 'Organizations', onboarding: 'Onboarding', platform: 'Platform',
  plugins: 'Plugins', rbac: 'User & Role Management', tenant: 'Tenancy', ui: 'Portal UI',
};

function humanize(s: string): string {
  const t = s.replace(/[._]/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface MatrixCell {
  key: string;
  title: string;
  risk: PermissionDef['risk'];
}

export interface MatrixRow {
  resource: string;
  label: string;
  cells: Record<VerbColumn, MatrixCell[]>;
  keys: string[];
}

export interface MatrixGroup {
  component: string;
  label: string;
  rows: MatrixRow[];
  keys: string[];
}

export interface PermissionMatrixModel {
  /** only the verb families the catalogue actually uses */
  columns: VerbColumn[];
  groups: MatrixGroup[];
}

export function splitKey(key: string): { resource: string; verb: string } {
  const i = key.lastIndexOf('.');
  return i < 0 ? { resource: key, verb: '' } : { resource: key.slice(0, i), verb: key.slice(i + 1) };
}

export function buildMatrix(defs: PermissionDef[]): PermissionMatrixModel {
  const used = new Set<VerbColumn>();
  const groups: MatrixGroup[] = [];
  for (const [component, list] of byComponent(defs)) {
    const rows = new Map<string, MatrixRow>();
    for (const d of list) {
      const { resource, verb } = splitKey(d.key);
      const col = VERB_TO_COLUMN[verb] ?? 'update';
      used.add(col);
      let row = rows.get(resource);
      if (!row) {
        row = { resource, label: RESOURCE_LABEL[resource] ?? humanize(resource), cells: { create: [], view: [], update: [], authorize: [] }, keys: [] };
        rows.set(resource, row);
      }
      row.cells[col].push({ key: d.key, title: d.title, risk: d.risk });
      row.keys.push(d.key);
    }
    const sorted = [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
    groups.push({
      component,
      label: COMPONENT_LABEL[component] ?? humanize(component),
      rows: sorted,
      keys: sorted.flatMap((r) => r.keys),
    });
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

/**
 * Components the matrix SHOWS (in this order). Everything else is hidden, not removed: hidden keys
 * stay in the catalogue and on every role — editing a role never strips them (the form keeps the
 * full key set; only the grid filters). Add a component id here to show it again.
 */
export const VISIBLE_COMPONENTS: readonly string[] = ['kyc', 'org', 'rbac'];

/** The matrix limited to the visible components; columns shrink to the verbs those still use. */
export function visibleMatrix(m: PermissionMatrixModel, visible: readonly string[] = VISIBLE_COMPONENTS): PermissionMatrixModel {
  const groups = visible.map((c) => m.groups.find((g) => g.component === c)).filter((g): g is MatrixGroup => !!g);
  const columns = m.columns.filter((col) => groups.some((g) => g.rows.some((r) => r.cells[col].length > 0)));
  return { columns, groups };
}
