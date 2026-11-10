import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("procurement guides are discoverable and retain the country entry points", async ({ page }) => {
  await page.goto("/procurement/how-to-buy-from-china");
  await page.getByRole("link", { name: "Browse all procurement guides" }).click();
  await expect(page).toHaveURL(/\/procurement\/guides$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Procurement guides");
  await page.getByRole("link", { name: "Read the buying guide" }).click();
  for (const country of ["ghana", "kenya", "nigeria", "tanzania"]) {
    await expect(page.locator(`#${country}`)).toHaveCount(1);
  }

  await page.locator('[data-mega-menu="procurement"] > summary').click();
  await expect(page.locator('[data-mega-menu="procurement"]').getByRole("link", { name: "Procurement guides", exact: true })).toHaveAttribute("href", "/procurement/guides");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("details[data-mobile-menu] > summary").click();
  await expect(page.locator("[data-mobile-procurement]").getByRole("link", { name: "Procurement guides", exact: true })).toBeVisible();
});

test("every article in the collection renders without scripts and is listed in the sitemap", async ({ page, request }) => {
  await page.goto("/procurement/guides");
  const articlePaths = await page.locator(".guide-list a").evaluateAll(
    (links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
  );
  const indexImages = await page.locator(".guide-list a").evaluateAll(
    (links) => Object.fromEntries(links.map((link) => [
      new URL((link as HTMLAnchorElement).href).pathname,
      link.querySelector("img") ? {
        alt: link.querySelector("img")!.getAttribute("alt"),
        src: link.querySelector("img")!.getAttribute("src")!,
      } : undefined,
    ])),
  );
  for (const image of Object.values(indexImages)) {
    if (!image) continue;
    expect(image.alt).toMatch(/^Generated illustration of /);
    expect((await request.get(image.src)).status()).toBe(200);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const entry of await page.locator(".guide-entry-with-image").all()) {
      const image = (await entry.locator("img").boundingBox())!;
      const copy = (await entry.locator(".guide-entry-copy").boundingBox())!;
      expect(image.width).toBe(width >= 768 ? 160 : 80);
      expect(image.height).toBe(image.width);
      expect(copy.x).toBeGreaterThan(image.x + image.width);
      expect(Math.abs(copy.y - image.y)).toBeLessThan(1);
    }
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const heroSources = new Set<string>();
  const socialSources = new Set<string>();
  for (const path of articlePaths) {
    expect(sitemap).toContain(`https://harpapro.com${path}`);
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    const hero = page.locator(".guide-material img");
    const caption = await page.locator(".guide-material figcaption").innerText();
    const heroSource = (await hero.getAttribute("src"))!;
    const socialSource = (await page.locator('meta[property="og:image"]').getAttribute("content"))!;
    const alt = await hero.getAttribute("alt");
    if (indexImages[path]?.src.includes("-thumbnail")) {
      expect(heroSource).not.toContain("-thumbnail");
      expect(socialSource).not.toContain("-thumbnail");
    }
    await expect(hero).toHaveAttribute("width", /^\d+$/);
    await expect(hero).toHaveAttribute("height", /^\d+$/);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", alt!);
    const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)["@graph"] as { "@type": string; image?: string }[];
    expect(graph.find((node) => node["@type"] === "Article")?.image).toBe(socialSource);
    expect((await request.get(heroSource)).status()).toBe(200);
    expect((await request.get(new URL(socialSource).pathname)).status()).toBe(200);
    if (caption.startsWith("Generated illustration")) {
      expect(alt).toMatch(/^Generated illustration of /);
      expect(heroSources.has(heroSource), `${path} uses a distinct hero`).toBe(false);
      expect(socialSources.has(socialSource), `${path} uses a distinct social image`).toBe(false);
      heroSources.add(heroSource);
      socialSources.add(socialSource);
    }
    const headings = page.locator(".article-copy h2");
    expect(await headings.count()).toBeGreaterThan(1);
    const contents = page.getByRole("navigation", { name: "On this page" }).locator("a");
    await expect(contents).toHaveCount(await headings.count());
    const anchor = await contents.first().getAttribute("href");
    await contents.first().click();
    expect(new URL(page.url()).hash).toBe(anchor);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}px`).toBe(true);
    }
    for (const table of await page.locator(".procurement-table-scroll").all()) {
      await expect(table).toHaveAttribute("tabindex", "0");
      await expect(table.locator("table")).toHaveCount(1);
      const overflowing = await table.evaluate((element) => element.scrollWidth > element.clientWidth);
      if (overflowing) {
        await table.focus();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
    }
  }
});
