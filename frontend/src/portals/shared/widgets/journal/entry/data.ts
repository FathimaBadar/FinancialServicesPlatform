/** journal.entry data contributions (core JournalController). Money POSTs are never auto-retried. */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'journal.entry.list': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/journal-entries', query: ['status', 'size'] } },
  'journal.entry.get': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/journal-entries/{entryId}' } },
  'journal.entry.accounts': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/books/{bookId}/gl-accounts' } },
};

export const commands: DataSources = {
  'journal.entry.create': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/journal-entries' } },
  'journal.entry.submit': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/journal-entries/{entryId}/submit-for-approval' } },
  'journal.entry.approve': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/journal-entries/{entryId}/approve' } },
  'journal.entry.check': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/journal-entries/{entryId}/check-status' } },
};
