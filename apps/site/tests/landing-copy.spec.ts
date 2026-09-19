import { expect, test } from "@playwright/test";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/harpa-pro/id6776759817";

test("uses the complete procurement page as home without a reporting promotion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const hero = page.locator("main > section").first();
  await expect(hero.locator("h1")).toHaveText("Interior procurement in China");
  await expect(
    hero.getByText(
      "We manage specifications, factory coordination, quality checks, shipping records, and approvals from China.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator("#agent")).toBeVisible();
  await expect(page.locator("#considerations")).toBeVisible();
  await expect(page.locator("#evidence")).toBeVisible();
  await expect(page.locator("#contact")).toBeVisible();
  await expect(page.getByText("Construction site reporting", { exact: true })).toHaveCount(0);
  await expect(page.locator("#app")).toHaveCount(0);
  await expect(page.locator(`main a[href="${APP_STORE_URL}"]`)).toHaveCount(0);

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "We coordinate specifications, factories, quality checks, shipping records, and project approvals in China.",
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);

  const agent = page.locator("#agent");
  const [heroBox, agentBox] = await Promise.all([hero.boundingBox(), agent.boundingBox()]);
  expect(heroBox).not.toBeNull();
  expect(agentBox).not.toBeNull();
  expect(heroBox!.height).toBeGreaterThan(agentBox!.height);

  const divider = await page.evaluate(() => {
    const heroSection = document.querySelector<HTMLElement>("#top");
    const agentSection = document.querySelector<HTMLElement>("#agent");
    if (!heroSection || !agentSection) throw new Error("Homepage sections are missing");
    return {
      heroBottom: Number.parseFloat(getComputedStyle(heroSection).borderBottomWidth),
      agentTop: Number.parseFloat(getComputedStyle(agentSection).borderTopWidth),
    };
  });
  expect(divider.heroBottom + divider.agentTop).toBeLessThanOrEqual(1);
});

test("uses collective service copy and keeps Haruna's name in profiles", async ({
  page,
}) => {
  await page.goto("/");

  const profile = page.locator("[data-single-agent-profile]");
  await expect(profile).toContainText("Haruna Bayoh");

  const nonProfileText = await page.locator("body").evaluate((body) => {
    const copy = body.cloneNode(true) as HTMLElement;
    copy.querySelector("[data-single-agent-profile]")?.remove();
    copy.querySelectorAll("script, style").forEach((element) => element.remove());
    return (copy.textContent ?? "").replace(/haruna@harpapro\.com/gi, "");
  });

  expect(nonProfileText).not.toMatch(/\bharuna(?: bayoh)?\b/i);
  await expect(page.getByRole("link", { name: /haruna/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Contact us" })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText("Haruna Bayoh", { exact: true })).toHaveCount(1);

  await page.goto("/not-a-real-page");
  await expect(page.getByRole("link", { name: /haruna/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Contact us", exact: true })).toBeVisible();
});
