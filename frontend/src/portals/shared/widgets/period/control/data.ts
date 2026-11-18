/** period.control data contributions — accounting periods per book (read-only until core exposes open/close). */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'period.control.list': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/books/{bookId}/periods' } },
};
