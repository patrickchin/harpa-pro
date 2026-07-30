import { expect, test } from '@playwright/test';

import { DashboardPage } from './support/dashboard-page';
import { MockDashboardApi } from './support/mock-api';

test.describe('office dashboard journeys', () => {
  test('signs in, completes onboarding, and returns to a shared report link', async ({
    context,
    page,
  }) => {
    const api = new MockDashboardApi({
      role: 'owner',
      authenticated: false,
      onboarded: false,
    });
    await api.install(context);

    await page.goto('/projects/prj_01234567/reports/8?tab=review');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Harpa Pro' }),
    ).toBeVisible();

    await page.getByRole('textbox', { name: 'Email address' }).fill('morgan@example.com');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Six-digit code' }).fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Set up your profile' }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Full name' }).fill('Morgan Lee');
    await page.getByRole('textbox', { name: /Company/ }).fill('Northstar Construction');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/projects\/prj_01234567\/reports\/8\?tab=review$/);
    await expect(page.getByText('Site Visit #8')).toBeVisible();
  });

  test('viewer navigates read-only surfaces, downloads a PDF, and comments', async ({
    context,
    page,
  }, testInfo) => {
    const api = new MockDashboardApi({ role: 'viewer' });
    await api.install(context);
    await context.route('**/report.pdf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'content-disposition': 'attachment; filename="Harbor House report.pdf"',
        },
        body: '%PDF-1.4 dashboard e2e fixture',
      });
    });
    const dashboard = new DashboardPage(page);

    await dashboard.gotoProjects();
    await page.keyboard.press(testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await dashboard.openProject();
    await expect(page.getByRole('button', { name: 'New report' })).toHaveCount(0);

    await dashboard.openPrimarySection('Members');
    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
    await expect(page.getByText('Riley Chen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove/ })).toHaveCount(0);

    await dashboard.openPrimarySection('Project settings');
    await expect(page.getByText('Northstar Developments')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete project' })).toHaveCount(0);

    await dashboard.openPrimarySection('Reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New report' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Delete Site Visit/ })).toHaveCount(0);
    await dashboard.openReport(8);

    await expect(page.getByRole('tab', { name: 'Report' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Structured report editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reopen as draft' })).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');
    expect(api.callsFor('POST', '/projects/prj_01234567/reports/8/pdf')).toHaveLength(1);

    await page.getByRole('tab', { name: 'Review' }).click();
    await expect(
      page.getByText('Please confirm the concrete quantity before sharing.'),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Add a comment' })
      .fill('Quantity confirmed with the supplier.');
    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('Quantity confirmed with the supplier.')).toBeVisible();

    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: testInfo.outputPath('viewer-wide.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const overflow = await page.evaluate(() => {
        const workspace = document.querySelector<HTMLElement>('.reports-workspace');
        if (!workspace) throw new Error('Report workspace not found');

        return {
          page: document.body.scrollWidth - document.body.clientWidth,
          workspace: workspace.scrollWidth - workspace.clientWidth,
        };
      });
      expect(overflow.page).toBeLessThanOrEqual(1);
      expect(overflow.workspace).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath('viewer-narrow.png'),
        fullPage: true,
      });
    }
  });

  test('owner manages project details, members, and report lifecycle', async ({
    context,
    page,
  }) => {
    const api = new MockDashboardApi({ role: 'owner' });
    await api.install(context);
    const dashboard = new DashboardPage(page);

    await dashboard.gotoProjects();
    await page.getByRole('button', { name: 'New project' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Cedar Annex');
    await createDialog.getByRole('textbox', { name: /Client/ }).fill('Cedar Holdings');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cedar Annex' })).toBeVisible();
    expect(api.state.projects.some((project) => project.name === 'Cedar Annex')).toBe(true);

    await page.getByRole('link', { name: /Cedar Annex.*Switch project/ }).click();
    await dashboard.openProject();
    await dashboard.openPrimarySection('Project settings');
    const client = page.getByRole('textbox', { name: /Client/ });
    await client.fill('Northstar Construction Group');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => api.state.projects[0]?.clientName).toBe('Northstar Construction Group');

    await dashboard.openPrimarySection('Members');
    await page.getByRole('button', { name: 'Add member' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add member' });
    await addDialog.getByRole('textbox', { name: 'Email address' }).fill('casey@example.com');
    await addDialog.getByRole('combobox', { name: 'Project role' }).selectOption('editor');
    await addDialog.getByRole('button', { name: 'Add member', exact: true }).click();
    await expect(page.getByText('Casey Brooks', { exact: true })).toBeVisible();

    await page
      .getByRole('combobox', { name: 'Change role for Casey Brooks' })
      .selectOption('viewer');
    await expect
      .poll(() => api.state.members.find((member) => member.email === 'casey@example.com')?.role)
      .toBe('viewer');
    await page.getByRole('button', { name: 'Remove Casey Brooks' }).click();
    await page
      .getByRole('dialog', { name: 'Remove Casey Brooks' })
      .getByRole('button', { name: 'Confirm removal' })
      .click();
    await expect(page.getByText('Casey Brooks', { exact: true })).toHaveCount(0);

    await dashboard.openPrimarySection('Reports');
    await page.getByRole('button', { name: 'New report' }).click();
    await expect(page.getByText('Site Visit #9')).toBeVisible();
    await page.getByRole('button', { name: 'Delete report' }).click();
    await page
      .getByRole('alertdialog', { name: 'Delete Site Visit #9?' })
      .getByRole('button', { name: 'Confirm delete' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();

    await dashboard.openReport(7);
    await page.getByRole('button', { name: 'Finalize' }).click();
    await page
      .getByRole('alertdialog', { name: 'Finalize Site Visit #7?' })
      .getByRole('button', { name: 'Confirm finalize' })
      .click();
    await expect(page.getByText('Finalized', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Review' })).toBeVisible();
  });

  test('editor uses keyboard autosave while finalization stays owner-only', async ({
    context,
    page,
  }) => {
    const api = new MockDashboardApi({ role: 'editor' });
    await api.install(context);
    const dashboard = new DashboardPage(page);

    await page.goto('/projects/prj_01234567/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
    await dashboard.openReport(7);

    const title = page.getByRole('textbox', { name: 'Report title' });
    await title.fill('Keyboard revised progress report');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(
      page.getByTestId('report-preview').getByText('Keyboard revised progress report'),
    ).toBeVisible();

    const writes = api.callsFor('PATCH', '/projects/prj_01234567/reports/7');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toMatchObject({
      expectedUpdatedAt: '2026-07-29T09:00:00.000Z',
      body: {
        meta: {
          title: 'Keyboard revised progress report',
        },
      },
    });
    await expect(page.getByRole('button', { name: 'Finalize' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update report' })).toBeEnabled();
  });
});
