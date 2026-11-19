/**
 * gap-probes.spec.ts — one probe per gap in docs/onboarding-script-steps.md §"Gap register".
 *
 * Every probe asserts the FIXED behaviour, so:
 *   - against the pre-fix stack each probe FAILS (that failure is the proof the gap exists);
 *   - once the gap is closed the probe PASSES and stays as a regression guard.
 *
 * Setup uses only flows that already existed before the fixes (platform creates a PSP,
 * installs the KYC plugin). Probes then drive the REAL portal UI wherever a screen is
 * the subject of the gap.
 *
 * Run: `bun run test:e2e tests/e2e/gap-probes.spec.ts` with the full dev stack up
 * (`make infra-up tb-start backend-idp backend-core backend-gateway backend-bff
 * backend-plugin-kyc frontend-dev`). GAP-7 also needs `make portal-publish` once per DB.
 */
import { expect, test, type Browser } from '@playwright/test';
import {
  api, BOOT_PASS, createManufacturer, ensureKycPlugin, NO_ACCESS_WALL, PERSON_PASS, PLATFORM_TENANT_ID,
  pendingApproval, sessionUser, signIn, suffix, UNREGISTERED_WIDGET,
  type PspFixture, type Session,
} from './support';

// 'default' (not 'serial'): one worker keeps the order, but a failing probe never skips the
// others — each gap must report independently.
test.describe.configure({ mode: 'default' });

let platformMaker: Session;
let platformChecker: Session;
let psp: PspFixture;
let mfrAdmin: Session;
let mfrChecker: Session;

async function setup(browser: Browser) {
  platformMaker = await signIn(browser, 'platform maker', '/admin', 'platform-admin', BOOT_PASS);
  platformChecker = await signIn(browser, 'platform checker', '/admin', 'admin-checker', BOOT_PASS);
  await ensureKycPlugin(platformMaker, platformChecker);
  psp = await createManufacturer(platformMaker, platformChecker);
  mfrAdmin = await signIn(browser, 'manufacturer admin', '/manufacturer', psp.adminUsername, PERSON_PASS);
  mfrChecker = await signIn(browser, 'manufacturer checker', '/manufacturer', psp.checkerUsername, PERSON_PASS);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  await setup(browser);
});

interface MePermissions { permissions: string[]; checker: boolean }
async function me(s: Session): Promise<MePermissions> {
  const { status, json } = await api<MePermissions>(s, 'GET', '/me/permissions');
  expect(status, `${s.name}: /me/permissions`).toBe(200);
  return json;
}

/* ─────────────────────────── GAP-1 · rights of a freshly provisioned org ─────────────────────────── */

test('GAP-1a · a new PSP admin can onboard children, manage users and roles (no SQL shim)', async () => {
  const held = (await me(mfrAdmin)).permissions;
  for (const k of ['org.onboard_child', 'org.create', 'kyc.review', 'screening.run', 'user.manage', 'role.view', 'role.manage']) {
    expect(held, `manufacturer TENANT_ADMIN must hold ${k}`).toContain(k);
  }
});

test('GAP-1b · a new PSP checker can decide KYC, user and role requests', async () => {
  const held = (await me(mfrChecker)).permissions;
  for (const k of ['kyc.review', 'kyc.approve', 'kyc.reject', 'user.manage', 'role.view', 'role.manage']) {
    expect(held, `manufacturer TENANT_CHECKER must hold ${k}`).toContain(k);
  }
});

test('GAP-1c · roles API: a role change is four-eyes, maker cannot approve, checker applies it', async () => {
  interface RoleView { id: string; key: string; permissionKeys: string[]; version: number; pendingApprovalId: string | null }
  const list = await api<RoleView[]>(mfrAdmin, 'GET', `/tenants/${psp.tenantId}/roles`);
  expect(list.status, `GET roles: ${JSON.stringify(list.json)}`).toBe(200);
  const checkerRole = list.json.find((r) => r.key === 'TENANT_CHECKER');
  expect(checkerRole, 'TENANT_CHECKER role listed').toBeDefined();
  expect(checkerRole!.permissionKeys).not.toContain('period.open');

  // maker proposes adding period.open (a key the maker holds — no escalation)
  const proposed = [...checkerRole!.permissionKeys, 'period.open'];
  const change = await api<RoleView>(mfrAdmin, 'PATCH', `/tenants/${psp.tenantId}/roles/${checkerRole!.id}`, {
    permissionKeys: proposed, expectedVersion: checkerRole!.version,
  });
  expect(change.status, `role change staged: ${JSON.stringify(change.json)}`).toBe(202);
  expect(change.json.pendingApprovalId).toBeTruthy();

  // nothing applied yet
  const mid = await api<RoleView>(mfrAdmin, 'GET', `/tenants/${psp.tenantId}/roles/${checkerRole!.id}`);
  expect(mid.json.permissionKeys).not.toContain('period.open');

  // the maker can never approve their own request
  const self = await api<{ code: string }>(mfrAdmin, 'POST', `/approvals/${change.json.pendingApprovalId}/approve`, { reason: 'self' });
  expect(self.status).toBe(403);
  expect(self.json.code).toBe('MAKER_CANNOT_APPROVE');

  // escalation guard: proposing a key the maker does not hold is refused
  const esc = await api<{ code: string }>(mfrAdmin, 'POST', `/tenants/${psp.tenantId}/roles`, {
    key: `ESCALATE_${suffix().toUpperCase()}`, name: 'Escalation probe', permissionKeys: ['platform.bootstrap'],
  });
  expect(esc.status).toBe(403);
  expect(esc.json.code).toBe('ROLE_NOT_ASSIGNABLE');

  // checker approves → applied
  const ok = await api(mfrChecker, 'POST', `/approvals/${change.json.pendingApprovalId}/approve`, { reason: 'probe' });
  expect(ok.status, `checker approves: ${JSON.stringify(ok.json)}`).toBe(200);
  const after = await api<RoleView>(mfrAdmin, 'GET', `/tenants/${psp.tenantId}/roles/${checkerRole!.id}`);
  expect(after.json.permissionKeys).toContain('period.open');
  expect(after.json.pendingApprovalId).toBeNull();
});

