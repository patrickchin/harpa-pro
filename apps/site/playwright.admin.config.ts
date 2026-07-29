import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "admin-activity.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  outputDir: "test-results/admin-activity",
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "corepack pnpm --filter @harpa/api exec tsx " +
        "scripts/start-admin-activity-e2e.ts",
      url: "http://localhost:8787/healthz",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "PUBLIC_API_BASE_URL=http://localhost:8787 " +
        "PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA " +
        "corepack pnpm build && corepack pnpm preview --host localhost",
      url: "http://localhost:3002/admin/activity",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
