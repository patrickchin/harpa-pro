import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: /admin-activity\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "line",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? "corepack pnpm preview --host 127.0.0.1"
      : "PUBLIC_API_BASE_URL=http://localhost:8787 " +
        "PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA " +
        "PUBLIC_DASHBOARD_URL=http://127.0.0.1:3003 " +
        "corepack pnpm build && corepack pnpm preview --host 127.0.0.1",
    url: "http://127.0.0.1:3002/docs",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
