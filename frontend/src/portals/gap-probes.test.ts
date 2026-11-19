/**
 * Unit-level gap probes (docs/onboarding-script-steps.md §"Gap register"). Each assertion
 * states the FIXED behaviour: it failed before the gap was closed and guards it after.
 */
import { describe, expect, it } from 'vitest';
import { MENU_ITEMS, firstCodedLink, menuFor, navEntries } from './shared/web-core/menu';
import { getWidget } from './shared/widgets/registry';
import { portalEligible } from './shared/web-core/session-core';
import type { SessionUser, TenantSummary } from './shared/web-core/session-core';
import * as configs from './portal-config';
import type { PortalConfig } from './portal-config';

const user = (tenantType: string): SessionUser =>
  ({ userId: 'u', username: 'u', fullName: 'U', tenantId: 't', tenantName: 'T', tenantType, roles: [] }) as unknown as SessionUser;
const tenant = (type: string, subType: string | null): TenantSummary =>
  ({ id: 't', type, subType, status: 'ACTIVE', legalName: 'T' }) as unknown as TenantSummary;

const allPortals = (): PortalConfig[] =>
  Object.values(configs).filter((v): v is PortalConfig => typeof v === 'object' && v !== null && 'basePath' in v);

describe('GAP-2 · every widget a menu point names is registered', () => {
  const ids = [...new Set(MENU_ITEMS.flatMap((i) => i.widgets))];
  it.each(ids)('%s is in the widgets registry', (id) => {
    expect(getWidget(id), `menu references widget "${id}"`).toBeDefined();
  });
});

describe('GAP-3/4 · approvals queue and plugin governance have menu points', () => {
  it('approvals.queue is reachable by every checker permission', () => {
    const item = MENU_ITEMS.find((i) => i.widgets.includes('approvals.queue'));
    expect(item?.perm).toEqual(expect.arrayContaining(['kyc.approve', 'je.approve', 'user.manage', 'role.manage', 'plugin.manage']));
  });
  it('the admin console keeps an approvals point (user/role changes are four-eyes)', () => {
    expect(menuFor('platform').some((i) => i.widgets.includes('approvals.queue'))).toBe(true);
  });
});

describe('ADMIN-MENU · the admin console shows only the specified menus FSP implements', () => {
  const all = [...new Set(MENU_ITEMS.flatMap((i) => i.perm))];
  it('sidebar is User Management → Back Office User, Organization; Role Management → Role, Approvals', () => {
    const nav = navEntries('platform', () => true).map((e) => (e.kind === 'group' ? `#${e.label}` : e.label));
    expect(nav).toEqual(['#User Management', 'Back Office User', 'Organization', '#Role Management', 'Role', 'Approvals']);
  });
  it('no menu point exists without a feature behind it', () => {
    const labels = menuFor('platform').map((i) => i.label);
    for (const absent of ['Reset Password', 'Customer', 'Component', 'Sub Component', 'Branch', 'Department']) {
      expect(labels).not.toContain(absent);
    }
  });
  it('organization screen offers the directory and PSP creation, gated by their union', () => {
    const org = menuFor('platform').find((i) => i.label === 'Organization');
    expect(org?.widgets).toEqual(expect.arrayContaining(['kyc.orgs', 'onboard.psp']));
    expect(org?.perm).toEqual(expect.arrayContaining(['kyc.review', 'org.create']));
  });
  it('home falls back to a point the portal actually has (never a missing /overview)', () => {
    expect(firstCodedLink('platform', all)).toBe('/users');
    expect(menuFor('platform').map((i) => i.link)).toContain(firstCodedLink('platform', ['role.view']));
    expect(firstCodedLink('platform', [])).toBeNull();
  });
  it('org portals keep their full menu', () => {
    expect(menuFor('org').map((i) => i.link)).toEqual(expect.arrayContaining(
      ['/overview', '/onboarding', '/network', '/users', '/kyc/reviews', '/kyc', '/approvals', '/bank-accounts',
        '/journal', '/audit', '/rbac', '/permissions', '/ledger', '/periods']));
  });
});

describe('GAP-1 · roles screen exists for organizations too', () => {
  it('rbac.matrix is offered on the org portals', () => {
    const portals = MENU_ITEMS.filter((i) => i.widgets.includes('rbac.matrix')).flatMap((i) => i.portals);
    expect(portals).toContain('org');
  });
});

describe('GAP-5 · manufacturer portal admits PSP tenants', () => {
  it('a PSP stamped MANUFACTURER is eligible', () => {
    expect(portalEligible(configs.PORTAL_MANUFACTURER, user('PSP'), tenant('PSP', 'MANUFACTURER'))).toBe(true);
  });
  it('a legacy PSP row with no subType is still eligible (type-aware fallback)', () => {
    expect(portalEligible(configs.PORTAL_MANUFACTURER, user('PSP'), tenant('PSP', null))).toBe(true);
  });
  it('a distributor is NOT eligible for the manufacturer portal', () => {
    expect(portalEligible(configs.PORTAL_MANUFACTURER, user('TENANT'), tenant('TENANT', 'DISTRIBUTOR'))).toBe(false);
  });
});

describe('GAP-6 · merchant portal entry exists', () => {
  it('a MERCHANT portal identity is configured at /merchant', () => {
    const merchant = allPortals().find((p) => p.tenantSubType === 'MERCHANT');
    expect(merchant?.basePath).toBe('/merchant');
  });
  it('merchant tenants are eligible only there', () => {
    const merchant = allPortals().find((p) => p.tenantSubType === 'MERCHANT')!;
    expect(portalEligible(merchant, user('TENANT'), tenant('TENANT', 'MERCHANT'))).toBe(true);
    expect(portalEligible(configs.PORTAL_DISTRIBUTOR, user('TENANT'), tenant('TENANT', 'MERCHANT'))).toBe(false);
  });
});
