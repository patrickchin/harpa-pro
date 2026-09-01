import { expect, test } from "@playwright/test";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/harpa-pro/id6776759817";

test("leads with the report workflow instead of platform launch copy", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.locator("#top");
  await expect(hero.locator("h1")).toContainText(
    /Site Reports.*you talk, we write\./s,
  );
  await expect(hero.locator("p").first()).toContainText(
    "Capture voice notes, photos, and text updates as work happens.",
  );
  await expect(
    hero.getByRole("link", { name: "Get the app", exact: true }),
  ).toHaveAttribute("href", APP_STORE_URL);

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Use Harpa Pro to turn voice notes, photos, and field updates into daily construction reports you can review, edit, finalize, and share.",
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);
});
