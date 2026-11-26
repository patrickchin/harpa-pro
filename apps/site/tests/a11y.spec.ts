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
  '/procurement/factory-documents',
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

test('voice demo decorative controls are not focusable; real controls work', async ({
  page,
}) => {
  await page.goto('/reports');
  const demo = page.locator('[data-voice-demo]');

  await expect(demo.getByRole('button', { name: 'Settings' })).toHaveCount(0);
  await expect(demo.getByRole('button', { name: 'Play voice note' })).toHaveCount(0);

  // Wait for the React island to hydrate before driving it via the keyboard.
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const generate = demo.getByRole('button', { name: 'Generate report' });
  await generate.focus();
  await expect(generate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(demo.getByRole('button', { name: 'Reports' })).toBeVisible({ timeout: 10_000 });
});

test('App Store badge links meet the minimum size in the hero and closing CTA', async ({ page }) => {
  await page.goto('/reports');

  const badges = page.getByRole('link', { name: 'Download on the App Store' });
  await expect(badges).toHaveCount(2);
  await expect(page.locator('#top [data-app-store-badge]')).toHaveCount(1);
  await expect(page.locator('[data-closing-cta] [data-app-store-badge]')).toHaveCount(1);
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
