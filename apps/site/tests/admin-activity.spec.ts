import { expect, test } from '@playwright/test';

const API_PORT = process.env.ADMIN_E2E_API_PORT ?? '8787';
const SITE_PORT = process.env.ADMIN_E2E_SITE_PORT ?? '3002';
const API_BASE_URL = `http://localhost:${API_PORT}`;
const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;
const ADMIN_EMAIL = 'admin-activity@harpapro.com';
const ADMIN_PASSWORD = 'admin-activity-e2e-password';

test('signs in through the visible admin form and signs out', async ({ context, page }) => {
  await page.goto('/admin/activity');

  const email = page.getByLabel('Email');
  const password = page.getByLabel('Password');
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send code' })).toHaveCount(0);

  expect(
    await page.evaluate(() => ({
      localStorage: window.localStorage.length,
      sessionStorage: window.sessionStorage.length,
    })),
  ).toEqual({ localStorage: 0, sessionStorage: 0 });

  const loginResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/auth/login' &&
      response.request().method() === 'POST'
    );
  });
  const activityResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      response.request().method() === 'GET'
    );
  });

  await email.fill(ADMIN_EMAIL);
  await password.fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  const sessionCookie = (await context.cookies(API_BASE_URL)).find(
    (cookie) => cookie.name === 'harpa_admin_session',
  );
  expect(sessionCookie).toMatchObject({
    domain: 'localhost',
    httpOnly: true,
    sameSite: 'Strict',
  });

  const activityResponse = await activityResponsePromise;

  expect(activityResponse.status()).toBe(200);
  const activityUrl = new URL(activityResponse.url());
  expect(activityUrl.searchParams.get('level')).toBe('milestone');
  expect(activityUrl.searchParams.get('from')).toBeTruthy();
  expect(activityUrl.searchParams.has('to')).toBe(false);
  expect(activityResponse.headers()['access-control-allow-origin']).toBe(SITE_ORIGIN);
  expect(activityResponse.headers()['access-control-allow-credentials']).toBe('true');
  expect((await activityResponse.request().allHeaders()).cookie).toContain(
    `${sessionCookie!.name}=`,
  );
  expect(
    await page.evaluate(() => ({
      localStorage: window.localStorage.length,
      sessionStorage: window.sessionStorage.length,
    })),
  ).toEqual({ localStorage: 0, sessionStorage: 0 });

  await expect(page.getByRole('heading', { level: 1, name: 'Harpa Pro activity' })).toBeVisible();
  await expect(page.getByLabel('Detail level')).toHaveValue('milestone');
  await expect(page.getByLabel('Time period')).toHaveValue('month');
  await expect(page.getByLabel('From', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('To', { exact: true })).toHaveCount(0);

  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Report created');
  await expect(row).toContainText('Admin Activity E2E');
  await expect(row).toContainText('Admin Activity E2E Project');
  await expect(row).toContainText('Report #7');

  await row.getByRole('button', { name: 'Report #7' }).click();
  const detail = page.getByRole('dialog', { name: 'Report #7' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('request-admin-activity-e2e', { exact: true })).toBeVisible();
  await expect(detail.locator('pre')).toContainText('"reportNumber": 7');
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toBeHidden();

  const detailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.get('level') === 'detail'
    );
  });
  await page.getByLabel('Detail level').selectOption('detail');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  expect((await detailResponsePromise).status()).toBe(200);

  const detailRows = page.locator('tbody tr');
  await expect(detailRows).toHaveCount(4);
  await expect(detailRows).toContainText([
    'Text note added',
    'Voice note added',
    'Image uploaded',
    'Document uploaded',
  ]);

  await page.getByRole('button', { name: 'Voice note' }).click();
  const exclusionResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.has('excludeActorUserIds')
    );
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Exclude actor' }).click();
  expect((await exclusionResponsePromise).status()).toBe(200);
  await expect(page.getByText('No activity matches these filters.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove Admin Activity E2E exclusion' }),
  ).toBeVisible();

  const logoutResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/auth/logout' &&
      response.request().method() === 'POST'
    );
  });
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect((await logoutResponsePromise).status()).toBe(200);

  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(
    (await context.cookies(API_BASE_URL)).some((cookie) => cookie.name === 'harpa_admin_session'),
  ).toBe(false);
});
