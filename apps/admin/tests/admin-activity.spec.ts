import { expect, test } from '@playwright/test';

const API_PORT = process.env.ADMIN_E2E_API_PORT ?? '8787';
const ADMIN_PORT = process.env.ADMIN_E2E_SITE_PORT ?? '3102';
const API_BASE_URL = `http://localhost:${API_PORT}`;
const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
const ADMIN_EMAIL = 'admin-activity@harpapro.com';
const ADMIN_PASSWORD = 'admin-activity-e2e-password';

test('signs in through the visible admin form and signs out', async ({ context, page }) => {
  await page.goto('/');

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
  expect(activityResponse.headers()['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
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
  await expect(page.getByLabel('Event type')).toHaveCount(0);
  await expect(page.getByLabel('From', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('To', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apply filters' })).toHaveCount(0);
  await expect(page.getByLabel('Filter actor')).toHaveCount(0);
  await expect(page.getByLabel('Exclude actor')).toHaveCount(0);
  await expect(page.getByLabel('Filter project')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open as text' })).toBeVisible();

  const feed = page.getByRole('list', { name: 'Activity events' });
  const columnHeaders = page.getByTestId('activity-column-headers');
  await expect(columnHeaders).toBeVisible();
  await expect(columnHeaders.locator(':scope > *')).toHaveText([
    'New',
    'Time',
    'Event',
    'User',
    'Subject',
    'Project',
  ]);
  for (const column of ['time', 'event', 'user', 'project']) {
    await expect(page.getByRole('button', { name: `Filter by ${column}` })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }

  await page.getByRole('button', { name: 'Filter by time' }).click();
  const timeFilter = page.getByRole('region', { name: 'Time filter' });
  await expect(timeFilter.getByRole('radio', { name: 'Past month' })).toBeChecked();

  const desktopViewport = page.viewportSize();
  expect(desktopViewport).not.toBeNull();
  await page.setViewportSize({ width: 320, height: 800 });
  const feedScroller = columnHeaders.locator('..');
  const feedWidths = await feedScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(feedWidths.scrollWidth).toBeGreaterThan(feedWidths.clientWidth);
  await feedScroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(timeFilter).toBeVisible();
  const timePeriodScroller = page.getByTestId('time-period-options');
  const timePeriodWidths = await timePeriodScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(timePeriodWidths.scrollWidth).toBeGreaterThan(timePeriodWidths.clientWidth);
  await timePeriodScroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(page.getByText('All time', { exact: true })).toBeInViewport();
  await page.setViewportSize(desktopViewport!);
  const rows = feed.locator('[data-testid^="activity-row-"]');
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await expect(row).toContainText('Report created');
  await expect(row).toContainText('Admin Activity E2E');
  await expect(row).toContainText('Admin Activity E2E Project');
  await expect(row).toContainText('Report #7');
  await expect(row.locator('[data-icon="file-plus-2"]')).toBeVisible();
  await expect(row.locator('[data-icon="user"]')).toBeVisible();
  await expect(row.locator('[data-icon="folder"]')).toBeVisible();
  await expect(row).toHaveAccessibleName(
    /Event: Report created\. Actor: Admin Activity E2E\. Subject: Report #7\. Project: Admin Activity E2E Project\. Occurred at .+\./,
  );
  expect(await row.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  expect((await row.boundingBox())?.height).toBeLessThanOrEqual(48);
  const [eventWeight, projectWeight] = await Promise.all([
    row
      .getByText('Report created', { exact: true })
      .evaluate((element) => Number(getComputedStyle(element).fontWeight)),
    row
      .getByText('Admin Activity E2E Project', { exact: true })
      .evaluate((element) => Number(getComputedStyle(element).fontWeight)),
  ]);
  expect(eventWeight).toBeGreaterThan(projectWeight);

  await row.click();
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
  await page.getByRole('button', { name: 'Filter by event' }).click();
  await expect(page.getByRole('region', { name: 'Time filter' })).toHaveCount(0);
  const eventFilter = page.getByRole('region', { name: 'Event filter' });
  await page.getByRole('radio', { name: 'Milestones' }).focus();
  await page.keyboard.press('ArrowRight');
  expect((await detailResponsePromise).status()).toBe(200);
  await expect(eventFilter.getByRole('radio', { name: 'Detailed activity' })).toBeChecked();

  const detailRows = feed.locator('[data-testid^="activity-row-"]');
  await expect(detailRows).toHaveCount(4);
  await expect(detailRows).toContainText([
    'Text note added',
    'Voice note added',
    'Image uploaded',
    'Document uploaded',
  ]);
  await expect(feed.locator('[data-icon="message-square-text"]')).toBeVisible();
  await expect(feed.locator('[data-icon="mic"]')).toBeVisible();
  await expect(feed.locator('[data-icon="image"]')).toBeVisible();
  await expect(feed.locator('[data-icon="file-text"]')).toBeVisible();

  const weekResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.get('level') === 'detail' &&
      !url.searchParams.has('eventType') &&
      url.searchParams.has('from')
    );
  });
  await page.getByRole('button', { name: 'Filter by time' }).click();
  await page.getByRole('region', { name: 'Time filter' }).getByText('Past week', { exact: true }).click();
  expect((await weekResponsePromise).status()).toBe(200);

  await page.getByRole('button', { name: 'Filter by user' }).click();
  const userFilter = page.getByRole('region', { name: 'User filter' });
  await userFilter.getByRole('searchbox', { name: 'Search users' }).fill('activity');
  const onlyActorLabel = 'Only Admin Activity E2E — activity-actor@e2e.harpapro.com';
  const onlyActor = userFilter.getByRole('radio', {
    name: onlyActorLabel,
  });
  const actorUserId = (await onlyActor.getAttribute('value'))!;

  const actorResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.get('actorUserId') === actorUserId
    );
  });
  await userFilter.getByText(onlyActorLabel, { exact: true }).click();
  expect((await actorResponsePromise).status()).toBe(200);

  await page.getByRole('button', { name: 'Filter by project' }).click();
  const projectFilter = page.getByRole('region', { name: 'Project filter' });
  await projectFilter.getByRole('searchbox', { name: 'Search projects' }).fill('admin activity');
  const onlyProjectLabel = 'Only Admin Activity E2E Project';
  const onlyProject = projectFilter.getByRole('radio', {
    name: onlyProjectLabel,
  });
  const projectId = (await onlyProject.getAttribute('value'))!;
  const projectResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.get('actorUserId') === actorUserId &&
      url.searchParams.get('projectId') === projectId
    );
  });
  await projectFilter.getByText(onlyProjectLabel, { exact: true }).click();
  expect((await projectResponsePromise).status()).toBe(200);

  await page.getByRole('button', { name: 'Filter by user' }).click();
  const reopenedUserFilter = page.getByRole('region', { name: 'User filter' });
  const actorExclusionLabel =
    'Exclude Admin Activity E2E — activity-actor@e2e.harpapro.com';
  const actorExclusion = reopenedUserFilter.getByRole('checkbox', {
    name: actorExclusionLabel,
  });
  const exclusionResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      !url.searchParams.has('actorUserId') &&
      url.searchParams.get('projectId') === projectId &&
      url.searchParams.get('excludeActorUserIds') === actorUserId
    );
  });
  await reopenedUserFilter.getByText(actorExclusionLabel, { exact: true }).click();
  expect((await exclusionResponsePromise).status()).toBe(200);
  await expect(page.getByText('No activity matches these filters.')).toBeVisible();
  await expect(page.getByTestId('activity-column-headers')).toBeVisible();
  await expect(actorExclusion).toBeChecked();

  const removeExclusionResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      !url.searchParams.has('actorUserId') &&
      url.searchParams.get('projectId') === projectId &&
      !url.searchParams.has('excludeActorUserIds')
    );
  });
  await reopenedUserFilter.getByText(actorExclusionLabel, { exact: true }).click();
  expect((await removeExclusionResponsePromise).status()).toBe(200);
  await expect(detailRows).toHaveCount(4);

  const textLink = page.getByRole('link', { name: 'Open as text' });
  await expect(textLink).toHaveAttribute('target', '_blank');
  await expect(textLink).toHaveAttribute('type', 'text/plain');
  const textPagePromise = page.waitForEvent('popup');
  await textLink.click();
  const textPage = await textPagePromise;
  await textPage.waitForLoadState('domcontentloaded');
  await expect(textPage.locator('body')).toContainText('note.voice_created');
  await expect(textPage.locator('body')).toContainText('Admin Activity E2E');
  await expect(textPage.locator('body')).toContainText('Admin Activity E2E Project');
  await expect(textPage.locator('body')).toContainText('Voice note');
  await textPage.close();

  const milestoneResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      url.searchParams.get('level') === 'milestone' &&
      !url.searchParams.has('eventType')
    );
  });
  await page.getByRole('button', { name: 'Filter by event' }).click();
  await page.getByRole('region', { name: 'Event filter' }).getByText('Milestones', { exact: true }).click();
  expect((await milestoneResponsePromise).status()).toBe(200);

  const existingRow = feed.locator('[data-testid^="activity-row-"]').first();
  await expect(existingRow).toContainText('Report created');
  const existingRowTestId = await existingRow.getAttribute('data-testid');
  expect(existingRowTestId).toBeTruthy();

  const newEventId = 'aud_000000000000';
  await page.route(
    (url) => url.origin === API_BASE_URL && url.pathname === '/admin/activity',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        items: Array<Record<string, unknown>>;
        nextCursor: string | null;
      };
      const source = body.items[0];
      if (!source) {
        await route.fulfill({ response });
        return;
      }

      await route.fulfill({
        response,
        json: {
          ...body,
          items: [
            {
              ...source,
              id: newEventId,
              occurredAt: new Date().toISOString(),
              subjectId: 'rpt_00000000',
              subjectLabel: 'Report #8',
              requestId: 'request-admin-activity-refresh-e2e',
              metadata: { reportNumber: 8 },
            },
            ...body.items,
          ],
        },
      });
    },
  );

  const refreshResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      response.request().method() === 'GET'
    );
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  expect((await refreshResponsePromise).status()).toBe(200);

  const newRow = page.getByTestId(`activity-row-${newEventId}`);
  await expect(newRow).toContainText('Report #8');
  await expect(newRow.getByText('New', { exact: true })).toBeVisible();
  await expect(page.locator(`[data-testid="${existingRowTestId}"]`).getByText('New')).toHaveCount(
    0,
  );
  await expect(page.getByRole('status')).toHaveText('1 new event since last refresh.');

  const secondRefreshResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_BASE_URL &&
      url.pathname === '/admin/activity' &&
      response.request().method() === 'GET'
    );
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  expect((await secondRefreshResponsePromise).status()).toBe(200);
  await expect(newRow.getByText('New', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('No new events since last refresh.');

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
