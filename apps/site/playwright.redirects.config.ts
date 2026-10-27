import { defineConfig } from '@playwright/test';

// Astro preview does not apply Pages redirects. Build before running this suite.
export default defineConfig({
  testDir: './tests',
  testMatch: 'redirects.spec.ts',
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:3005' },
  webServer: {
    command: 'corepack pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port 3005 --inspector-port 0',
    url: 'http://127.0.0.1:3005/reports/docs',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
