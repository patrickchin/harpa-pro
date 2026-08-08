import { defineConfig, devices } from '@playwright/test';

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const apiPort = portFromEnv('ADMIN_E2E_API_PORT', 8787);
const adminPort = portFromEnv('ADMIN_E2E_SITE_PORT', 3102);
const apiBaseUrl = `http://localhost:${apiPort}`;
const adminOrigin = `http://localhost:${adminPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-activity.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results/admin-activity',
  use: {
    baseURL: adminOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        `ADMIN_E2E_SITE_PORT=${adminPort} ` +
        'corepack pnpm --filter @harpa/api exec tsx scripts/start-admin-activity-e2e.ts',
      url: `${apiBaseUrl}/admin/readyz`,
      reuseExistingServer: false,
      // The harness starts and migrates independent app and admin Postgres
      // containers so it exercises the production database boundary.
      timeout: 180_000,
    },
    {
      command:
        `PUBLIC_API_BASE_URL=${apiBaseUrl} ` +
        `PUBLIC_SITE_BASE_URL=${adminOrigin} ` +
        `PUBLIC_DASHBOARD_URL=${adminOrigin} ` +
        `corepack pnpm build && corepack pnpm exec astro preview --host localhost --port ${adminPort}`,
      url: `${adminOrigin}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
