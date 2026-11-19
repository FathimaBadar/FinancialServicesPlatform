/** rbac.matrix data contributions — organization roles (core RoleAdminController). */
import type { DataSources } from '../../core/sources';
import type { FixtureSet } from '../../core/ports';
import type { PermissionDef, RoleChange, RoleView } from './model';
import { forbidUnless } from '../../kit/forbid';

export const sources: DataSources = {
  'rbac.matrix.roles': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/roles' } },
  'rbac.matrix.catalog': { '*': { method: 'GET', path: '/api/permissions' } },
};

export const commands: DataSources = {
  'rbac.matrix.create': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/roles' } },
  'rbac.matrix.update': { '*': { method: 'PATCH', path: '/api/tenants/{tenantId}/roles/{roleId}' } },
  'rbac.matrix.delete': { '*': { method: 'DELETE', path: '/api/tenants/{tenantId}/roles/{roleId}?expectedVersion={expectedVersion}' } },
};

const ROLES_ORG = '00000000-0000-0000-0000-0000000000a2';

/** Same catalog the permissions.catalogue widget lists — one truth, two surfaces. */
const catalog: PermissionDef[] = [
  { key: 'audit.view', title: 'View the audit trail', risk: 'READ', component: 'audit' },
  { key: 'gl.account.view', title: 'View books and the chart of accounts', risk: 'READ', component: 'ledger' },
  { key: 'je.view', title: 'View journal entries', risk: 'READ', component: 'journal' },
  { key: 'je.create', title: 'Create and submit journal entries', risk: 'WRITE', component: 'journal' },
  { key: 'je.approve', title: 'Approve and post journal entries', risk: 'FOUR_EYES', component: 'journal' },
  { key: 'role.manage', title: 'Create and change roles (four-eyes)', risk: 'FOUR_EYES', component: 'rbac' },
];

/** Mutable so the fixture lane plays create/update/delete like the server does (STAGED rows). */
let roles: RoleView[] = [
  {
    id: '00000000-0000-0000-0000-0000000000d3',
    tenantId: ROLES_ORG,
    key: 'OPS',
    name: 'Operations maker',
    scope: 'TENANT',
    status: 'ACTIVE',
    permissionKeys: ['je.view', 'je.create'],
    version: 3,
    assignedCount: 4,
    protectedRole: false,
    pendingApprovalId: null,
    pendingOperation: null,
  },
  {
    id: '00000000-0000-0000-0000-0000000000d4',
    tenantId: ROLES_ORG,
    key: 'ADMIN',
    name: 'Organization administrator',
    scope: 'TENANT',
    status: 'ACTIVE',
    permissionKeys: ['audit.view', 'gl.account.view', 'je.view'],
    version: 7,
    assignedCount: 1,
    protectedRole: true,
    pendingApprovalId: null,
    pendingOperation: null,
  },
];

function change(roleId: string, operationType: string): RoleChange {
  return { pendingApprovalId: `00000000-0000-0000-0000-0000000000d${roleId.slice(-1)}`, operationType, roleId, status: 'PENDING_APPROVAL' };
}

export const fixtures: FixtureSet = {
  'rbac.matrix.roles': {
    default: (req): RoleView[] => {
      forbidUnless(req.permissions, 'role.view');
      return roles;
    },
    empty: [],
    error: null,
  },
  'rbac.matrix.catalog': {
    default: catalog.map((p) => ({ ...p })),
    empty: [],
    error: null,
  },
  'rbac.matrix.create': {
    default: (req): RoleChange => {
      forbidUnless(req.permissions, 'role.manage');
      const b = req.body as { key?: string; name?: string };
      const v = roles.length + 1;
      roles = [...roles, {
        id: `00000000-0000-0000-0000-0000000000e${v}`,
        tenantId: ROLES_ORG,
        key: b.key ?? 'NEW',
        name: b.name ?? 'New role',
        scope: 'TENANT',
        status: 'PENDING_CREATE',
        permissionKeys: [],
        version: 1,
        assignedCount: 0,
        protectedRole: false,
        pendingApprovalId: `00000000-0000-0000-0000-0000000000e${v}`,
        pendingOperation: 'CREATE',
      }];
      return change(`00000000-0000-0000-0000-0000000000e${v}`, 'CREATE');
    },
    error: null,
  },
  'rbac.matrix.update': {
    default: (req): RoleChange => {
      forbidUnless(req.permissions, 'role.manage');
      const roleId = req.params.roleId ?? '';
      const target = roles.find((r) => r.id === roleId);
      if (!target) throw new Error(`fixture drift: role ${roleId} not in default`);
      roles = roles.map((r) => (r.id === roleId ? { ...r, pendingApprovalId: '00000000-0000-0000-0000-0000000000d9', pendingOperation: 'MODIFY' } : r));
      return change(roleId, 'MODIFY');
    },
    error: null,
  },
  'rbac.matrix.delete': {
    default: (req): RoleChange => {
      forbidUnless(req.permissions, 'role.manage');
      const roleId = req.params.roleId ?? '';
      const target = roles.find((r) => r.id === roleId);
      if (!target) throw new Error(`fixture drift: role ${roleId} not in default`);
      return change(roleId, 'DELETE');
    },
    error: null,
  },
};

export const RBAC_ORG_ID = ROLES_ORG;
