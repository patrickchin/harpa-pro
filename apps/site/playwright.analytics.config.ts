import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: 'analytics.spec.ts',
  workers: 2,
  use: { ...config.use, baseURL: 'http://127.0.0.1:3004' },
  webServer: {
    command: 'corepack pnpm build && corepack pnpm exec astro preview --host 127.0.0.1 --port 3004 --ignore-lock',
    env: {
      PUBLIC_API_BASE_URL: 'http://localhost:8787',
      PUBLIC_DASHBOARD_URL: 'http://localhost:3003',
      PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      PUBLIC_POSTHOG_KEY: 'phc_analyticsTestOnly',
      PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    },
    url: 'http://127.0.0.1:3004',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
