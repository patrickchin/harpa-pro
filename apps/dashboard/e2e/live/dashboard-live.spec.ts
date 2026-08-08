import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
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
const apiUrl = liveEnv.DASHBOARD_LIVE_API_URL.replace(/\/$/, '');
const dashboardOrigin = new URL(liveEnv.DASHBOARD_LIVE_BASE_URL).origin;

type ProjectSummary = {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
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
  lastGeneration: {
    fixtureMode: 'live' | 'record' | 'replay';
    model: string;
    response: string;
    vendor: string;
  } | null;
};

type AiSettings = {
  model: string | null;
  vendor: 'openai' | null;
};

test.describe('dashboard live preview journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('matches dashboard-capable mobile coverage against the deployed preview', async ({
    browser,
    page: ownerPage,
  }) => {
    test.setTimeout(360_000);

    const ownerDashboard = new DashboardPage(ownerPage);
    const request = ownerPage.context().request;
    const suffix = liveEnv.DASHBOARD_LIVE_RUN_ID.slice(-12);
    const projectName = `Dashboard Live ${suffix}`;
    const projectClient = `Northstar ${suffix}`;
    const projectAddress = `${suffix} Test Yard`;
    const reportNote = `Live dashboard note ${liveEnv.DASHBOARD_LIVE_RUN_ID}`;
    const ownerTitle = `Keyboard save ${suffix}`;
    const editorDraftTitle = `Stale editor draft ${suffix}`;
    const reviewComment = `Live review ${liveEnv.DASHBOARD_LIVE_RUN_ID}`;

    let editorContext: BrowserContext | null = null;
    let editorPage: Page | null = null;
    let editorToken: string | null = null;
    let ownerToken: string | null = null;
    let projectId: string | null = null;
    let originalAiSettings: AiSettings | null = null;

    try {
      ownerToken = await signInTestAccount(
        ownerPage,
        liveEnv.DASHBOARD_LIVE_OWNER_EMAIL,
        liveEnv.DASHBOARD_LIVE_PASSWORD,
      );
      await completeOnboardingIfVisible(ownerPage, `Dashboard Owner ${suffix}`, projectClient);
      await ownerDashboard.gotoProjects();
      originalAiSettings = await getAiSettings(request, ownerToken);
      await setAiSettings(request, ownerToken);

      await createProject(ownerPage, projectName, projectClient, projectAddress);
      await expect(ownerPage.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
      projectId = currentProjectId(ownerPage);

      await ownerDashboard.openPrimarySection('Project settings');
      const updatedClient = `${projectClient} Group`;
      await ownerPage.getByRole('textbox', { name: 'Client' }).fill(updatedClient);
      await ownerPage.getByRole('textbox', { name: 'Address' }).fill(`${projectAddress}, updated`);
      await ownerPage.getByRole('button', { name: 'Save changes' }).click();
      await expect
        .poll(async () => getProject(request, ownerToken!, projectId!))
        .toMatchObject({
          name: projectName,
          clientName: updatedClient,
          address: `${projectAddress}, updated`,
        });

      await ownerDashboard.openPrimarySection('Members');
      await addMember(ownerPage, liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL, 'editor');
      let memberRow = memberTableRow(ownerPage, liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL);
      await expect(memberRow).toBeVisible();
      await expect(memberRow.getByRole('combobox')).toHaveValue('editor');

      editorContext = await browser.newContext({ baseURL: liveEnv.DASHBOARD_LIVE_BASE_URL });
      editorPage = await editorContext.newPage();
      editorToken = await signInTestAccount(
        editorPage,
        liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL,
        liveEnv.DASHBOARD_LIVE_PASSWORD,
      );
      await completeOnboardingIfVisible(editorPage, `Dashboard Editor ${suffix}`, projectClient);
      await editorPage.goto(`/projects/${encodeURIComponent(projectId)}`);
      await expect(editorPage.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
      await expect(editorPage.getByText('Editor · Switch project', { exact: true })).toBeVisible();

      await ownerDashboard.openPrimarySection('Reports');
      await createReportFromList(ownerPage);
      const disposableReportNumber = currentReportNumber(ownerPage);
      await deleteCurrentReport(ownerPage);
      await expect(ownerPage.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
      await expect(
        ownerPage.getByRole('button', {
          name: new RegExp(`^Open Site Visit #${disposableReportNumber}:`),
        }),
      ).toHaveCount(0);

      await createReportFromList(ownerPage);
      const liveReportNumber = currentReportNumber(ownerPage);
      const initialReport = await getReportByNumber(
        request,
        ownerToken,
        projectId,
        liveReportNumber,
      );
      await createTextNote(request, ownerToken, initialReport.id, reportNote);
      await ownerPage.reload();
      await expect(ownerPage.getByText(reportNote)).toBeVisible();

      const generateResponsePromise = ownerPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname ===
            `/projects/${encodeURIComponent(projectId!)}/reports/${liveReportNumber}/generate`,
        { timeout: 180_000 },
      );
      await ownerPage.getByRole('button', { name: 'Generate report' }).click();
      const generateResponse = await generateResponsePromise;
      await expectOk(generateResponse, 'browser report generation');
      const generatedReport = await waitForReportGeneration(
        request,
        ownerToken,
        projectId,
        liveReportNumber,
      );
      await expect(ownerPage.getByRole('button', { name: 'Update report' })).toBeVisible();

      const reportDebug = await getReportDebug(request, ownerToken, projectId, liveReportNumber);
      expect(reportDebug.lastGeneration?.fixtureMode).toBe('live');
      expect(reportDebug.lastGeneration).toMatchObject({
        model: 'gpt-4.1-mini',
        vendor: 'openai',
      });
      expect(reportDebug.lastGeneration?.response.trim().length).toBeGreaterThan(0);

      await editorPage.goto(
        `/projects/${encodeURIComponent(projectId)}/reports/${liveReportNumber}`,
      );
      await expect(editorPage.getByRole('textbox', { name: 'Report title' })).toBeVisible();

      await ownerPage.getByRole('textbox', { name: 'Report title' }).fill(ownerTitle);
      await ownerPage.keyboard.press('Control+s');
      const ownerSavedReport = await waitForReportTitle(
        request,
        ownerToken,
        projectId,
        liveReportNumber,
        ownerTitle,
        generatedReport.updatedAt,
      );
      await expect(ownerPage.getByText('Saved', { exact: true })).toBeVisible();

      await editorPage.getByRole('textbox', { name: 'Report title' }).fill(editorDraftTitle);
      await editorPage.keyboard.press('Control+s');
      await expect(
        editorPage.getByRole('heading', { name: 'This report changed on another device' }),
      ).toBeVisible();
      await expect(editorPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
        editorDraftTitle,
      );
      await editorPage.getByRole('button', { name: 'Reload latest' }).click();
      await expect(editorPage.getByRole('textbox', { name: 'Report title' })).toHaveValue(
        ownerTitle,
      );
      expect(ownerSavedReport.updatedAt).not.toBe(generatedReport.updatedAt);

      await ownerPage.goto(`/projects/${encodeURIComponent(projectId)}/members`);
      memberRow = memberTableRow(ownerPage, liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL);
      await memberRow.getByRole('combobox').selectOption('viewer');
      await expect(memberRow.getByRole('combobox')).toHaveValue('viewer');

      await editorPage.reload();
      await expect(editorPage.getByText('Viewer · Switch project', { exact: true })).toBeVisible();
      await expect(editorPage.getByText('You have read-only access to this draft.')).toBeVisible();
      await expect(editorPage.getByRole('textbox', { name: 'Report title' })).toHaveCount(0);

      await ownerPage.goto(
        `/projects/${encodeURIComponent(projectId)}/reports/${liveReportNumber}`,
      );
      await finalizeReport(ownerPage, request, ownerToken, projectId, liveReportNumber);

      await editorPage.reload();
      await editorPage.getByRole('tab', { name: 'Review' }).click();
      await editorPage.getByRole('textbox', { name: 'Add a comment' }).fill(reviewComment);
      await editorPage.getByRole('button', { name: 'Add comment' }).click();
      await expect(editorPage.getByText(reviewComment)).toBeVisible();

      await ownerPage.getByRole('button', { name: 'Reopen as draft' }).click();
      await ownerPage
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Confirm reopen' })
        .click();
      await waitForReportStatus(request, ownerToken, projectId, liveReportNumber, 'draft');
      await expect(ownerPage.getByRole('button', { name: 'Finalize' })).toBeVisible();
      await finalizeReport(ownerPage, request, ownerToken, projectId, liveReportNumber);
      await ownerPage.reload();
      await ownerPage.getByRole('tab', { name: 'Review' }).click();
      await expect(ownerPage.getByText(reviewComment)).toBeVisible();

      await ownerPage.goto(`/projects/${encodeURIComponent(projectId)}/members`);
      memberRow = memberTableRow(ownerPage, liveEnv.DASHBOARD_LIVE_EDITOR_EMAIL);
      await memberRow.getByRole('button', { name: /Remove/ }).click();
      await ownerPage.getByRole('dialog').getByRole('button', { name: 'Confirm removal' }).click();
      await expect(memberRow).toHaveCount(0);

      await editorPage.goto(`/projects/${encodeURIComponent(projectId)}`);
      await expect(editorPage.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
      await expect(editorPage.getByText('This project could not be found.')).toBeVisible();
      await signOutThroughUi(editorPage);
      await revokeSession(request, editorToken);
      editorToken = null;

      await ownerPage.goto(`/projects/${encodeURIComponent(projectId)}/settings`);
      await ownerPage.getByRole('button', { name: 'Delete project' }).click();
      const deleteDialog = ownerPage.getByRole('dialog', { name: `Delete ${projectName}?` });
      await deleteDialog
        .getByRole('textbox', { name: `Type ${projectName} to confirm` })
        .fill(projectName);
      await deleteDialog.getByRole('button', { name: 'Permanently delete project' }).click();
      await expect(ownerPage.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
      await expect.poll(() => projectExists(request, ownerToken!, projectId!)).toBe(false);
      projectId = null;

      await setAiSettings(request, ownerToken, originalAiSettings);
      originalAiSettings = null;
      await signOutThroughUi(ownerPage);
      await revokeSession(request, ownerToken);
      ownerToken = null;
    } finally {
      try {
        if (ownerToken) {
          if (projectId) await cleanupProject(request, ownerToken, projectId);
          await cleanupProjectsByName(request, ownerToken, projectName);
        }
      } finally {
        try {
          if (ownerToken && originalAiSettings) {
            await setAiSettings(request, ownerToken, originalAiSettings);
          }
        } finally {
          try {
            if (editorToken) await revokeSession(request, editorToken);
            if (ownerToken) await revokeSession(request, ownerToken);
          } finally {
            await editorContext?.close();
          }
        }
      }
    }
  });
});

async function signInTestAccount(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Welcome to Harpa Pro' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-in/email',
  );
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const response = await responsePromise;
  await expectOk(response, 'test-account password sign-in');
  const token = await response.headerValue('set-auth-token');
  if (!token) throw new Error('Test-account password sign-in did not return a bearer token.');
  await page.goto('/projects');
  await Promise.race([
    page.getByRole('heading', { level: 1, name: 'Projects' }).waitFor(),
    page.getByRole('textbox', { name: 'Full name' }).waitFor(),
  ]);
  return token;
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

async function signOutThroughUi(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/sign-in(\?.*)?$/);
}

