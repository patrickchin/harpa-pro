import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { z } from 'zod';

import { DashboardPage } from '../support/dashboard-page';

const liveEnvSchema = z.object({
  DASHBOARD_LIVE_BASE_URL: z.string().url(),
  DASHBOARD_LIVE_API_URL: z.string().url(),
  DASHBOARD_LIVE_OWNER_EMAIL: z.string().email(),
  DASHBOARD_LIVE_EDITOR_EMAIL: z.string().email(),
  DASHBOARD_LIVE_PASSWORD: z.string().min(16),
  DASHBOARD_LIVE_RUN_ID: z.string().min(1),
});

const liveEnv = liveEnvSchema.parse(process.env);

type ProjectSummary = {
  id: string;
  name: string;
};

type ReportSummary = {
  id: string;
  number: number;
  status: 'draft' | 'finalized';
  body: unknown | null;
  generatedAt: string | null;
  updatedAt: string;
};

type ReportDebug = {
  lastGeneration: null | {
    fixtureMode: 'live' | 'replay' | 'record';
  };
};

test.describe('dashboard live preview journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('matches dashboard-capable mobile coverage against the deployed preview', async ({
    page,
  }) => {
    test.slow();

    const dashboard = new DashboardPage(page);
    const request = page.context().request;
    const suffix = liveEnv.DASHBOARD_LIVE_RUN_ID.slice(-8);
    const projectName = `Dashboard Live ${suffix}`;
    const projectClient = `Northstar ${suffix}`;
    const reportNote = `Live dashboard note ${liveEnv.DASHBOARD_LIVE_RUN_ID}`;
    const reviewComment = `Live review ${liveEnv.DASHBOARD_LIVE_RUN_ID}`;

    let projectSlug: string | null = null;

    try {
      await signInAsPasswordAccount(
        page,
        liveEnv.DASHBOARD_LIVE_OWNER_EMAIL,
        liveEnv.DASHBOARD_LIVE_PASSWORD,
      );
      await completeOnboardingIfVisible(page, `Dashboard Owner ${suffix}`, projectClient);
      await dashboard.gotoProjects();

      await createProject(page, projectName, projectClient);
      projectSlug = currentProjectSlug(page);
      await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();

      await dashboard.openPrimarySection('Project settings');
      const clientField = page.getByRole('textbox', { name: 'Client' });
      await clientField.fill(`${projectClient} Group`);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(clientField).toHaveValue(`${projectClient} Group`);

      await dashboard.openPrimarySection('Members');
      await page.getByRole('button', { name: 'Add member' }).click();
      const addDialog = page.getByRole('dialog', { name: 'Add member' });
      await addDialog.getByRole('textbox', { name: 'Email address' }).fill(liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL);
      await addDialog.getByRole('combobox', { name: 'Project role' }).selectOption('editor');
      await addDialog.getByRole('button', { name: 'Add member', exact: true }).click();

      const membersTable = page.getByTestId('members-desktop-table');
      const editorRow = membersTable.locator('tr', { hasText: liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL });
      await expect(editorRow).toBeVisible();
      await editorRow.getByRole('combobox').selectOption('viewer');
      await expect(editorRow.getByRole('combobox')).toHaveValue('viewer');
      await editorRow.getByRole('button', { name: /Remove/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm removal' }).click();
      await expect(editorRow).toHaveCount(0);

      await dashboard.openPrimarySection('Reports');
      await createReportFromList(page);
      const disposableReportNumber = currentReportNumber(page);
      await page.getByRole('button', { name: 'Delete report' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm delete' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: new RegExp(`^Open Site Visit #${disposableReportNumber}:`),
        }),
      ).toHaveCount(0);

      await createReportFromList(page);
      const liveReportNumber = currentReportNumber(page);
      const liveReport = await getReportByNumber(request, projectSlug, liveReportNumber);

      await createTextNote(request, liveReport.id, reportNote);
      await page.reload();
      await expect(page.getByText(reportNote)).toBeVisible();

      await page.getByRole('button', { name: 'Generate report' }).click();
      const generatedReport = await waitForReportGeneration(request, projectSlug, liveReportNumber);
      const generatedDebug = await getReportDebug(request, projectSlug, liveReportNumber);
      await expect(page.getByRole('button', { name: 'Update report' })).toBeVisible();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Finalize' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm finalize' }).click();
      await waitForReportStatus(request, projectSlug, liveReportNumber, 'finalized');
      await expect(page.getByRole('tab', { name: 'Review' })).toBeVisible();

      await page.getByRole('tab', { name: 'Review' }).click();
      await page.getByRole('textbox', { name: 'Add a comment' }).fill(reviewComment);
      await page.getByRole('button', { name: 'Add comment' }).click();
      await expect(page.getByText(reviewComment)).toBeVisible();

      await page.getByRole('button', { name: 'Reopen as draft' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm reopen' }).click();
      await waitForReportStatus(request, projectSlug, liveReportNumber, 'draft');
      await expect(page.getByRole('button', { name: 'Finalize' })).toBeVisible();

      await page.getByRole('button', { name: 'Finalize' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm finalize' }).click();
      await waitForReportStatus(request, projectSlug, liveReportNumber, 'finalized');
      await page.getByRole('tab', { name: 'Review' }).click();
      await expect(page.getByText(reviewComment)).toBeVisible();

      await dashboard.openPrimarySection('Project settings');
      await page.getByRole('button', { name: 'Delete project' }).click();
      const deleteDialog = page.getByRole('dialog', { name: `Delete ${projectName}?` });
      await deleteDialog.getByRole('textbox', { name: `Type ${projectName} to confirm` }).fill(projectName);
      await deleteDialog.getByRole('button', { name: 'Permanently delete project' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
      projectSlug = null;

      await expect
        .poll(async () => {
          const projects = await listProjects(request);
          return projects.some((project) => project.name === projectName);
        })
        .toBe(false);

      expect(generatedReport.generatedAt).not.toBeNull();
      expect(generatedReport.body).not.toBeNull();
      expect(generatedDebug.lastGeneration?.fixtureMode).toBe('live');
    } finally {
      if (projectSlug) {
        await cleanupProject(request, projectSlug);
      }
    }
  });
});

async function signInAsPasswordAccount(page: Page, email: string, password: string): Promise<void> {
  const response = await page.context().request.post(
    `${liveEnv.DASHBOARD_LIVE_API_URL}/api/auth/sign-in/email`,
    {
      data: { email, password },
    },
  );
  await expectOk(response, 'sign in test account');
  await page.goto('/projects');
  await page.waitForURL(/\/(projects|onboarding)(\?.*)?$/);
}

async function completeOnboardingIfVisible(
  page: Page,
  displayName: string,
  companyName: string,
): Promise<void> {
  if (!page.url().includes('/onboarding')) return;
  await page.getByRole('textbox', { name: 'Full name' }).fill(displayName);
  await page.getByRole('textbox', { name: 'Company' }).fill(companyName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/projects(\?.*)?$/);
}

async function createProject(page: Page, projectName: string, clientName: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  const createDialog = page.getByRole('dialog', { name: 'New project' });
  await createDialog.getByRole('textbox', { name: 'Project name' }).fill(projectName);
  await createDialog.getByRole('textbox', { name: 'Client' }).fill(clientName);
  await createDialog.getByRole('button', { name: 'Create project' }).click();
}

async function createReportFromList(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New report' }).click();
  await expect(page.getByTestId('report-workspace')).toBeVisible();
}

function currentProjectSlug(page: Page): string {
  const match = new URL(page.url()).pathname.match(/\/projects\/([^/]+)/);
  if (!match) throw new Error(`Could not determine project slug from ${page.url()}`);
  return decodeURIComponent(match[1] ?? '');
}

function currentReportNumber(page: Page): number {
  const match = new URL(page.url()).pathname.match(/\/reports\/(\d+)$/);
  if (!match) throw new Error(`Could not determine report number from ${page.url()}`);
  return Number(match[1]);
}

async function listProjects(request: APIRequestContext): Promise<ProjectSummary[]> {
  const response = await request.get(`${liveEnv.DASHBOARD_LIVE_API_URL}/projects?limit=100`);
  await expectOk(response, 'list projects');
  const payload = (await response.json()) as { items: ProjectSummary[] };
  return payload.items;
}

async function getReportByNumber(
  request: APIRequestContext,
  projectSlug: string,
  reportNumber: number,
): Promise<ReportSummary> {
  const response = await request.get(
    `${liveEnv.DASHBOARD_LIVE_API_URL}/projects/${encodeURIComponent(projectSlug)}/reports/${reportNumber}`,
  );
  await expectOk(response, 'get report');
  return (await response.json()) as ReportSummary;
}

async function getReportDebug(
  request: APIRequestContext,
  projectSlug: string,
  reportNumber: number,
): Promise<ReportDebug> {
  const response = await request.get(
    `${liveEnv.DASHBOARD_LIVE_API_URL}/projects/${encodeURIComponent(projectSlug)}/reports/${reportNumber}/debug`,
  );
  await expectOk(response, 'get report debug');
  return (await response.json()) as ReportDebug;
}

async function createTextNote(
  request: APIRequestContext,
  reportId: string,
  body: string,
): Promise<void> {
  const response = await request.post(
    `${liveEnv.DASHBOARD_LIVE_API_URL}/reports/${encodeURIComponent(reportId)}/notes`,
    {
      data: {
        kind: 'text',
        body,
        source: 'typed',
      },
    },
  );
  await expectOk(response, 'create text note');
}

async function waitForReportGeneration(
  request: APIRequestContext,
  projectSlug: string,
  reportNumber: number,
): Promise<ReportSummary> {
  await expect
    .poll(async () => {
      const report = await getReportByNumber(request, projectSlug, reportNumber);
      return report.generatedAt && report.body ? report : null;
    }, {
      timeout: 180_000,
      intervals: [2_000, 4_000, 6_000],
    })
    .not.toBeNull();

  return getReportByNumber(request, projectSlug, reportNumber);
}

async function waitForReportStatus(
  request: APIRequestContext,
  projectSlug: string,
  reportNumber: number,
  status: 'draft' | 'finalized',
): Promise<void> {
  await expect
    .poll(async () => (await getReportByNumber(request, projectSlug, reportNumber)).status, {
      timeout: 30_000,
      intervals: [1_000, 2_000, 3_000],
    })
    .toBe(status);
}

async function cleanupProject(request: APIRequestContext, projectSlug: string): Promise<void> {
  const response = await request.delete(
    `${liveEnv.DASHBOARD_LIVE_API_URL}/projects/${encodeURIComponent(projectSlug)}`,
  );
  if (response.status() === 404 || response.status() === 204) return;
  await expectOk(response, 'cleanup project');
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext['get']>>, action: string) {
  if (response.ok()) return;
  const body = await response.text();
  throw new Error(`${action} failed with ${response.status()}: ${body}`);
}
