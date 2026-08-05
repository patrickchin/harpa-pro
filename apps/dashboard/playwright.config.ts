import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

const dashboardUrl = 'http://127.0.0.1:3003';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/live/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'line',
  outputDir: 'test-results',
  use: {
    baseURL: dashboardUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
  webServer: {
    command:
      'VITE_API_BASE_URL=http://localhost:8787 ' +
      'corepack pnpm exec vite --host 127.0.0.1 --port 3003',
    url: `${dashboardUrl}/projects`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
