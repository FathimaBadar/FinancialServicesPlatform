/**
 * e2e/onboarding-chain.spec.ts — the complete supply-chain onboarding story
 * (docs/onboarding-script-steps.md), driven through the REAL portals (Vite :5173), the BFF
 * (:8080) and the hosted IdP sign-in page. NO database access: the GAP-1 SQL shim is gone —
 * fresh organizations are born with the rights the story needs (RoleTemplates + V19).
 *
 *   Platform ──creates──▶ Manufacturer (PSP) ──onboards──▶ Distributor
 *   ──onboards──▶ Merchant (+ named checker user, four-eyes) ──posts──▶ first JE
 *
 * [UI]  = clicked in a portal screen     [API] = same signed-in session via /api/**
 * Remaining [API] legs: the KYC application form (a long multi-tab form — its screen is
 * asserted, the filing itself goes through the plugin API) and the journal entry legs.
 *
 * Prereqs: the dev stack (`make infra-up tb-start backend-idp backend-core backend-gateway
 * backend-bff backend-plugin-kyc frontend-dev`) and `make portal-publish` once per DB.
 */
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  api, BOOT_PASS, ensureKycPlugin, kycApplication, NO_ACCESS_WALL, PERSON_PASS, PLATFORM_TENANT_ID,
  pendingApproval, pollUntil, sagaAdminUsername, sessionUser, signIn, suffix, type Session,
} from './support';

test.describe.configure({ mode: 'serial' });

