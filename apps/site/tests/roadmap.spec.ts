import { expect, test } from '@playwright/test';

test.describe('/reports/roadmap', () => {
  test('shows labelled status stages, timing, and closing actions', async ({ page }) => {
    await page.goto('/reports/roadmap');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What Ships Today and What Comes Next',
    );

    const stageNav = page.getByRole('navigation', { name: 'Roadmap stages' });
    const stageLinks = stageNav.getByRole('link');
    await expect(stageLinks).toHaveCount(3);
    await expect(stageLinks.nth(0)).toContainText('Available');
    await expect(stageLinks.nth(0)).toHaveAttribute('href', '#available');
    await expect(stageLinks.nth(1)).toContainText('In progress');
    await expect(stageLinks.nth(2)).toContainText('Planned');

    await expect(page.getByRole('heading', { level: 2, name: 'Available Now' })).toBeVisible();
    const availableList = page.locator('[data-roadmap-available-list] > li');
    await expect(availableList).toHaveCount(6);
    await expect(availableList.first()).toContainText('Voice Note Capture');

    const inProgress = page.locator('[data-roadmap-stage="in-progress"]');
    await expect(inProgress.getByRole('heading', { level: 2 })).toHaveText('In progress');
    await expect(inProgress.getByRole('heading', { level: 3 })).toHaveText([
      'Android Pilot',
      'Web App for the Office',
    ]);
    await expect(inProgress.locator('[data-roadmap-item]').first()).toContainText(
      'Status: In progress',
    );

    const planned = page.locator('[data-roadmap-stage="planned"]');
    await expect(planned.locator('[data-roadmap-item]')).toHaveCount(7);
    await expect(
      planned.locator('[data-roadmap-item]', { hasText: 'Inventory Management' }),
    ).toContainText('Timing: Later');
    await expect(
      planned.locator('[data-roadmap-item]', { hasText: 'Full Offline Mode' }),
    ).not.toContainText('Timing:');

    await expect(page.locator('[data-roadmap-stage="exploring"]')).toHaveCount(0);

    const main = page.locator('main');
    await expect(main.getByRole('link', { name: 'View guides', exact: true })).toHaveAttribute(
      'href',
      '/reports/docs',
    );
    await expect(main.getByRole('link', { name: 'Get the app', exact: true }).last())
      .toHaveAttribute('href', /^https:\/\/apps\.apple\.com\//);
    await expect(main.getByRole('link', { name: 'Suggest a feature', exact: true }))
      .toHaveAttribute('href', /^mailto:patrick@harpapro\.com\?subject=/);
  });

  for (const width of [390, 1280]) {
    test(`does not overflow horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/reports/roadmap');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
});
