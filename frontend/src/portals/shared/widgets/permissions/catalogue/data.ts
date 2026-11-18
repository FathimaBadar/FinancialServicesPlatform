/** permissions.catalogue data contributions — the global permission catalog (core RbacController). */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'permissions.catalogue.list': { '*': { method: 'GET', path: '/api/permissions' } },
};
