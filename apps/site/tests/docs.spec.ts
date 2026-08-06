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
  const montageCards = page.locator(".docs-montage-card");
  await expect(montageCards).toHaveCount(3);
  const montageDestinations = [
    "/docs/guides/capture-notes-voice",
    "/docs/guides/generate-ai-report",
    "/docs/guides/export-share-pdf",
  ];
  for (const [index, destination] of montageDestinations.entries()) {
    await expect(montageCards.nth(index)).toHaveAttribute(
      "href",
      destination,
    );
  }
  await expect(page.locator(".docs-phone-frame")).toHaveCount(0);
});
test("searches guides locally and stays quiet before a query", async ({
  page,
}) => {
  await page.goto("/docs");

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
  await expect(page.locator(".docs-guide-heading img")).toHaveCount(0);

  const screenshots = page.locator(".docs-step-media img");
  await expect(screenshots).toHaveCount(4);
  await expect(screenshots.first()).toHaveAttribute("alt", /\S+/);
  for (let index = 0; index < (await screenshots.count()); index += 1) {
    await expect(screenshots.nth(index)).toHaveAttribute("src", /^\/_astro\//);
  }

  const fullScreenshotLinks = page.getByRole("link", {
    name: /^View full screenshot for /,
  });
  await expect(fullScreenshotLinks).toHaveCount(4);
  for (let index = 0; index < (await fullScreenshotLinks.count()); index += 1) {
    await expect(fullScreenshotLinks.nth(index)).toHaveAttribute(
      "href",
      /^\/_astro\//,
    );
  }

  const pagination = page.getByRole("navigation", {
    name: "Guide pagination",
  });
  await pagination.getByRole("link", { name: /Export and share a PDF/ }).click();
  await expect(page).toHaveURL(/\/docs\/guides\/export-share-pdf$/);
});

test("opens a full screenshot in a dismissible dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs/guides/generate-ai-report");

  const trigger = page.getByRole("link", {
    name: "View full screenshot for Start a report",
  });
  const guideUrl = page.url();
  const screenshotUrl = await trigger.getAttribute("href");

  await trigger.click();

  await expect(page).toHaveURL(guideUrl);
  const dialog = page.getByRole("dialog", {
    name: "Full screenshot for Start a report",
  });
  await expect(dialog).toBeVisible();
  const fullScreenshot = dialog.getByRole("img", {
    name: "Harpa Pro Reports list with the New report button",
  });
  await expect(fullScreenshot).toHaveAttribute("src", screenshotUrl ?? "");
  await expect
    .poll(() =>
      fullScreenshot.evaluate(
        (image) => (image as HTMLImageElement).complete,
      ),
    )
    .toBe(true);
  await expect(dialog.getByText("Start a report", { exact: true })).toBeVisible();

  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    Math.abs(
      (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2 - (viewport?.width ?? 0) / 2,
    ),
  ).toBeLessThanOrEqual(1);
  expect(bounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );

  const fit = await fullScreenshot.evaluate((image) => {
    const fullImage = image as HTMLImageElement;
    const imageRegion = image.closest<HTMLElement>(
      ".docs-screenshot-dialog-image",
    );
    if (!imageRegion) throw new Error("Screenshot image region is missing");

    const imageBounds = image.getBoundingClientRect();
    const regionBounds = imageRegion.getBoundingClientRect();
    return {
      imageBottom: imageBounds.bottom,
      imageHeight: imageBounds.height,
      imageTop: imageBounds.top,
      imageWidth: imageBounds.width,
      naturalHeight: fullImage.naturalHeight,
      naturalWidth: fullImage.naturalWidth,
      regionBottom: regionBounds.bottom,
      regionClientHeight: imageRegion.clientHeight,
      regionScrollHeight: imageRegion.scrollHeight,
      regionTop: regionBounds.top,
    };
  });
  expect(fit.naturalWidth).toBeGreaterThan(0);
  expect(fit.naturalHeight).toBeGreaterThan(0);
  expect(fit.regionScrollHeight).toBeLessThanOrEqual(
    fit.regionClientHeight + 1,
  );
  expect(fit.imageTop).toBeGreaterThanOrEqual(fit.regionTop - 1);
  expect(fit.imageBottom).toBeLessThanOrEqual(fit.regionBottom + 1);
  expect(fit.imageWidth / fit.imageHeight).toBeCloseTo(
    fit.naturalWidth / fit.naturalHeight,
    2,
  );

  await dialog.getByRole("button", { name: "Close full screenshot" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("keeps modified screenshot clicks as native new-tab links", async ({
  page,
}) => {
  await page.goto("/docs/guides/generate-ai-report");

  const trigger = page.getByRole("link", {
    name: "View full screenshot for Start a report",
  });
  const screenshotUrl = await trigger.getAttribute("href");
  expect(screenshotUrl).not.toBeNull();

  const modifier: "Meta" | "Control" =
    process.platform === "darwin" ? "Meta" : "Control";
  const newPagePromise = page.context().waitForEvent("page", {
    timeout: 3_000,
  });
  await trigger.click({ modifiers: [modifier] });
  const imagePage = await newPagePromise;

  await expect(imagePage).toHaveURL(
    new URL(screenshotUrl ?? "", page.url()).href,
  );
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await imagePage.close();
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

  const docsScreenshots = page.locator(".docs-montage img");
  await expect(page.locator(".docs-montage-card")).toHaveCount(3);
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
