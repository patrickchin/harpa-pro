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
      await expect(procurement.getByRole("link", { name: /^Procurement overview/ }))
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
      await procurement.getByRole("link", { name: /^How to buy from China/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: "How to buy from China" }))
        .toBeVisible();
      const reporting = mobile
        ? page.locator("[data-mobile-site-reporting]")
        : page.locator('[data-mega-menu="site-reporting"]');
      await page.locator(mobile ? "[data-mobile-menu] summary" : '[data-mega-menu="site-reporting"] summary')
        .click();
      await expect(reporting.getByRole("link")).toHaveCount(mobile ? 3 : 4);
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
  const actions = menu.locator("[data-mobile-actions]");
  await expect(actions.getByRole("link", { name: "Contact us", exact: true }))
    .toHaveAttribute("href", "/#contact");
  await expect(actions.getByRole("link", { name: "Get the app", exact: true }))
    .toHaveAttribute("target", "_blank");

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
