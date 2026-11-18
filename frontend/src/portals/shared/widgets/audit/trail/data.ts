import type { DataSources } from '../../core/sources';

export const PAGE_SIZE = 20;

/** one AuditRecord (GET /api/tenants/{tenantId}/audit) */
export interface AuditRow {
  id: number;
  actorId: string | null;
  checkerId: string | null;
  tenantId: string;
  bookId: string | null;
  actionType: string;
  resourceType: string | null;
  resourceId: string | null;
  correlationId: string | null;
  clientId: string | null;
  actingTenantId: string | null;
  actSessionId: string | null;
  timestampUtc: string | null;
}

/** Spring page wrapper */
export interface AuditPage {
  content: AuditRow[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export function shortId(v: string | null): string {
  return v ? `${v.slice(0, 8)}…` : '—';
}

export const sources: DataSources = {
  'audit.trail.page': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/audit', query: ['page', 'size'] } },
};

export const commands: DataSources = {};

const ORG = '00000000-0000-0000-0000-0000000000a1';
const row = (n: number, actionType: string, resourceType: string, at: string, checker: boolean): AuditRow => ({
  id: 1000 - n,
  actorId: '00000000-0000-0000-0000-000000000201',
  checkerId: checker ? '00000000-0000-0000-0000-000000000202' : null,
  tenantId: ORG,
  bookId: null,
  actionType,
  resourceType,
  resourceId: `00000000-0000-0000-0000-00000000c0${n}0`,
  correlationId: `corr-${n}`,
  clientId: 'fsp-bff',
  actingTenantId: null,
  actSessionId: null,
  timestampUtc: at,
});

const page = (content: AuditRow[]): AuditPage => ({
  content, totalElements: content.length, totalPages: 1, number: 0, size: PAGE_SIZE, first: true, last: true,
});

export const fixtures = {
  'audit.trail.page': {
    default: page([
      row(1, 'APPROVAL_RESOLVED', 'APPROVAL_REQUEST', '2026-11-18T11:22:40Z', true),
      row(2, 'USER_CREATE_REQUESTED', 'PERSON', '2026-11-18T10:05:12Z', false),
      row(3, 'TENANT_VERIFICATION_VERIFIED', 'TENANT', '2026-11-17T16:40:00Z', true),
      row(4, 'PLUGIN_REGISTER_SUBMITTED', 'PLUGIN_TYPE', '2026-11-17T09:12:30Z', false),
      row(5, 'APPROVAL_REJECTED', 'APPROVAL_REQUEST', '2026-11-16T14:00:00Z', true),
    ]),
    empty: page([]),
    error: null,
  },
};