async function createProject(
  page: Page,
  projectName: string,
  clientName: string,
  address: string,
): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  const createDialog = page.getByRole('dialog', { name: 'New project' });
  await createDialog.getByRole('textbox', { name: 'Project name' }).fill(projectName);
  await createDialog.getByRole('textbox', { name: 'Client' }).fill(clientName);
  await createDialog.getByRole('textbox', { name: 'Address' }).fill(address);
  await createDialog.getByRole('button', { name: 'Create project' }).click();
}

async function addMember(
  page: Page,
  email: string,
  role: 'editor' | 'owner' | 'viewer',
): Promise<void> {
  await page.getByRole('button', { name: 'Add member' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add member' });
  await addDialog.getByRole('textbox', { name: 'Email address' }).fill(email);
  await addDialog.getByRole('combobox', { name: 'Project role' }).selectOption(role);
  await addDialog.getByRole('button', { name: 'Add member', exact: true }).click();
}

function memberTableRow(page: Page, email: string) {
  return page.getByTestId('members-desktop-table').locator('tr', { hasText: email });
}

async function createReportFromList(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New report' }).click();
  await expect(page.getByTestId('report-workspace')).toBeVisible();
}

async function deleteCurrentReport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Delete report' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm delete' }).click();
}

async function finalizeReport(
  page: Page,
  request: APIRequestContext,
  token: string,
  projectId: string,
  reportNumber: number,
): Promise<void> {
  await page.getByRole('button', { name: 'Finalize' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm finalize' }).click();
  await waitForReportStatus(request, token, projectId, reportNumber, 'finalized');
  await expect(page.getByRole('tab', { name: 'Review' })).toBeVisible();
}

function currentProjectId(page: Page): string {
  const match = new URL(page.url()).pathname.match(/\/projects\/([^/]+)/);
  if (!match) throw new Error(`Could not determine project id from ${page.url()}`);
  return decodeURIComponent(match[1] ?? '');
}

function currentReportNumber(page: Page): number {
  const match = new URL(page.url()).pathname.match(/\/reports\/(\d+)$/);
  if (!match) throw new Error(`Could not determine report number from ${page.url()}`);
  return Number(match[1]);
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function getAiSettings(request: APIRequestContext, token: string): Promise<AiSettings> {
  const response = await request.get(`${apiUrl}/settings/ai`, {
    headers: authHeaders(token),
  });
  await expectOk(response, 'get existing AI settings');
  return (await response.json()) as AiSettings;
}

async function setAiSettings(
  request: APIRequestContext,
  token: string,
  settings: AiSettings = { vendor: 'openai', model: 'gpt-4.1-mini' },
): Promise<void> {
  const response = await request.patch(`${apiUrl}/settings/ai`, {
    headers: authHeaders(token),
    data: settings,
  });
  await expectOk(response, 'set AI settings');
  expect(await response.json()).toMatchObject(settings);
}

async function getProject(
  request: APIRequestContext,
  token: string,
  projectId: string,
): Promise<ProjectSummary> {
  const response = await request.get(`${apiUrl}/projects/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(token),
  });
  await expectOk(response, 'get project');
  return (await response.json()) as ProjectSummary;
}

async function projectExists(
  request: APIRequestContext,
  token: string,
  projectId: string,
): Promise<boolean> {
  const response = await request.get(`${apiUrl}/projects/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(token),
  });
  if (response.status() === 404) return false;
  await expectOk(response, 'check deleted project');
  return true;
}

async function getReportByNumber(
  request: APIRequestContext,
  token: string,
  projectId: string,
  reportNumber: number,
): Promise<ReportSummary> {
  const response = await request.get(
    `${apiUrl}/projects/${encodeURIComponent(projectId)}/reports/${reportNumber}`,
    { headers: authHeaders(token) },
  );
  await expectOk(response, 'get report');
  return (await response.json()) as ReportSummary;
}

async function getReportDebug(
  request: APIRequestContext,
  token: string,
  projectSlug: string,
  reportNumber: number,
): Promise<ReportDebug> {
  const response = await request.get(
    `${apiUrl}/projects/${encodeURIComponent(projectSlug)}/reports/${reportNumber}/debug`,
    { headers: authHeaders(token) },
  );
  await expectOk(response, 'get report debug');
  return (await response.json()) as ReportDebug;
}

async function createTextNote(
  request: APIRequestContext,
  token: string,
  reportId: string,
  body: string,
): Promise<void> {
  const response = await request.post(`${apiUrl}/reports/${encodeURIComponent(reportId)}/notes`, {
    headers: authHeaders(token),
    data: { kind: 'text', body, source: 'typed' },
  });
  await expectOk(response, 'create text note');
}

async function waitForReportGeneration(
  request: APIRequestContext,
  token: string,
  projectId: string,
  reportNumber: number,
): Promise<ReportSummary> {
  await expect
    .poll(
      async () => {
        const report = await getReportByNumber(request, token, projectId, reportNumber);
        return report.generatedAt && report.body ? report : null;
      },
      { timeout: 180_000, intervals: [2_000, 4_000, 6_000] },
    )
    .not.toBeNull();
  return getReportByNumber(request, token, projectId, reportNumber);
}

async function waitForReportTitle(
  request: APIRequestContext,
  token: string,
  projectId: string,
  reportNumber: number,
  title: string,
  previousUpdatedAt: string,
): Promise<ReportSummary> {
  let saved: ReportSummary | null = null;
  await expect
    .poll(async () => {
      const report = await getReportByNumber(request, token, projectId, reportNumber);
      const body = report.body as { meta?: { title?: unknown } } | null;
      if (body?.meta?.title === title && report.updatedAt !== previousUpdatedAt) saved = report;
      return Boolean(saved);
    })
    .toBe(true);
  return saved!;
}

async function waitForReportStatus(
  request: APIRequestContext,
  token: string,
  projectId: string,
  reportNumber: number,
  status: 'draft' | 'finalized',
): Promise<void> {
  await expect
    .poll(async () => (await getReportByNumber(request, token, projectId, reportNumber)).status, {
      timeout: 30_000,
      intervals: [1_000, 2_000, 3_000],
    })
    .toBe(status);
}

async function cleanupProject(
  request: APIRequestContext,
  token: string,
  projectId: string,
): Promise<void> {
  const response = await request.delete(`${apiUrl}/projects/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(token),
  });
  if (response.status() === 404 || response.status() === 204) return;
  await expectOk(response, 'cleanup project');
}

async function cleanupProjectsByName(
  request: APIRequestContext,
  token: string,
  projectName: string,
): Promise<void> {
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const response = await request.get(`${apiUrl}/projects?${query.toString()}`, {
      headers: authHeaders(token),
    });
    await expectOk(response, 'find live-run projects for cleanup');
    const payload = (await response.json()) as {
      items: ProjectSummary[];
      nextCursor: string | null;
    };
    for (const project of payload.items) {
      if (project.name === projectName) await cleanupProject(request, token, project.id);
    }
    cursor = payload.nextCursor;
  } while (cursor);
}

async function revokeSession(request: APIRequestContext, token: string): Promise<void> {
  const response = await request.post(`${apiUrl}/api/auth/sign-out`, {
    headers: { ...authHeaders(token), origin: dashboardOrigin },
    data: {},
  });
  if (response.ok() || response.status() === 401) return;
  await expectOk(response, 'revoke dashboard session');
}

async function expectOk(
  response: { ok(): boolean; status(): number; text(): Promise<string> },
  action: string,
): Promise<void> {
  if (response.ok()) return;
  const body = await response.text();
  throw new Error(`${action} failed with ${response.status()}: ${body}`);
}
