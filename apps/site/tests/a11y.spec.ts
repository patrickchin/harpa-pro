import { expect, test } from '@playwright/test';

const SKIP_LINK_ROUTES = [
  '/',
  '/reports',
  '/reports/docs',
  '/reports/roadmap',
  '/privacy',
  '/reports/account-deletion',
  '/procurement/how-to-buy-from-china',
  '/procurement/guides',
] as const;

for (const route of SKIP_LINK_ROUTES) {
  test(`skip link is the first focusable element and targets main on ${route}`, async ({
    page,
  }) => {
    await page.goto(route);

    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(page.locator('main#main-content')).toHaveCount(1);

    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute('href', '#main-content');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });
}

test('skip link is visually hidden until focused', async ({ page }) => {
  await page.goto('/reports');
  const box = await page.getByRole('link', { name: 'Skip to content' }).boundingBox();
  expect(box === null || (box.width <= 1 && box.height <= 1)).toBe(true);
});

test('hero shows static app screenshots and an App Store badge link', async ({ page }) => {
  await page.goto('/reports');
  const screens = page.locator('[data-hero-screens]');

  await expect(screens.locator('img')).toHaveCount(3);
  for (const img of await screens.locator('img').all()) {
    await expect(img).toHaveAttribute('alt', /\S/);
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await expect(screens.getByRole('button')).toHaveCount(0);
  await expect(page.locator('astro-island')).toHaveCount(0);

  const badges = page.getByRole('link', { name: 'Download on the App Store' });
  await expect(badges).toHaveCount(2);
  for (const badge of await badges.all()) {
    await expect(badge).toHaveAttribute('href', 'https://apps.apple.com/us/app/harpa-pro/id6776759817');
    const box = (await badge.locator('img').boundingBox())!;
    // Apple's marketing guidelines: the badge is at least 40px tall.
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
});

test('footer links show a focus outline', async ({ page }) => {
  await page.goto('/reports');

  const footerLink = page.locator('footer').getByRole('link', { name: 'Privacy' });
  await footerLink.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(footerLink).toBeFocused();
  expect(await footerLink.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');

  const badge = page.locator('[data-app-store-badge]').first();
  await badge.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(badge).toBeFocused();
  expect(await badge.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});

for (const route of ['/', '/reports'] as const) {
  test(`footer links are readable with mobile-sized tap targets on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);

    const links = page.locator('[data-site-footer] nav a');
    expect(await links.count()).toBeGreaterThan(0);
    const metrics = await links.evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent?.trim(),
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        height: el.getBoundingClientRect().height,
      })),
    );
    for (const m of metrics) {
      expect(m.fontSize, `${m.text} font size`).toBeGreaterThanOrEqual(14);
      expect(m.height, `${m.text} tap target height`).toBeGreaterThanOrEqual(44);
    }
  });
}
