import { expect, test } from "@playwright/test";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/harpa-pro/id6776759817";

test("leads with Haruna and keeps the reporting app secondary", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.locator("#top");
  await expect(hero.locator("h1")).toHaveText("Your procurement agent in China.");
  await expect(
    hero.getByText(
      "Haruna turns your design brief into a practical plan for sourcing and production.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    hero.getByRole("link", { name: "Meet Haruna", exact: true }),
  ).toHaveAttribute("href", "/agents");
  await expect(hero.getByRole("link", { name: "Get the app", exact: true })).toHaveCount(0);

  const app = page.locator("#app");
  await expect(app.getByRole("heading", { name: "Site reports, when you need them." })).toBeVisible();
  await expect(app.getByRole("link", { name: "Get the app", exact: true })).toHaveAttribute(
    "href",
    APP_STORE_URL,
  );

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Meet Haruna, your procurement agent in China. Follow each stage from the design brief and factory match to quality checks, shipment, and delivery.",
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);
});
