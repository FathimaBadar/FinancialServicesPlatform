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

export const newRoleSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,47}$/, '2–48 characters: A–Z, 0–9 and _, starting with a letter'),
  name: z.string().trim().min(2, 'Give the role a name').max(80, 'Keep it under 80 characters'),
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
