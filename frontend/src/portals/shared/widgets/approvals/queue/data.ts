/** approvals.queue data contributions (sources.ts WIDGET_DATA): names start with the widget id. */
import type { DataSources } from '../../core/sources';

export const sources: DataSources = {
  'approvals.queue.list': { '*': { method: 'GET', path: '/api/approvals?tenantId={tenantId}', query: ['status', 'size'] } },
};

export const commands: DataSources = {
  'approvals.queue.approve': { '*': { method: 'POST', path: '/api/approvals/{id}/approve' } },
  'approvals.queue.reject': { '*': { method: 'POST', path: '/api/approvals/{id}/reject' } },
};
