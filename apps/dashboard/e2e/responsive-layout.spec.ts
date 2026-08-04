import { expect, test } from '@playwright/test';

import { MockDashboardApi } from './support/mock-api';

const routes = [
  { heading: 'Projects', path: '/projects' },
  { heading: 'Members', path: '/projects/prj_01234567/members' },
  { heading: 'Reports', path: '/projects/prj_01234567/reports' },
  { heading: 'Site Visit #7', path: '/projects/prj_01234567/reports/7' },
] as const;

const viewports = [
  { height: 900, label: 'wide desktop', width: 1280 },
  { height: 600, label: 'compact landscape', width: 1024 },
  { height: 1024, label: 'tablet', width: 768 },
  { height: 844, label: 'mobile', width: 390 },
  { height: 653, label: 'minimum supported', width: 280 },
] as const;

for (const viewport of viewports) {
  test(`keeps every dashboard surface inside the ${viewport.label} viewport`, async ({
    context,
    page,
  }) => {
    const api = new MockDashboardApi({ role: 'owner' });
    await api.install(context);
    await page.setViewportSize({ height: viewport.height, width: viewport.width });

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        )
        .toBeLessThanOrEqual(1);

      if (viewport.width <= 768 && route.path !== routes.at(-1)?.path) {
        await expect(page.locator('table:visible')).toHaveCount(0);
      }
    }
  });
}
