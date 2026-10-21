import { expect, test } from "@playwright/test";

test("keeps the unreleased dashboard out of public navigation", async ({
  page,
}) => {
  await page.goto("/");

  const desktopNav = page.locator("header nav");
  const desktopDashboard = desktopNav.getByRole("link", {
    name: "Dashboard",
    exact: true,
  });
  await expect(desktopDashboard).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator("details.site-menu");
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();

  const mobileDashboard = mobileMenu.getByRole("link", {
    name: "Dashboard",
    exact: true,
  });
  await expect(mobileDashboard).toHaveCount(0);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps procurement and reporting destinations usable without JavaScript", async ({
  browser, baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const mobile = width < 768;
      const menu = mobile
        ? page.locator("[data-mobile-menu]")
        : page.locator('[data-mega-menu="procurement"]');
      await menu.locator("summary").click();
      const procurement = mobile ? menu.locator("[data-mobile-procurement]") : menu;
      await expect(procurement.getByRole("link")).toHaveCount(4);
      await expect(procurement.getByRole("link", { name: "Procurement Overview", exact: true }))
        .toHaveAttribute("href", "/");
      await expect(procurement.getByRole("link", { name: "Products and factories", exact: true }))
        .toHaveAttribute("href", "/#factory-partners");
      await expect(procurement.getByRole("link", { name: "Our process", exact: true }))
        .toHaveAttribute("href", "/#considerations");
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      expect((await page.locator("[data-site-header] > div").boundingBox())!.height).toBe(64);
      await procurement.getByRole("link", { name: "How to Buy from China", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "How to buy from China" }))
        .toBeVisible();
      const reporting = mobile
        ? page.locator("[data-mobile-site-reporting]")
        : page.locator('[data-mega-menu="site-reporting"]');
      await page.locator(mobile ? "[data-mobile-menu] summary" : '[data-mega-menu="site-reporting"] summary')
        .click();
      await expect(reporting.getByRole("link")).toHaveCount(mobile ? 3 : 4);
      await reporting.getByRole("link", { name: "Guides", exact: true }).click();
      await expect(page).toHaveURL(/\/docs$/);
    }
  } finally {
    await context.close();
  }
});
