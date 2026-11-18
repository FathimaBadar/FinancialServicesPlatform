import { defineConfig, devices } from '@playwright/test';

/**
 * One-shot dev setup flows that drive the REAL UI (not tests of it): `make portal-publish`
 * publishes a signed portal bundle through the four-eyes builder flow (GAP-7).
 */
export default defineConfig({
  testDir: './tests/setup',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.FSP_SPA_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