test('GAP-1d · roles screen: the admin sees the role matrix in the portal', async () => {
  const page = mfrAdmin.page;
  await page.goto('/manufacturer/rbac');
  await expect(page.locator('[data-widget="rbac.matrix"]')).toBeVisible();
  await expect(page.getByText('TENANT_CHECKER', { exact: true })).toBeVisible();
});

/* ─────────────────────────── GAP-9 · auto-provisioned checkers are designated checkers ─────────────── */

test('GAP-9 · the auto-provisioned PSP checker carries the checker flag', async () => {
  expect((await me(mfrChecker)).checker, 'TenantService must flag the PSP checker is_checker=true').toBe(true);
  expect((await me(mfrAdmin)).checker, 'the admin (maker) must NOT be flagged').toBe(false);
});

/* ─────────────────────────── GAP-5 · manufacturer portal eligibility ─────────────────────────── */

test('GAP-5 · manufacturer personnel land in a rendered portal, not the no-access wall', async () => {
  const page = mfrAdmin.page;
  await page.goto('/manufacturer/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(NO_ACCESS_WALL)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Portal navigation' })).toBeVisible();
  const { json } = await api<{ subType: string | null }>(mfrAdmin, 'GET', `/tenants/${psp.tenantId}`);
  expect(json.subType, 'PSP tenants are stamped MANUFACTURER').toBe('MANUFACTURER');
});

/* ─────────────────────────── GAP-6 · merchant portal entry ─────────────────────────── */

test('GAP-6 · /merchant is a real portal entry (boots its own app and reaches the IdP sign-in)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/merchant/login');
  await page.waitForSelector('#u', { timeout: 30_000 });
  // and the return_to anchors back on /merchant
  expect(new URL(page.url()).pathname).toContain('/idp/');
  await ctx.close();
});

/* ─────────────────────────── GAP-7 · admin console renders its signed menu ─────────────────────────── */

test('GAP-7 · the admin console verifies a signed bundle and renders its menu', async () => {
  const page = platformMaker.page;
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/UI metadata tampered/)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Portal navigation' })).toBeVisible();
});

/* ─────────────────────────── GAP-2 · every menu point renders a registered widget ─────────────────── */

