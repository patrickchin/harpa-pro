import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

const dashboardUrl = process.env.DASHBOARD_LIVE_BASE_URL;

if (!dashboardUrl) {
  throw new Error('DASHBOARD_LIVE_BASE_URL is required for live dashboard journeys.');
}

export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results-live',
  timeout: 360_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: dashboardUrl,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
