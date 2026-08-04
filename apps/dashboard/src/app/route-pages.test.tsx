import type { projects, reports } from '@harpa/api-contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requestSignInCode: vi.fn(),
  signOut: vi.fn(),
  useAuthSession: vi.fn(),
  verifySignInCode: vi.fn(),
}));

const dataApiMocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
}));

const reportsApiMocks = vi.hoisted(() => ({
  createReport: vi.fn(),
  listReports: vi.fn(),
}));

vi.mock('@/features/auth', async () => {
  const { SignInForm } = await import('@/features/auth/sign-in-form');
  return {
    OnboardingForm: () => null,
    SignInForm,
    requestSignInCode: authMocks.requestSignInCode,
    useAuthSession: authMocks.useAuthSession,
    verifySignInCode: authMocks.verifySignInCode,
  };
});

vi.mock('@/features/projects/data-api', () => ({
  dashboardDataApi: dataApiMocks,
}));

vi.mock('@/features/reports', () => {
  return {
    ReportsListPage: () => null,
    ReportWorkspacePage: () => <section data-testid="report-workspace" />,
    reportsApi: reportsApiMocks,
  };
});

import { ProjectOverviewRoute, ProjectReportWorkspaceRoute, SignInRoute } from './route-pages';

const project: projects.Project = {
  id: 'prj_01234567',
  name: 'Harbor House',
  clientName: 'Northstar Developments',
  address: '18 Pier Road',
  ownerId: 'usr_01234567',
  myRole: 'owner',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-29T08:00:00.000Z',
  stats: {
    totalReports: 1,
    drafts: 1,
    lastReportAt: '2026-07-29T07:30:00.000Z',
  },
};

function reportFixture(overrides: Partial<reports.Report> = {}): reports.Report {
  return {
    id: 'rpt_01234567',
    number: 7,
    projectId: project.id,
    status: 'draft',
    visitDate: '2026-07-28T00:00:00.000Z',
    body: {
      meta: {
        title: 'East elevation progress',
        summary: null,
        visitDate: '2026-07-28T00:00:00.000Z',
      },
      weather: null,
      workers: [],
      materials: [],
      issues: [],
      nextSteps: [],
      summarySections: [],
    },
    notesSinceLastGeneration: 0,
    notesChangedAt: null,
    generatedAt: null,
    needsRegeneration: false,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-29T07:30:00.000Z',
    ...overrides,
  };
}

function queryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <p>Current URL: {location.pathname + location.search}</p>;
}

describe('SignInRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requestSignInCode.mockResolvedValue(undefined);
    authMocks.verifySignInCode.mockResolvedValue(undefined);
    authMocks.refresh.mockResolvedValue(undefined);
    authMocks.signOut.mockResolvedValue(undefined);
    authMocks.useAuthSession.mockReturnValue({
      refresh: authMocks.refresh,
      signOut: authMocks.signOut,
      status: 'unauthenticated',
      user: null,
    });
    dataApiMocks.listMembers.mockResolvedValue({ items: [] });
    reportsApiMocks.listReports.mockResolvedValue({
      items: [reportFixture()],
      nextCursor: null,
    });
    reportsApiMocks.createReport.mockResolvedValue(reportFixture({ number: 8 }));
  });

  it('refreshes the auth boundary only after OTP verification succeeds', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SignInRoute />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'manager@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(screen.getByRole('textbox', { name: 'Six-digit code' }), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(authMocks.verifySignInCode).toHaveBeenCalledWith({
      email: 'manager@example.com',
      otp: '123456',
    });
    expect(authMocks.refresh).toHaveBeenCalledOnce();
    expect(authMocks.verifySignInCode.mock.invocationCallOrder[0]).toBeLessThan(
      authMocks.refresh.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe('ProjectOverviewRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataApiMocks.listMembers.mockResolvedValue({ items: [] });
    reportsApiMocks.listReports.mockResolvedValue({
      items: [reportFixture()],
      nextCursor: null,
    });
    reportsApiMocks.createReport.mockResolvedValue(reportFixture({ number: 8 }));
  });

  function renderOverview(): void {
    render(
      <QueryClientProvider client={queryClient()}>
        <MemoryRouter initialEntries={['/projects/prj_01234567']}>
          <Routes>
            <Route path="/projects/:project" element={<Outlet context={{ project }} />}>
              <Route index element={<ProjectOverviewRoute />} />
              <Route path="reports/:number" element={<LocationProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('loads the five most recent reports for the overview', async () => {
    renderOverview();

    expect(await screen.findByRole('heading', { name: 'Recent reports' })).toBeVisible();
    expect(reportsApiMocks.listReports).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        limit: 5,
        status: 'all',
      }),
    );
    expect((await screen.findAllByRole('link', { name: 'East elevation progress' }))[0]).toBeVisible();
  });

  it('creates a draft from the overview and opens its workspace', async () => {
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByRole('button', { name: 'New report' }));

    await waitFor(() => {
      expect(reportsApiMocks.createReport).toHaveBeenCalledWith(project.id);
    });
    expect(await screen.findByText('Current URL: /projects/prj_01234567/reports/8')).toBeVisible();
  });
});

describe('ProjectReportWorkspaceRoute', () => {
  it('leaves shared page gutters to the dashboard shell', () => {
    render(
      <MemoryRouter initialEntries={['/projects/prj_01234567/reports/7']}>
        <Routes>
          <Route path="/projects/:project" element={<Outlet context={{ project }} />}>
            <Route path="reports/:number" element={<ProjectReportWorkspaceRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('report-workspace').parentElement).not.toHaveClass('px-5');
  });
});