/** [UI] the checker opens Approvals and approves one request by clicking. */
async function approveInUi(checker: Session, portal: string, approvalId: string, reason: string) {
  const page = checker.page;
  await page.goto(`${portal}/approvals`);
  const card = page.locator(`[data-approval-id="${approvalId}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await page.getByLabel('Reason').fill(reason);
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(card.getByText('Approved', { exact: true })).toBeVisible();
}

test('manufacturer → distributor → merchant onboarding chain', async ({ browser }) => {
  test.setTimeout(420_000);

  /* ── SCENE 1 · platform maker + checker, separate contexts (four-eyes at person_id) ── */
  const maker = await signIn(browser, 'platform maker', '/admin', 'platform-admin', BOOT_PASS);
  const checker = await signIn(browser, 'platform checker', '/admin', 'admin-checker', BOOT_PASS);
  expect((await sessionUser(maker)).username).toBe('platform-admin');
  expect((await sessionUser(checker)).username).toBe('admin-checker');
  await expect(maker.page.getByRole('navigation', { name: 'Portal navigation' })).toBeVisible(); // GAP-7 closed

  /* ── SCENE 2 · KYC plugin registered (four-eyes), manufacturer created, plugin installed ── */
  await ensureKycPlugin(maker, checker);

  // [UI] platform onboarding screen (onboard.psp)
  const s = suffix();
  const mfrAdminUsername = `acme.admin.${s}`;
  const mfrCheckerUsername = `acme.checker.${s}`;
  const legalName = `Acme Manufacturers ${s} (Pty) Ltd`;
  await maker.page.goto('/admin/onboarding');
  await maker.page.getByRole('button', { name: 'New organization' }).click();
  await maker.page.getByLabel('Legal name').fill(legalName);
  await maker.page.getByLabel('Administrator username').fill(mfrAdminUsername);
  await maker.page.getByLabel('Administrator name').fill('Acme Administrator');
  await maker.page.getByLabel('Checker username').fill(mfrCheckerUsername);
  await maker.page.getByLabel('Checker name').fill('Acme Checker');
  await maker.page.getByRole('button', { name: 'Create organization' }).click();
  await expect(maker.page.getByText(mfrAdminUsername)).toBeVisible();
  const { json: psps } = await api<{ id: string; legalName: string }[]>(maker, 'GET', `/tenants/${PLATFORM_TENANT_ID}/children`);
  const mfrTenantId = psps.find((t) => t.legalName === legalName)!.id;

  // [UI] plugin installation request (plugins.governance) → [UI] checker approves
  await maker.page.goto(`/admin/plugins?org=${mfrTenantId}`);
  await maker.page.getByLabel('Install plugin').selectOption({ label: 'kyc 1.0.0' });
  await maker.page.getByRole('button', { name: 'Request installation' }).click();
  await expect(maker.page.getByText(/Installation of kyc requested/)).toBeVisible();
  const install = await pendingApproval(checker, mfrTenantId, 'PLUGIN_INSTALL');
  expect(install, 'PLUGIN_INSTALL approval opened').toBeDefined();
  // the install approval lives on the manufacturer tenant; the platform checker decides it there via API
  const ok = await api(checker, 'POST', `/approvals/${install!.id}/approve`, { reason: 'e2e: kyc plugin install' });
  expect(ok.status).toBe(200);

  /* ── SCENE 3 · manufacturer personnel land in a RENDERED portal (GAP-5 closed) ── */
  const mfrAdmin = await signIn(browser, 'manufacturer admin', '/manufacturer', mfrAdminUsername, PERSON_PASS);
  const mfrChecker = await signIn(browser, 'manufacturer checker', '/manufacturer', mfrCheckerUsername, PERSON_PASS);
  await expect(mfrAdmin.page.getByText(NO_ACCESS_WALL)).toHaveCount(0);
  await expect(mfrAdmin.page.getByRole('navigation', { name: 'Portal navigation' })).toBeVisible();
  await pollUntil(async () => (await api(mfrAdmin, 'GET', '/plugins/kyc/master-values?category=ENTITY_TYPE')).status === 200,
    'kyc plugin readiness on the manufacturer');

  /* ── SCENE 4 · manufacturer onboards the DISTRIBUTOR (KYC saga; no SQL shim) ── */
  await mfrAdmin.page.goto('/manufacturer/onboarding');
  await expect(mfrAdmin.page.getByRole('button', { name: 'New application' })).toBeVisible(); // [UI] screen exists (GAP-2)
  const distName = `Sunrise Distribution ${s} (Pty) Ltd`;
  const dist = await api<{ caseId: string; caseNo: string; subjectTenantId: string }>(mfrAdmin, 'POST', '/plugins/kyc/cases',
    kycApplication('DISTRIBUTOR', distName));
  expect(dist.status, `distributor case opened: ${JSON.stringify(dist.json)}`).toBe(201);
  const decided = await api(mfrChecker, 'POST', `/plugins/kyc/cases/${dist.json.caseId}/decisions`,
    { decision: 'APPROVE', reason: 'screening clean, UBO verified', expectedVersion: null });
  expect(decided.status, `distributor case approved: ${JSON.stringify(decided.json)}`).toBe(200);
  const distTenantId = dist.json.subjectTenantId;
  await pollUntil(async () => (await api<{ status: string }>(mfrAdmin, 'GET', `/tenants/${distTenantId}`)).json.status === 'ACTIVE',
    'distributor ACTIVE');
  const distAdminUsername = sagaAdminUsername(distName, dist.json.caseNo);

  /* ── SCENE 5 · distributor portal, fully rendered ── */
  const distAdmin = await signIn(browser, 'distributor admin', '/distributor', distAdminUsername, PERSON_PASS);
  const distChecker = await signIn(browser, 'distributor checker', '/distributor', `checker-${distAdminUsername}`, PERSON_PASS);
  await distAdmin.page.goto('/distributor/network');
  await expect(distAdmin.page.locator('[data-widget="kyc.orgs"]')).toBeVisible();

  /* ── SCENE 6 · distributor onboards the MERCHANT ── */
  const merName = `Namib Fresh Produce ${s} (Pty) Ltd`;
  const mer = await api<{ caseId: string; caseNo: string; subjectTenantId: string }>(distAdmin, 'POST', '/plugins/kyc/cases',
    kycApplication('MERCHANT', merName));
  expect(mer.status, `merchant case opened: ${JSON.stringify(mer.json)}`).toBe(201);
  const merDecided = await api(distChecker, 'POST', `/plugins/kyc/cases/${mer.json.caseId}/decisions`,
    { decision: 'APPROVE', reason: 'screening clean', expectedVersion: null });
  expect(merDecided.status).toBe(200);
  const merTenantId = mer.json.subjectTenantId;
  await pollUntil(async () => (await api<{ status: string }>(distAdmin, 'GET', `/tenants/${merTenantId}`)).json.status === 'ACTIVE',
    'merchant ACTIVE');
  const merAdminUsername = sagaAdminUsername(merName, mer.json.caseNo);

  /* ── SCENE 7 · inside the merchant: a NAMED checker user, four-eyes, in the merchant portal ── */
  const merAdmin = await signIn(browser, 'merchant admin', '/merchant', merAdminUsername, PERSON_PASS);
  const merChecker = await signIn(browser, 'merchant checker', '/merchant', `checker-${merAdminUsername}`, PERSON_PASS);
  await expect(merAdmin.page.getByText(NO_ACCESS_WALL)).toHaveCount(0); // GAP-6 closed
  const { json: roleOptions } = await api<{ id: string; key: string }[]>(merAdmin, 'GET', `/tenants/${merTenantId}/user-roles`);
  const named = `tulonga.checker.${s}`;
  const staged = await api(merAdmin, 'POST', `/tenants/${merTenantId}/users`, {
    username: named, fullName: 'Tulonga Shipanga', email: 'tulonga@namibfresh.example',
    roleIds: [roleOptions.find((r) => r.key === 'TENANT_CHECKER')!.id], checker: true,
  });
  expect(staged.status, 'checker user staged').toBe(202);
  await merAdmin.page.goto(`/merchant/users?q=${named}`);
  await expect(merAdmin.page.getByText('Awaiting approval').first()).toBeVisible(); // GAP-8 closed
  const userCreate = await pendingApproval(merChecker, merTenantId, 'USER_CREATE');
  await approveInUi(merChecker, '/merchant', userCreate!.id, 'e2e: named checker'); // GAP-3 closed
  const tulonga = await signIn(browser, 'named checker', '/merchant', named, PERSON_PASS);
  expect((await sessionUser(tulonga)).username).toBe(named);
  await expect(tulonga.page.getByText(NO_ACCESS_WALL)).toHaveCount(0);

  /* ── SCENE 8 · first money: CoA → balanced JE → four-eyes → FINALIZED ── */
  const { json: books } = await api<{ id: string; status: string }[]>(merAdmin, 'GET', `/tenants/${merTenantId}/books`);
  const bookId = books.find((b) => b.status === 'ACTIVE')!.id;
  expect((await api(merAdmin, 'POST', `/tenants/${merTenantId}/books/${bookId}/provision-default-coa`, {})).status).toBe(200);
  const { json: gl } = await api<{ id: string }[]>(merAdmin, 'GET', `/tenants/${merTenantId}/books/${bookId}/gl-accounts`);
  const je = await api<{ entryId: string }>(merAdmin, 'POST', `/tenants/${merTenantId}/journal-entries`, {
    bookId, postingDate: '2026-12-01', valueDate: '2026-12-01', description: 'Opening float', reference: `e2e-${randomUUID().slice(0, 8)}`,
    lines: [
      { glAccountId: gl[0].id, direction: 'DEBIT', amount: '250000', memo: 'cash in' },
      { glAccountId: gl[gl.length - 1].id, direction: 'CREDIT', amount: '250000', memo: 'revenue' },
    ],
  });
  expect(je.status, `balanced JE created: ${JSON.stringify(je.json)}`).toBe(201);
  expect((await api(merAdmin, 'POST', `/tenants/${merTenantId}/journal-entries/${je.json.entryId}/submit-for-approval`, {})).status).toBe(200);
  expect((await api(merChecker, 'POST', `/tenants/${merTenantId}/journal-entries/${je.json.entryId}/approve`, {})).status).toBe(200);
  const { json: entry } = await api<{ status: string }>(merAdmin, 'GET', `/tenants/${merTenantId}/journal-entries/${je.json.entryId}`);
  expect(entry.status, 'commit confirmed → FINALIZED').toBe('FINALIZED');
  await merAdmin.page.goto(`/merchant/journal?entry=${je.json.entryId}`);
  await expect(merAdmin.page.locator('[data-posting-state="FINALIZED"]').first()).toBeVisible();

  /* ── SCENE 9 · curtain call ── */
  console.log('\n=== ONBOARDING CHAIN COMPLETE ===\n', JSON.stringify({
    manufacturer: mfrTenantId, distributor: distTenantId, merchant: merTenantId, book: bookId, entry: je.json.entryId,
    users: { mfrAdminUsername, mfrCheckerUsername, distAdminUsername, merAdminUsername, named },
  }, null, 2));
  await merAdmin.page.screenshot({ path: 'test-results/chain-final.png', fullPage: true });
});
