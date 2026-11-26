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
      await expect(procurement.getByRole("link")).toHaveCount(5);
      await expect(procurement.getByRole("link", { name: "Procurement guides", exact: true }))
        .toHaveAttribute("href", "/procurement/guides");
      await expect(procurement.getByRole("link", { name: /^Procurement Overview/ }))
        .toHaveAttribute("href", "/");
      await expect(procurement.getByRole("link", { name: /^Products and factories/ }))
        .toHaveAttribute("href", "/#factory-partners");
      await expect(procurement.getByRole("link", { name: /^Our process/ }))
        .toHaveAttribute("href", "/#considerations");
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      expect((await page.locator("[data-site-header] > div").boundingBox())!.height).toBe(64);
      await procurement.getByRole("link", { name: /^How to Buy from China/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: "How to buy from China" }))
        .toBeVisible();
      // Procurement pages link to site reporting through one cross-link.
      const crossLink = mobile
        ? page.locator("[data-mobile-also] [data-audience-switch]")
        : page.locator('nav[aria-label="Primary"] > [data-audience-switch]');
      if (mobile) await page.locator("[data-mobile-menu] summary").click();
      await expect(crossLink).toHaveText("Site reporting app");
      await crossLink.click();
      await expect(page).toHaveURL(/\/reports$/);
      await expect(page.locator('[data-mega-menu="procurement"], [data-mobile-procurement]')).toHaveCount(0);
      await expect(page.locator("header nav").getByRole("link", { name: "Dashboard", exact: true }))
        .toHaveCount(0);
      const reporting = mobile
        ? page.locator("[data-mobile-site-reporting]")
        : page.locator('[data-mega-menu="site-reporting"]');
      await page.locator(mobile ? "[data-mobile-menu] summary" : '[data-mega-menu="site-reporting"] summary')
        .click();
      await expect(reporting.getByRole("link")).toHaveCount(mobile ? 3 : 4);
      expect((await page.locator("[data-site-header] > div").boundingBox())!.height).toBe(64);
      await reporting.getByRole("link", { name: /^Guides/ }).click();
      await expect(page).toHaveURL(/\/docs$/);
    }
  } finally {
    await context.close();
  }
});

test("keeps a hover-opened mega menu open on click and toggles from the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.locator('[data-mega-menu="procurement"]');
  const summary = menu.locator("summary");

  await summary.hover();
  await expect(menu).toHaveAttribute("open", "");
  await summary.click();
  await expect(menu).toHaveAttribute("open", "");
  await summary.click();
  await expect(menu).not.toHaveAttribute("open", "");

  await page.mouse.move(20, 700);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(menu).not.toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(menu).not.toHaveAttribute("open", "");
});

test("closes the mobile menu with Escape or an outside tap and locks page scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.locator("[data-mobile-menu]");
  const toggle = menu.locator('summary[aria-label="Toggle menu"]');
  const rootOverflow = () =>
    page.evaluate(() => document.documentElement.style.overflow);

  const toggleBox = (await toggle.boundingBox())!;
  expect(toggleBox.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(menu).toHaveAttribute("open", "");
  await expect.poll(rootOverflow).toBe("hidden");
  // Each section offers only its own primary action.
  const actions = menu.locator("[data-mobile-actions]");
  await expect(actions.getByRole("link")).toHaveCount(1);
  await expect(actions.getByRole("link", { name: "Contact Us", exact: true }))
    .toHaveAttribute("href", "/#contact");

  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(toggle).toBeFocused();
  await expect.poll(rootOverflow).toBe("");

  await toggle.click();
  await expect(menu).toHaveAttribute("open", "");
  await page.mouse.click(195, 830);
  await expect(menu).not.toHaveAttribute("open", "");
  await expect.poll(rootOverflow).toBe("");
  await expect(page).toHaveURL(/\/$/);
});

test("offers the app download as the mobile action on site-reporting pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports/docs");
  await page.locator('[data-mobile-menu] summary[aria-label="Toggle menu"]').click();
  const actions = page.locator("[data-mobile-menu] [data-mobile-actions]");
  await expect(actions.getByRole("link")).toHaveCount(1);
  await expect(actions.getByRole("link", { name: "Get the App", exact: true }))
    .toHaveAttribute("target", "_blank");
});
