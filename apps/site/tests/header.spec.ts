import { expect, test } from "@playwright/test";

const dashboardUrl = "http://127.0.0.1:3003";

test("opens the dashboard from the public header on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");

  const desktopNav = page.locator("header nav");
  const desktopDashboard = desktopNav.getByRole("link", {
    name: "Dashboard",
    exact: true,
  });
  await expect(desktopDashboard).toBeVisible();
  await expect(desktopDashboard).toHaveAttribute("href", dashboardUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator("details.site-menu");
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();

  const mobileDashboard = mobileMenu.getByRole("link", {
    name: "Dashboard",
    exact: true,
  });
  await expect(mobileDashboard).toBeVisible();
  await expect(mobileDashboard).toHaveAttribute("href", dashboardUrl);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
