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
