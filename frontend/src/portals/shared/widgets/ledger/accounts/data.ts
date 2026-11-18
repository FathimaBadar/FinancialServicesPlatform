/** ledger.accounts data contributions — chart of accounts per book. */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'ledger.accounts.list': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/books/{bookId}/gl-accounts' } },
};

export const commands: DataSources = {
  'ledger.accounts.provision': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/books/{bookId}/provision-default-coa' } },
};
