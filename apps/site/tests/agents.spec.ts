import { expect, test } from '@playwright/test';

const PROCESS_STEPS = [
  'Choose an agent',
  'Select a factory',
  'Place the order',
  'Monitor procurement',
  'Confirm quality',
  'Confirm shipment',
  'Confirm delivery',
  'Sign off',
] as const;

const EDITORIAL_IMAGE_ALTS = [
  'Contemporary living room with stone, timber, and fabric samples arranged for review',
  'Chinese quality inspector checking laminated furniture panels inside a production factory',
  'Furniture production floor in China with machinery, stacked panels, and workers',
] as const;

test('presents a static procurement journey and agent profiles', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Procurement support from brief to delivery.',
    }),
  ).toBeVisible();

  const process = page.getByRole('list', { name: 'Procurement journey' });
  const steps = process.getByRole('listitem');
  await expect(steps).toHaveCount(PROCESS_STEPS.length);
  for (const [index, step] of PROCESS_STEPS.entries()) {
    await expect(steps.nth(index)).toContainText(step);
  }

  const profiles = page.locator('[data-agent-profile]');
  await expect(profiles).toHaveCount(2);
  await expect(profiles.nth(0)).toContainText('Haruna Bayoh');
  await expect(profiles.nth(0)).toContainText('Architecture and material procurement');
  await expect(profiles.nth(0)).toContainText("Master's degree");
  await expect(profiles.nth(0)).toContainText('6 years');
  await expect(profiles.nth(1)).toContainText('Hashy');
  await expect(profiles.nth(1)).toContainText('Material procurement');
  await expect(profiles.nth(1)).toContainText("Bachelor's degree");
  await expect(profiles.nth(1)).toContainText('4 years');

  const editorialImages = page.locator('[data-procurement-image] img');
  await expect(editorialImages).toHaveCount(EDITORIAL_IMAGE_ALTS.length);
  for (const [index, alt] of EDITORIAL_IMAGE_ALTS.entries()) {
    const image = editorialImages.nth(index);
    await expect(image).toHaveAttribute('alt', alt);
    await expect(image).toHaveAttribute('src', /\/_astro\//);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  }

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.locator('main button')).toHaveCount(0);
  await expect(
    page.getByText(/schedule (an )?(online )?meeting|available|busy|join now/i),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);
});

test('links the agents page from shared navigation without mobile overflow', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'Agents',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');
  await expect(
    page.locator('footer').getByRole('link', {
      name: 'Agents',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.getByRole('link', { name: 'Agents', exact: true })).toHaveAttribute(
    'href',
    '/agents',
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
