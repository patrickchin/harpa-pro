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
const sitePort = portFromEnv('ADMIN_E2E_SITE_PORT', 3002);
const apiBaseUrl = `http://localhost:${apiPort}`;
const siteOrigin = `http://localhost:${sitePort}`;

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
    baseURL: siteOrigin,
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
      command: 'corepack pnpm --filter @harpa/api exec tsx scripts/start-admin-activity-e2e.ts',
      url: `${apiBaseUrl}/healthz`,
      reuseExistingServer: false,
      // The harness starts and migrates independent app and admin Postgres
      // containers so it exercises the production database boundary.
      timeout: 180_000,
    },
    {
      command:
        `PUBLIC_API_BASE_URL=${apiBaseUrl} ` +
        'PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA ' +
        `corepack pnpm build && corepack pnpm exec astro preview --host localhost --port ${sitePort}`,
      url: `${siteOrigin}/admin/activity`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
