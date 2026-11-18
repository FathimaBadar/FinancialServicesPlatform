/** rbac.matrix data contributions — organization roles (core RoleAdminController). */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'rbac.matrix.roles': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/roles' } },
  'rbac.matrix.catalog': { '*': { method: 'GET', path: '/api/permissions' } },
};

export const commands: DataSources = {
  'rbac.matrix.create': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/roles' } },
  'rbac.matrix.update': { '*': { method: 'PATCH', path: '/api/tenants/{tenantId}/roles/{roleId}' } },
  'rbac.matrix.delete': { '*': { method: 'DELETE', path: '/api/tenants/{tenantId}/roles/{roleId}?expectedVersion={expectedVersion}' } },
};
