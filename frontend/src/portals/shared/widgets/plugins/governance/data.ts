/** plugins.governance data contributions (core PluginGovernanceController + registry/installation). */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'plugins.governance.types': { '*': { method: 'GET', path: '/api/platform/plugins' } },
  'plugins.governance.orgs': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/children' } },
  'plugins.governance.installations': { '*': { method: 'GET', path: '/api/tenants/{orgId}/plugins' } },
};

export const commands: DataSources = {
  'plugins.governance.register': { '*': { method: 'POST', path: '/api/platform/plugins' } },
  'plugins.governance.install': { '*': { method: 'POST', path: '/api/tenants/{orgId}/plugins' } },
};