test('GAP-2 · no menu screen of the manufacturer portal is an unregistered placeholder', async () => {
  const page = mfrAdmin.page;
  for (const link of ['/onboarding', '/network', '/users', '/kyc/reviews', '/kyc', '/approvals', '/journal',
                      '/audit', '/rbac', '/permissions', '/ledger', '/periods', '/overview']) {
    await page.goto(`/manufacturer${link}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(UNREGISTERED_WIDGET), `screen ${link}`).toHaveCount(0);
  }
});

test('GAP-2b · onboarding screen offers the KYC application form', async () => {
  const page = mfrAdmin.page;
  await page.goto('/manufacturer/onboarding');
  await expect(page.locator('[data-widget="kyc.manage"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New application' })).toBeVisible();
});

/* ─────────────────────────── GAP-8 + GAP-3 · staged user + approvals screen ─────────────────────────── */

test('GAP-8 · a staged (PENDING) user shows who must act next', async () => {
  const username = await stageUser('probe.user');

  const page = mfrAdmin.page;
  await page.goto(`/manufacturer/users?q=${username}`);
  await expect(page.getByText(username)).toBeVisible();
  await expect(page.getByText('Awaiting approval').first()).toBeVisible();
});

async function stageUser(prefix: string): Promise<string> {
  const { json: roles } = await api<{ id: string; key: string }[]>(mfrAdmin, 'GET', `/tenants/${psp.tenantId}/user-roles`);
  const role = roles.find((r) => r.key === 'TENANT_CHECKER');
  expect(role, 'TENANT_CHECKER role option').toBeDefined();
  const username = `${prefix}.${suffix()}`;
  const staged = await api(mfrAdmin, 'POST', `/tenants/${psp.tenantId}/users`, {
    username, fullName: 'Probe User', roleIds: [role!.id], checker: false,
  });
  expect(staged.status, `user staged: ${JSON.stringify(staged.json)}`).toBe(202);
  return username;
}

/* ─────────────── USERS-PAGE · user #21+ is reachable (server-side paging, search, counts) ─────────────── */

test('USERS-PAGE · the users list is a server page: user #21+ is reachable and searchable', async () => {
  // 21 staged users guarantee the org overflows one default page (20)
  const tag = `probe.page.${suffix()}`;
  const names: string[] = [];
  for (let i = 0; i < 21; i++) {
    const username = `${tag}.${String(i).padStart(2, '0')}`;
    const r = await api(mfrAdmin, 'POST', `/tenants/${psp.tenantId}/users`, { username, fullName: `Page Probe ${i}`, roleIds: [], checker: false });
    expect(r.status, `user staged: ${JSON.stringify(r.json)}`).toBe(202);
    names.push(username);
  }

  type Page = { items: { username: string }[]; page: number; size: number; totalElements: number; hasNext: boolean; counts: Record<string, number> };
  const base = `/tenants/${psp.tenantId}/users`;
  const first = await api<Page>(mfrAdmin, 'GET', `${base}?q=${tag}&status=PENDING&sort=username,asc&size=20&page=0`);
  expect(first.json.items).toHaveLength(20);
  expect(first.json.totalElements).toBe(21);
  expect(first.json.hasNext).toBe(true);
  expect(first.json.counts.PENDING).toBeGreaterThanOrEqual(21);

  const second = await api<Page>(mfrAdmin, 'GET', `${base}?q=${tag}&status=PENDING&sort=username,asc&size=20&page=1`);
  expect(second.json.items.map((u) => u.username)).toEqual([names[20]]);

  const bad = await api(mfrAdmin, 'GET', `${base}?sort=passwordHash,asc`);
  expect(bad.status).toBe(400);

  // the screen pages too: the 21st user is on page 2, not silently dropped
  const page = mfrAdmin.page;
  await page.goto(`/manufacturer/users?q=${tag}&status=PENDING`);
  await expect(page.getByText('1–20 of 21 users')).toBeVisible();
  await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(page.getByText(names[20])).toBeVisible();
});

test('GAP-3 · the checker approves a staged user from the Approvals screen (click, not API)', async () => {
  await stageUser('probe.queue');
  const row = await pendingApproval(mfrChecker, psp.tenantId, 'USER_CREATE');
  expect(row, 'a pending USER_CREATE').toBeDefined();
  const page = mfrChecker.page;
  await page.goto('/manufacturer/approvals');
  const item = page.locator(`[data-approval-id="${row!.id}"]`);
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Approve' }).click();
  await page.getByLabel('Reason').fill('probe: approve from the queue');
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.locator(`[data-approval-id="${row!.id}"]`).getByText('Approved', { exact: true })).toBeVisible();

  const { json } = await api<{ id: string; status: string }[]>(mfrChecker, 'GET', `/approvals?tenantId=${psp.tenantId}`);
  expect(json.find((a) => a.id === row!.id)?.status).toBe('APPROVED');
});

test('GAP-3b · the maker sees no approve control on their own request', async () => {
  await stageUser('probe.own');
  const row = await pendingApproval(mfrChecker, psp.tenantId, 'USER_CREATE');
  const page = mfrAdmin.page;
  await page.goto('/manufacturer/approvals');
  const item = page.locator(`[data-approval-id="${row!.id}"]`);
  await expect(item).toBeVisible();
  await expect(item.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(item.getByText(/your own request/i)).toBeVisible();
});

/* ─────────────────────────── GAP-4 · plugin governance screen ─────────────────────────── */

test('GAP-4 · platform admins see plugin types and installations in the admin console', async () => {
  const list = await api<{ code: string; status: string }[]>(platformMaker, 'GET', '/platform/plugins');
  expect(list.status, 'plugin type list endpoint').toBe(200);
  expect(list.json.some((p) => p.code === 'kyc' && p.status === 'REGISTERED')).toBe(true);

  const inst = await api<{ pluginCode: string; status: string }[]>(platformMaker, 'GET', `/tenants/${psp.tenantId}/plugins`);
  expect(inst.status, 'tenant installations endpoint').toBe(200);
  expect(inst.json.some((i) => i.pluginCode === 'kyc')).toBe(true);

  const page = platformMaker.page;
  await page.goto('/admin/plugins');
  await expect(page.locator('[data-widget="plugins.governance"]')).toBeVisible();
  await expect(page.locator('[data-widget="plugins.governance"]').getByText('kyc', { exact: true })).toBeVisible();
});

/* ─────────────────────────── sanity: platform sessions are what the probes think ─────────── */

test('sanity · platform sessions are authenticated as the seeded pair', async () => {
  expect((await sessionUser(platformMaker)).username).toBe('platform-admin');
  expect((await sessionUser(platformChecker)).username).toBe('admin-checker');
  expect(PLATFORM_TENANT_ID).toMatch(/0001$/);
});
