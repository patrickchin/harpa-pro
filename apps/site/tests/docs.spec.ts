import { expect, test } from "@playwright/test";

const CANONICAL_GUIDES = [
  "/docs/guides/generate-ai-report",
  "/docs/guides/export-share-pdf",
  "/docs/guides/manage-projects",
  "/docs/guides/capture-notes-voice",
  "/docs/guides/collaborate-members",
  "/docs/guides/edit-report-manually",
  "/docs/guides/browse-saved-reports",
  "/docs/guides/getting-started",
  "/docs/guides/your-account",
] as const;

test("presents two core workflows and concise supporting tasks", async ({
  page,
}) => {
  await page.goto("/docs");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "What do you want to do?",
    }),
  ).toBeVisible();
  await expect(page.locator("#core-workflows-heading")).toBeVisible();
  await expect(page.locator(".docs-core-grid > *")).toHaveCount(2);
  await expect(page.locator(".docs-everyday-grid > *")).toHaveCount(5);
  await expect(page.locator(".docs-setup-links li")).toHaveCount(2);
  await expect(page.locator(".docs-guide-grid")).toHaveCount(0);
});

test("searches guides locally and stays quiet before a query", async ({
  page,
}) => {
  await page.goto("/docs");

  await expect(
    page.locator('astro-island[component-export="DocsSearch"]:not([ssr])'),
  ).toBeAttached();
  const search = page.getByLabel("Search guides");
  await search.fill("voice");
  const results = page.locator(".docs-guide-grid");
  await expect(
    results.getByRole("link", {
      name: "Capture notes, photos, and voice notes",
    }),
  ).toBeVisible();
  await expect(
    results.getByRole("link", { name: "Add members to a project" }),
  ).toHaveCount(0);

  await search.fill("fax machine");
  await expect(
    page.getByRole("heading", { name: "No matching guides" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".docs-guide-grid")).toHaveCount(0);
});

test("renders the core workflow with optimized screenshots and pagination", async ({
  page,
}) => {
  await page.goto("/docs/guides/generate-ai-report");
  await expect(
    page.getByRole("heading", { level: 1, name: "Generate an AI report" }),
  ).toBeVisible();
  await expect(page.locator(".docs-step")).toHaveCount(5);

  const screenshots = page.locator(
    ".docs-guide-heading img, .docs-step .docs-phone-frame img",
  );
  await expect(screenshots.first()).toHaveAttribute("alt", /\S+/);
  for (let index = 0; index < (await screenshots.count()); index += 1) {
    await expect(screenshots.nth(index)).toHaveAttribute("src", /^\/_astro\//);
  }

  const pagination = page.getByRole("navigation", {
    name: "Guide pagination",
  });
  await pagination.getByRole("link", { name: /Export and share a PDF/ }).click();
  await expect(page).toHaveURL(/\/docs\/guides\/export-share-pdf$/);
});

test("keeps tier navigation usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/guides/generate-ai-report");

  const mobileNav = page.locator(".docs-mobile-nav");
  await mobileNav.getByText("Browse guides", { exact: true }).click();
  await expect(
    mobileNav.getByRole("link", { name: "Export and share a PDF" }),
  ).toBeVisible();
  await expect(
    mobileNav.getByRole("link", { name: "Your account" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("serves canonical docs links and generated images", async ({
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

  for (const path of CANONICAL_GUIDES) {
    const response = await request.get(path);
    expect(response.status(), path).toBeLessThan(400);
  }

  const images = await page.locator("img").evaluateAll((nodes) => [
    ...new Set(
      nodes.map((node) => (node as HTMLImageElement).getAttribute("src")!),
    ),
  ]);
  expect(images.length).toBeGreaterThan(0);
  for (const src of images) {
    const response = await request.get(src);
    expect(response.status(), src).toBeLessThan(400);
  }

  const docsScreenshots = page.locator(".docs-phone-frame img");
  expect(await docsScreenshots.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await docsScreenshots.count()); index += 1) {
    await expect(docsScreenshots.nth(index)).toHaveAttribute(
      "src",
      /^\/_astro\//,
    );
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
