/**
 * Fixture answers per logical source (scenario → body), shared by the widget workbench's
 * widget frames and builder canvas. Bodies mirror the wire DTOs (records), so a widget
 * that renders here renders against the live API. Scenarios: default · empty · error ·
 * not-ready (the gateway's 503 PLUGIN_NOT_READY). Plugin widgets contribute resolvers that
 * play their server (kyc/manage/fixture-server.ts).
 */
import type { FixtureScenario, FixtureSet } from './core/ports';
import { KYC_MANAGE_FIXTURES } from './kyc/manage/fixture-server';
import { WIDGET_DATA } from './core/sources';

export type Scenario = FixtureScenario;
export type { FixtureSet };
export const SCENARIOS: readonly Scenario[] = ['default', 'empty', 'error', 'not-ready'];

/** What each scenario should make a widget show (the workbench scenario picker label). */
export const SCENARIO_EXPECT: Record<Scenario, string> = {
  default: 'ready',
  empty: 'empty state',
  error: 'error state',
  'not-ready': 'plugin not enabled (503)',
};

const WB_ORG = '00000000-0000-0000-0000-0000000000a1';
const WB_ROLES: Record<string, string> = { 'org-admin': 'Organization admin', maker: 'Maker', checker: 'Checker' };
function wbUser(n: string, username: string, fullName: string, status: string, roles: string[]) {
  const ts = '2026-11-01T09:00:00Z';
  return {
    id: `00000000-0000-0000-0000-0000000002${n}`, tenantId: WB_ORG, username, fullName,
    email: `${username}@example.com`, phone: null, status, isApplicant: false, checker: false,
    roles: roles.map((k, i) => ({ id: `00000000-0000-0000-0000-0000000003a${i + 1}`, key: k, name: WB_ROLES[k] ?? k })),
    version: 0, createdAt: ts, updatedAt: ts, archivedAt: status === 'ARCHIVED' ? ts : null,
  };
}

/** fixtures contributed by widget folders' data.ts (built-in entries below win on a clash) */
const CONTRIBUTED: FixtureSet = Object.assign({}, ...Object.values(WIDGET_DATA).map((m) => (m.fixtures ?? {}) as FixtureSet));

export const FIXTURES: FixtureSet = {
  ...CONTRIBUTED,
  ...KYC_MANAGE_FIXTURES,
  'kyc.orgs.self': {
    default: {
      id: '00000000-0000-0000-0000-0000000000a1',
      legalName: 'Namibia Coffee Roasters (Pty) Ltd',
      subType: 'MANUFACTURER',
      status: 'ACTIVE',
      type: 'TENANT', depth: 2, hierarchyPath: '/1/a1',
    },
    empty: null,
    error: null,
  },
  'kyc.orgs.tree': {
    default: [
      { id: '00000000-0000-0000-0000-0000000000b1', legalName: 'Coastal Distributors CC', subType: 'DISTRIBUTOR', status: 'PENDING', type: 'TENANT' },
      { id: '00000000-0000-0000-0000-0000000000c1', legalName: 'North Wholesalers', subType: 'WHOLESALER', status: 'ACTIVE', type: 'TENANT' },
    ],
    empty: [],
    error: null,
  },
  'users.org': {
    default: { id: WB_ORG, legalName: 'Namibia Coffee Roasters (Pty) Ltd', depth: 2, type: 'TENANT', parentTenantId: null },
    empty: { id: WB_ORG, legalName: 'Namibia Coffee Roasters (Pty) Ltd', depth: 2, type: 'TENANT', parentTenantId: null },
    error: null,
  },
  'users.org.children': { default: [], empty: [], error: null },
  'users.roles': {
    default: [
      { id: '00000000-0000-0000-0000-0000000003a1', key: 'org-admin', name: 'Organization admin', scope: 'TENANT', permissionCount: 9, assignable: true },
      { id: '00000000-0000-0000-0000-0000000003a2', key: 'maker', name: 'Maker', scope: 'TENANT', permissionCount: 4, assignable: true },
      { id: '00000000-0000-0000-0000-0000000003a3', key: 'checker', name: 'Checker', scope: 'TENANT', permissionCount: 3, assignable: false },
    ],
    empty: [],
    error: null,
  },
  'users.list': {
    default: [
      wbUser('d1', 'anna.shikongo', 'Anna Shikongo', 'ACTIVE', ['org-admin']),
      wbUser('d2', 'johannes.kapuka', 'Johannes Kapuka', 'ACTIVE', ['maker']),
      wbUser('d3', 'maria.nghipondoka', 'Maria Nghipondoka', 'DISABLED', ['checker']),
      wbUser('d4', 'peter.amutenya', 'Peter Amutenya', 'ACTIVE', []),
      wbUser('d5', 'old.account', 'Old Account', 'ARCHIVED', []),
    ],
    empty: [],
    error: null,
  },
};
