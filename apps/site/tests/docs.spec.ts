import { expect, test } from "@playwright/test";

test("searches guides locally and handles no results", async ({ page }) => {
  await page.goto("/docs");

  const search = page.getByLabel("Search guides");
  await search.fill("voice");
  const results = page.locator(".docs-guide-grid");
  await expect(
    results.getByRole("link", { name: /Capturing notes/ }),
  ).toBeVisible();
  await expect(
    results.getByRole("link", { name: /Project members/ }),
  ).toHaveCount(0);

  await search.fill("fax machine");
  await expect(
    page.getByRole("heading", { name: "No matching guides" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse all guides" }).click();
  await expect(page.getByText("10 guides")).toBeVisible();
});

test("renders a guide and traverses guide pagination", async ({ page }) => {
  await page.goto("/docs/guides/getting-started");
  await expect(
    page.getByRole("heading", { level: 1, name: "Getting started" }),
  ).toBeVisible();
  await expect(page.getByText("Verified 2026-07-03")).toBeVisible();

  const pagination = page.getByRole("navigation", {
    name: "Guide pagination",
  });
  await pagination.getByRole("link").last().click();
  await expect(page).toHaveURL(/\/docs\/guides\/projects-and-history$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Projects and report history",
    }),
  ).toBeVisible();
});

test("keeps guide navigation usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/guides/capturing-notes");

  const mobileNav = page.locator(".docs-mobile-nav");
  await mobileNav.getByText("Browse guides", { exact: true }).click();
  await expect(
    mobileNav.getByRole("link", { name: "AI generation" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("serves every docs link and image without duplicate ids", async ({
  page,
  request,
}) => {
  await page.goto("/docs");

  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);

  const paths = await page.locator('a[href^="/"]').evaluateAll((links) => [
    ...new Set(links.map((link) => (link as HTMLAnchorElement).getAttribute("href")!)),
  ]);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBeLessThan(400);
  }

  const images = await page.locator('img[src^="/"]').evaluateAll((nodes) => [
    ...new Set(nodes.map((node) => (node as HTMLImageElement).getAttribute("src")!)),
  ]);
  for (const src of images) {
    const response = await request.get(src);
    expect(response.status(), src).toBeLessThan(400);
  }
});

test("uses the branded not-found page for an unknown guide", async ({ page }) => {
  const response = await page.goto("/docs/guides/not-a-real-guide");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "That page is not here." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse guides" })).toBeVisible();
});
