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

test('footer links and FAQ summaries show a focus outline', async ({ page }) => {
  await page.goto('/reports');

  const footerLink = page.locator('footer').getByRole('link', { name: 'Privacy' });
  await footerLink.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(footerLink).toBeFocused();
  expect(await footerLink.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');

  const summary = page.locator('#faq summary').first();
  await summary.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
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
