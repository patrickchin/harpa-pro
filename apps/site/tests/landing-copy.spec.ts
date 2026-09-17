import { expect, test } from "@playwright/test";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/harpa-pro/id6776759817";

test("uses the complete procurement page as home without a reporting promotion", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.locator("main > section").first();
  await expect(hero.locator("h1")).toHaveText("Interior procurement in China");
  await expect(
    hero.getByText(
      "Haruna Bayoh manages specifications, factory coordination, quality checks, shipping records, and approvals from China.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator("#agent")).toBeVisible();
  await expect(page.locator("#considerations")).toBeVisible();
  await expect(page.locator("#evidence")).toBeVisible();
  await expect(page.locator("#contact")).toBeVisible();
  await expect(page.getByText("Construction site reporting", { exact: true })).toHaveCount(0);
  await expect(page.locator("#app")).toHaveCount(0);
  await expect(page.locator(`main a[href="${APP_STORE_URL}"]`)).toHaveCount(0);

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Haruna Bayoh coordinates specifications, factories, quality checks, shipping records, and project approvals in China.",
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);
});
