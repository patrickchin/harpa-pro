import { expect, test } from '@playwright/test';

import { MockDashboardApi } from './support/mock-api';

test('two browser sessions surface a stale report conflict without losing either draft', async ({
  browser,
}) => {
  const api = new MockDashboardApi({ role: 'editor' });
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await api.install(firstContext);
  await api.install(secondContext);
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await Promise.all([
      firstPage.goto('/projects/prj_01234567/reports/7'),
      secondPage.goto('/projects/prj_01234567/reports/7'),
    ]);
    await expect(firstPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
      'Harbor House progress report',
    );
    await expect(secondPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
      'Harbor House progress report',
    );

    await firstPage.getByRole('textbox', { name: 'Report title' }).fill('Saved from the office');
    await firstPage.keyboard.press('Control+s');
    await expect(firstPage.getByText('Saved', { exact: true })).toBeVisible();

    await secondPage
      .getByRole('textbox', { name: 'Report title' })
      .fill('Still open on another laptop');
    await secondPage.keyboard.press('Control+s');
    await expect(
      secondPage.getByRole('heading', {
        name: 'This report changed on another device',
      }),
    ).toBeVisible();
    await expect(secondPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
      'Still open on another laptop',
    );
    await expect(secondPage.getByRole('button', { name: 'Reload latest' })).toBeVisible();
    await expect(secondPage.getByRole('button', { name: 'Overwrite with my draft' })).toBeVisible();

    await secondPage.getByRole('button', { name: 'Reload latest' }).click();
    await expect(secondPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
      'Saved from the office',
    );
    await expect(
      secondPage.getByRole('heading', {
        name: 'This report changed on another device',
      }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
