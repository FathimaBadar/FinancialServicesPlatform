/** onboard.psp data contributions — the platform creates PSP (manufacturer) organizations. */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'onboard.psp.list': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/children' } },
};

export const commands: DataSources = {
  'onboard.psp.create': { '*': { method: 'POST', path: '/api/tenants' } },
};
