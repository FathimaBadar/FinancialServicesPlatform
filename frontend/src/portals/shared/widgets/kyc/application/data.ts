/** kyc.application data contributions — this organization's own KYC standing (KYC plugin). */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'kyc.application.self': { '*': { method: 'GET', path: '/api/plugins/kyc/organizations/{tenantId}' } },
};
