import { expect, test } from "@playwright/test";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/harpa-pro/id6776759817";

test("leads with Haruna and keeps the reporting app secondary", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.locator("#top");
  await expect(hero.locator("h1")).toHaveText("Interior procurement in China.");
  await expect(
    hero.getByText(
      "Haruna manages technical specifications, factory coordination, quality control, and shipping documents from China.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    hero.getByRole("link", { name: "Procurement overview", exact: true }),
  ).toHaveAttribute("href", "/agents");
  await expect(
    hero.getByRole("link", { name: "Review areas", exact: true }),
  ).toHaveAttribute("href", "/agents#considerations");
  await expect(hero.locator('a[href="/agents#journey"]')).toHaveCount(0);
  await expect(hero.getByText("Meet Haruna", { exact: true })).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "Get the app", exact: true })).toHaveCount(0);

  const app = page.locator("#app");
  await expect(app.getByRole("heading", { name: "Construction site reporting." })).toBeVisible();
  await expect(app.getByRole("link", { name: "App overview", exact: true })).toHaveAttribute(
    "href",
    "/app",
  );
  await expect(app.getByRole("link", { name: "Get the app", exact: true })).toHaveAttribute(
    "href",
    APP_STORE_URL,
  );

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Interior procurement in China, with technical specifications, factory records, quality control, shipping documents, and project approvals.",
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);
});
