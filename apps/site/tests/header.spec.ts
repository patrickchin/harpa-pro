import { expect, test } from "@playwright/test";

test("keeps two page links visible on desktop and phones without JavaScript", async ({
  page, browser, baseURL,
}) => {
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  const links = primary.getByRole("link");
  await expect(links).toHaveText(["Home", "How to Buy from China"]);
  await expect(page.locator("[data-site-header] details")).toHaveCount(0);
  await expect(primary.getByRole("link", { name: "Home", exact: true }))
    .toHaveAttribute("aria-current", "page");

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const link of await links.all()) {
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await page.locator("[data-site-header]").boundingBox())!.height)
      .toBeLessThanOrEqual(66);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  const context = await browser.newContext({
    javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 },
  });
  try {
    const noScriptPage = await context.newPage();
    await noScriptPage.goto("/");
    const noScriptNav = noScriptPage.getByRole("navigation", { name: "Primary", exact: true });
    await noScriptNav.getByRole("link", { name: "How to Buy from China", exact: true }).click();
    await expect(noScriptNav.getByRole("link", { name: "How to Buy from China", exact: true }))
      .toHaveAttribute("aria-current", "page");
    await expect(noScriptPage.getByRole("heading", { level: 1, name: "How to buy from China" }))
      .toBeVisible();
    await noScriptNav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(noScriptNav.getByRole("link", { name: "Home", exact: true }))
      .toHaveAttribute("aria-current", "page");
  } finally {
    await context.close();
  }
});
