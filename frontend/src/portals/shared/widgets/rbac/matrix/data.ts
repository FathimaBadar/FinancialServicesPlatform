/** rbac.matrix data contributions — organization roles (core RoleAdminController). */
import type { DataSources } from '../../core/sources';
import type { FixtureSet, FixtureRequest } from '../../core/ports';
import type { OrgPortalView, PermissionDef, RoleChange, RoleView } from './model';
import { forbidUnless } from '../../kit/forbid';
import { ApiError } from '../../../web-core/api';

export const sources: DataSources = {
  'rbac.matrix.roles': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/roles' } },
  'rbac.matrix.catalog': { '*': { method: 'GET', path: '/api/permissions' } },
  /** the org → which portal its people sign in to (type + subType) */
  'rbac.matrix.org': { '*': { method: 'GET', path: '/api/tenants/{tenantId}' } },
  /** that portal's SIGNED delivery bundle — verified in the browser before any row is drawn */
  'rbac.matrix.menu': { '*': { method: 'GET', path: '/api/ui/bundles/{portal}' } },
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

/** The fixture org signs in to the manufacturer portal. */
const org: OrgPortalView = { id: ROLES_ORG, type: 'TENANT', subType: 'MANUFACTURER' };

/** That portal's PUBLISHED layout (payload shape core signs) — screens renamed from the coded
 *  menu on purpose, so the workbench shows the matrix following the published menu. */
const publishedLayout = (portal: string) => ({
  portal, schemaVersion: 1, layoutVersion: 'fixture-3', publishedAt: '2026-11-20T09:00:00Z',
  menus: [
    { id: 'books', label: 'Books', screens: [
      { id: 'journal', label: 'Journal entries', placedWidgets: [{ id: 'p1', widgetId: 'journal.entry', span: {} }] },
      { id: 'ledger', label: 'Chart of accounts', placedWidgets: [{ id: 'p2', widgetId: 'ledger.accounts', span: {} }] },
    ] },
    { id: 'access', label: 'Access', screens: [
      { id: 'roles', label: 'Roles', placedWidgets: [{ id: 'p3', widgetId: 'rbac.matrix', span: {} }] },
      { id: 'audit', label: 'Audit trail', placedWidgets: [{ id: 'p4', widgetId: 'audit.trail', span: {} }] },
    ] },
  ],
  widgets: [['journal.entry', '1.0.0'], ['ledger.accounts', '1.0.0'], ['rbac.matrix', '1.0.0'], ['audit.trail', '1.0.1']]
    .map(([id, version]) => ({ id, version, bundle: 'fixture', bundleHash: 'sha256:fixture', requires: [] })),
});

const noLayout = (): never => {
  throw new ApiError({ status: 404, code: 'UI_BUNDLE_NOT_FOUND', title: 'Not found', detail: 'No signed bundle for this portal' });
};

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
    default: (req: FixtureRequest): RoleView[] => {
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
  'rbac.matrix.org': {
    default: org,
    error: null,
  },
  'rbac.matrix.menu': {
    default: (req: FixtureRequest) => publishedLayout(req.params.portal ?? ''),
    empty: noLayout,
    error: null,
  },
  'rbac.matrix.create': {
    default: (req: FixtureRequest): RoleChange => {
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
    default: (req: FixtureRequest): RoleChange => {
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
    default: (req: FixtureRequest): RoleChange => {
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
