import { expect, test } from '@playwright/test';

import { MockDashboardApi } from './support/mock-api';

test.describe('mobile typography parity', () => {
  test('keeps emphasis scoped to the same roles as mobile', async ({ context, page }) => {
    const signedOutApi = new MockDashboardApi({ authenticated: false });
    await signedOutApi.install(context);

    await page.goto('/projects');

    const email = page.getByRole('textbox', { name: 'Email address' });
    await expect(email).toHaveCSS('font-weight', '400');
    await expect(email).toHaveCSS('letter-spacing', 'normal');
    await expect(email).toHaveCSS('text-transform', 'none');
    await expect(page.getByRole('button', { name: 'Send code' })).toHaveCSS(
      'font-weight',
      '600',
    );

    const authenticatedApi = new MockDashboardApi({ role: 'owner' });
    await authenticatedApi.install(context);
    await page.goto('/projects');

    const projectsHeading = page.getByRole('heading', { level: 1, name: 'Projects' });
    await expect(projectsHeading).toHaveCSS('font-size', '20px');
    await expect(projectsHeading).toHaveCSS('line-height', '26px');
    await expect(projectsHeading).toHaveCSS('font-weight', '700');
    await expect(page.locator('ul[aria-label="Projects"] h2 a').first()).toHaveCSS(
      'font-weight',
      '700',
    );
    const projectsNavigationLink = page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Projects' });
    await expect(projectsNavigationLink).toHaveCSS('font-weight', '600');
    await expect(projectsNavigationLink).toHaveCSS('letter-spacing', 'normal');

    await page.goto('/projects/prj_01234567/members');
    const desktopMembers = page.getByTestId('members-desktop-table');
    await expect(desktopMembers.getByText('Riley Chen', { exact: true })).toHaveCSS(
      'font-weight',
      '600',
    );
    await page.getByRole('button', { name: 'Add member' }).click();
    const addMemberDialog = page.getByRole('dialog', { name: 'Add member' });
    await expect(addMemberDialog.locator('#add-member-title')).toHaveCSS('font-weight', '700');
    await expect(addMemberDialog.getByRole('textbox', { name: 'Email address' })).toHaveCSS(
      'font-weight',
      '400',
    );

    await page.goto('/projects/prj_01234567/reports/8');
    await page.getByRole('tab', { name: 'Report' }).click();
    const preview = page.getByTestId('report-preview');
    await expect(preview.getByRole('heading', { name: 'Summary' })).toHaveCSS(
      'font-size',
      '13px',
    );
    await expect(page.getByRole('tab', { name: 'Report' })).toHaveCSS('font-weight', '600');

    await page.getByRole('tab', { name: 'Review' }).click();
    await expect(page.getByRole('textbox', { name: 'Add a comment' })).toHaveCSS(
      'font-weight',
      '400',
    );
  });
});
