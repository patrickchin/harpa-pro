import { expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8787";
const SITE_ORIGIN = "http://localhost:3002";
const ADMIN_EMAIL = "admin-activity@e2e.harpapro.com";
const ADMIN_PASSWORD = "admin-activity-e2e-password";

test("shows persisted business activity through admin cookie auth", async ({
  context,
  page,
}) => {
  await page.goto("/admin/activity");

  const login = await page.evaluate(
    async ({ apiBaseUrl, email, password }) => {
      const response = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return { ok: response.ok, status: response.status };
    },
    { apiBaseUrl: API_BASE_URL, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  );
  expect(login).toEqual({ ok: true, status: 200 });

  const sessionCookie = (await context.cookies(API_BASE_URL)).find((cookie) =>
    cookie.name.endsWith("session_token"),
  );
  expect(sessionCookie).toMatchObject({
    domain: "localhost",
    httpOnly: true,
  });

  const activityResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === "/admin/activity" &&
      response.request().method() === "GET"
    );
  });
  await page.reload();
  const activityResponse = await activityResponsePromise;

  expect(activityResponse.status()).toBe(200);
  expect(activityResponse.headers()["access-control-allow-origin"]).toBe(
    SITE_ORIGIN,
  );
  expect(activityResponse.headers()["access-control-allow-credentials"]).toBe(
    "true",
  );
  expect((await activityResponse.request().allHeaders()).cookie).toContain(
    `${sessionCookie!.name}=`,
  );

  await expect(
    page.getByRole("heading", { level: 1, name: "Harpa Pro activity" }),
  ).toBeVisible();

  const row = page.locator("tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Report created");
  await expect(row).toContainText("Admin Activity E2E");
  await expect(row).toContainText("Admin Activity E2E Project");
  await expect(row).toContainText("Report #7");

  await row.getByRole("button", { name: "Report #7" }).click();
  const detail = page.getByRole("dialog", { name: "Report #7" });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByText("request-admin-activity-e2e", { exact: true }),
  ).toBeVisible();
  await expect(detail.locator("pre")).toContainText('"reportNumber": 7');
});
