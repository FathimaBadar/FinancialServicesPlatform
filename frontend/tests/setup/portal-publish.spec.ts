/**
 * portal-publish — dev bootstrap of a SIGNED portal delivery bundle (GAP-7).
 *
 * The admin console is enrolled in signed delivery (fail closed without a bundle). A dev DB
 * has none, so the console never rendered. This flow publishes one the PROPER way — the same
 * path production uses, nothing seeded around the signature:
 *   1. maker (platform-admin) registers every build widget with core (ui.widget.register);
 *   2. the builder seeds the layout from the build-time menu registry ("Reset to today's menus");
 *   3. maker saves the draft and submits it → UI_LAYOUT_PUBLISH approval (four-eyes);
 *   4. checker (admin-checker, a different person) approves → core signs the bundle (ES256).
 * Idempotent: an already-published portal is left alone unless FSP_PUBLISH_FORCE=1.
 *
 * Run: `make portal-publish` (PORTAL=admin by default; any builder portal key works).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

const BASE = process.env.FSP_SPA_URL ?? 'http://localhost:5173';
const PORTAL = process.env.PORTAL ?? 'admin';
const PASS = process.env.FSP_BOOTSTRAP_PASSWORD ?? 'fsp-admin';
const FORCE = process.env.FSP_PUBLISH_FORCE === '1';

async function workbenchSession(browser: Browser, username: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/widget-workbench/registry');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.waitForSelector('#u', { timeout: 30_000 }); // hosted IdP sign-in (FAPI2: no password grant)
  await page.fill('#u', username);
  await page.fill('#p', PASS);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => u.pathname.startsWith('/widget-workbench'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  return page;
}

test(`publish a signed "${PORTAL}" portal bundle (four-eyes)`, async ({ browser }) => {
  const maker = await workbenchSession(browser, 'platform-admin');

  const existing = await maker.request.get(`${BASE}/api/ui/bundles/${PORTAL}`);
  if (existing.status() === 200 && !FORCE) {
    console.log(`portal "${PORTAL}" already has a signed bundle — nothing to do (FSP_PUBLISH_FORCE=1 to republish)`);
    return;
  }

  // 1. register every build widget that core does not hold at this version
  await maker.goto('/widget-workbench/registry');
  await maker.waitForLoadState('networkidle');
  for (let i = 0; i < 50; i++) {
    const next = maker.getByRole('button', { name: /^Register \d/ }).first();
    if ((await next.count()) === 0) break;
    await next.click();
    await maker.waitForLoadState('networkidle');
  }
  await expect(maker.getByRole('button', { name: /^Register \d/ })).toHaveCount(0);

  // 2. seed the layout from today's menus, 3. save + submit (maker)
  await maker.goto(`/widget-workbench/builder?portal=${PORTAL}`);
  await maker.getByRole('button', { name: "Reset to today's menus" }).click();
  await maker.getByRole('button', { name: /Click again/ }).click();
  await maker.getByRole('button', { name: 'Publish', exact: true }).first().click();
  await maker.getByRole('button', { name: 'Save draft to server' }).click();
  await expect(maker.getByText('Draft saved on the server.')).toBeVisible();
  await maker.getByRole('button', { name: 'Submit draft for approval' }).click();
  await expect(maker.getByText(/Submitted\. Another platform administrator approves it/)).toBeVisible();

  // 4. a DIFFERENT person approves → core publishes + signs
  const checker = await workbenchSession(browser, 'admin-checker');
  await checker.goto(`/widget-workbench/builder?portal=${PORTAL}&view=publish`);
  await checker.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(checker.getByText(`Published: the ${PORTAL} portal draws this layout on its next load.`)).toBeVisible();

  const bundle = await checker.request.get(`${BASE}/api/ui/bundles/${PORTAL}`);
  expect(bundle.status(), 'signed bundle is now delivered').toBe(200);
  console.log(`portal "${PORTAL}" published and signed`);
});
