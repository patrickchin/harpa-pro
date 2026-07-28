import type { BrowserContext, Route } from '@playwright/test';
import type { notes, projects, reports } from '@harpa/api-contract';

const API_ORIGIN = 'http://localhost:8787';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:3003';

const CURRENT_USER_ID = 'usr_0123456789ab';
const PROJECT_ID = 'prj_01234567';
const DRAFT_REPORT_ID = 'rpt_01234567';
const FINAL_REPORT_ID = 'rpt_12345678';

export type DashboardRole = projects.ProjectRole;

interface MockApiOptions {
  role?: DashboardRole;
  authenticated?: boolean;
  onboarded?: boolean;
}

interface ReportWrite {
  expectedUpdatedAt?: string;
  body?: reports.ReportBody | null;
  visitDate?: string | null;
}

interface MockApiCall {
  method: string;
  pathname: string;
  body: unknown;
}

export interface MockDashboardState {
  projects: projects.Project[];
  members: projects.ProjectMember[];
  reports: reports.Report[];
  comments: reports.ReportComment[];
  calls: MockApiCall[];
}

const reportBody: reports.ReportBody = {
  meta: {
    title: 'Harbor House progress report',
    summary: 'East footing work continued and the concrete pour remains on schedule.',
    visitDate: '2026-07-29T00:00:00.000Z',
  },
  weather: {
    condition: 'Cloudy',
    temperature: '18°C',
    wind: '5 mph',
    impact: 'No material impact.',
  },
  workers: [
    {
      role: 'Carpenter',
      count: '4',
      hours: '8',
      notes: 'Formwork on grid B.',
    },
  ],
  materials: [
    {
      name: 'Concrete C30',
      quantity: '12',
      unit: 'm³',
      status: 'Delivered',
      condition: 'Good',
      notes: 'Arrived at 09:15.',
    },
  ],
  issues: [
    {
      title: 'Delivery access',
      severity: 'medium',
      description: 'Gate access is narrow for the next delivery.',
      action: 'Confirm the smaller truck.',
    },
  ],
  nextSteps: ['Complete the east footing pour.'],
  summarySections: [
    {
      title: 'Site conditions',
      body: 'The access road was wet but remained passable.',
    },
  ],
};

const sourceNotes: notes.Note[] = [
  {
    id: 'not_0123456789',
    reportId: DRAFT_REPORT_ID,
    authorId: CURRENT_USER_ID,
    kind: 'text',
    body: 'Concrete delivery moved to 09:15.',
    fileId: null,
    thumbnailFileId: null,
    files: [],
    transcript: null,
    title: null,
    summary: null,
    durationSec: null,
    language: null,
    transcribeProvider: null,
    transcribedAt: null,
    source: 'typed',
    meta: {},
    createdAt: '2026-07-29T08:30:00.000Z',
    updatedAt: '2026-07-29T08:30:00.000Z',
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function projectFixture(role: DashboardRole): projects.Project {
  return {
    id: PROJECT_ID,
    name: 'Harbor House',
    clientName: 'Northstar Developments',
    address: '18 Pier Road',
    ownerId: CURRENT_USER_ID,
    myRole: role,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T08:00:00.000Z',
    stats: {
      totalReports: 2,
      drafts: 1,
      lastReportAt: '2026-07-29T10:00:00.000Z',
    },
  };
}

function reportFixture(id: string, number: number, status: reports.ReportStatus): reports.Report {
  const finalized = status === 'finalized';
  return {
    id,
    number,
    projectId: PROJECT_ID,
    status,
    visitDate: '2026-07-29T00:00:00.000Z',
    body: clone(reportBody),
    notesSinceLastGeneration: 0,
    notesChangedAt: null,
    generatedAt: '2026-07-29T09:00:00.000Z',
    needsRegeneration: false,
    finalizedAt: finalized ? '2026-07-29T10:00:00.000Z' : null,
    pdfUrl: null,
    createdAt: '2026-07-29T08:00:00.000Z',
    updatedAt: finalized ? '2026-07-29T10:00:00.000Z' : '2026-07-29T09:00:00.000Z',
  };
}

function membersFixture(role: DashboardRole): projects.ProjectMember[] {
  return [
    {
      userId: CURRENT_USER_ID,
      displayName: 'Morgan Lee',
      email: 'morgan@example.com',
      role,
      joinedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      userId: 'usr_123456789abc',
      displayName: 'Riley Chen',
      email: 'riley@example.com',
      role: 'editor',
      joinedAt: '2026-07-03T00:00:00.000Z',
    },
  ];
}

function jsonHeaders() {
  return {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'Authorization, Content-Type, Idempotency-Key, X-Requested-With',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-origin': DASHBOARD_ORIGIN,
    'content-type': 'application/json',
    vary: 'Origin',
  };
}

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

async function fulfillEmpty(route: Route, status = 204): Promise<void> {
  const headers: Record<string, string> = jsonHeaders();
  delete headers['content-type'];
  await route.fulfill({ status, headers });
}

function parseBody(route: Route): unknown {
  const raw = route.request().postData();
  return raw ? (JSON.parse(raw) as unknown) : undefined;
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export class MockDashboardApi {
  readonly role: DashboardRole;
  readonly state: MockDashboardState;
  private authenticated: boolean;
  private onboarded: boolean;
  private timestampCounter = 0;
  private newReportNumber = 8;

  constructor({ role = 'owner', authenticated = true, onboarded = true }: MockApiOptions = {}) {
    this.role = role;
    this.authenticated = authenticated;
    this.onboarded = onboarded;
    this.state = {
      projects: [projectFixture(role)],
      members: membersFixture(role),
      reports: [
        reportFixture(DRAFT_REPORT_ID, 7, 'draft'),
        reportFixture(FINAL_REPORT_ID, 8, 'finalized'),
      ],
      comments: [
        {
          id: 'rcm_0123456789',
          reportId: FINAL_REPORT_ID,
          authorId: 'usr_123456789abc',
          authorDisplayName: 'Riley Chen',
          body: 'Please confirm the concrete quantity before sharing.',
          createdAt: '2026-07-29T10:15:00.000Z',
        },
      ],
      calls: [],
    };
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route(`${API_ORIGIN}/**`, async (route) => {
      await this.handle(route);
    });
  }

  callsFor(method: string, pathname: string): MockApiCall[] {
    return this.state.calls.filter((call) => call.method === method && call.pathname === pathname);
  }

  private nextTimestamp(): string {
    this.timestampCounter += 1;
    return new Date(
      Date.parse('2026-07-29T11:00:00.000Z') + this.timestampCounter * 1_000,
    ).toISOString();
  }

  private findProject(projectId: string): projects.Project | undefined {
    return this.state.projects.find((project) => project.id === projectId);
  }

  private findReport(number: number): reports.Report | undefined {
    return this.state.reports.find((report) => report.number === number);
  }

  private sessionUser() {
    return {
      id: CURRENT_USER_ID,
      email: 'morgan@example.com',
      emailVerified: true,
      name: this.onboarded ? 'Morgan Lee' : '',
      displayName: this.onboarded ? 'Morgan Lee' : null,
      companyName: this.onboarded ? 'Northstar Construction' : null,
      image: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = parseBody(route);
    const segments = pathSegments(url.pathname);

    if (method === 'OPTIONS') {
      await fulfillEmpty(route, 204);
      return;
    }

    this.state.calls.push({ method, pathname: url.pathname, body });

    if (url.pathname === '/api/auth/get-session' && method === 'GET') {
      if (!this.authenticated) {
        await fulfillJson(route, null);
        return;
      }
      await fulfillJson(route, {
        session: {
          id: 'ses_0123456789ab',
          userId: CURRENT_USER_ID,
          token: 'dashboard-e2e-session',
          expiresAt: '2026-08-29T00:00:00.000Z',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
        user: this.sessionUser(),
      });
      return;
    }

    if (url.pathname === '/api/auth/email-otp/send-verification-otp' && method === 'POST') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (url.pathname === '/api/auth/sign-in/email-otp' && method === 'POST') {
      const input = body as { otp?: string };
      if (input.otp !== '123456') {
        await fulfillJson(route, { code: 'INVALID_OTP', message: 'Invalid OTP' }, 400);
        return;
      }
      this.authenticated = true;
      await fulfillJson(route, {
        token: 'dashboard-e2e-session',
        user: this.sessionUser(),
      });
      return;
    }

    if (url.pathname === '/me' && method === 'PATCH') {
      const input = body as {
        displayName?: string;
        companyName?: string;
      };
      this.onboarded = true;
      const currentMember = this.state.members.find((member) => member.userId === CURRENT_USER_ID);
      if (currentMember && input.displayName) {
        currentMember.displayName = input.displayName;
      }
      await fulfillJson(route, {
        ...this.sessionUser(),
        displayName: input.displayName ?? 'Morgan Lee',
        companyName: input.companyName ?? null,
      });
      return;
    }

    if (url.pathname === '/projects' && method === 'GET') {
      await fulfillJson(route, {
        items: clone(this.state.projects),
        nextCursor: null,
      });
      return;
    }

    if (url.pathname === '/projects' && method === 'POST') {
      const input = body as {
        name: string;
        clientName?: string;
        address?: string;
      };
      const project: projects.Project = {
        id: 'prj_23456789',
        name: input.name,
        clientName: input.clientName ?? null,
        address: input.address ?? null,
        ownerId: CURRENT_USER_ID,
        myRole: 'owner',
        createdAt: this.nextTimestamp(),
        updatedAt: this.nextTimestamp(),
        stats: {
          totalReports: 0,
          drafts: 0,
          lastReportAt: null,
        },
      };
      this.state.projects.push(project);
      await fulfillJson(route, clone(project), 201);
      return;
    }

    if (segments[0] === 'projects' && segments[2] === 'members' && segments.length === 3) {
      if (method === 'GET') {
        await fulfillJson(route, { items: clone(this.state.members) });
        return;
      }
      if (method === 'POST') {
        const input = body as {
          email: string;
          role: projects.ProjectRole;
        };
        const member: projects.ProjectMember = {
          userId: 'usr_23456789abcd',
          displayName: 'Casey Brooks',
          email: input.email,
          role: input.role,
          joinedAt: this.nextTimestamp(),
        };
        this.state.members.push(member);
        await fulfillJson(route, clone(member), 201);
        return;
      }
    }

    if (segments[0] === 'projects' && segments[2] === 'members' && segments.length === 4) {
      const userId = decodeURIComponent(segments[3] ?? '');
      const member = this.state.members.find((item) => item.userId === userId);
      if (!member) {
        await fulfillJson(route, { error: { message: 'Member not found' } }, 404);
        return;
      }
      if (method === 'PATCH') {
        member.role = (body as { role: projects.ProjectRole }).role;
        await fulfillJson(route, clone(member));
        return;
      }
      if (method === 'DELETE') {
        this.state.members = this.state.members.filter((item) => item.userId !== userId);
        await fulfillEmpty(route);
        return;
      }
    }

    if (segments[0] === 'projects' && segments[2] === 'reports' && segments.length === 3) {
      if (method === 'GET') {
        const status = url.searchParams.get('status');
        const rows = status
          ? this.state.reports.filter((report) => report.status === status)
          : this.state.reports;
        await fulfillJson(route, {
          items: clone(rows),
          nextCursor: null,
        });
        return;
      }
      if (method === 'POST') {
        this.newReportNumber += 1;
        const report: reports.Report = {
          id: 'rpt_23456789',
          number: this.newReportNumber,
          projectId: decodeURIComponent(segments[1] ?? PROJECT_ID),
          status: 'draft',
          visitDate: null,
          body: null,
          notesSinceLastGeneration: 0,
          notesChangedAt: null,
          generatedAt: null,
          needsRegeneration: false,
          finalizedAt: null,
          pdfUrl: null,
          createdAt: this.nextTimestamp(),
          updatedAt: this.nextTimestamp(),
        };
        this.state.reports.push(report);
        await fulfillJson(route, clone(report), 201);
        return;
      }
    }

    if (segments[0] === 'projects' && segments[2] === 'reports' && segments.length >= 4) {
      const reportNumber = Number(segments[3]);
      const report = this.findReport(reportNumber);
      if (!report) {
        await fulfillJson(route, { error: { message: 'Report not found' } }, 404);
        return;
      }

      if (segments.length === 4) {
        if (method === 'GET') {
          await fulfillJson(route, clone(report));
          return;
        }
        if (method === 'PATCH') {
          const input = body as ReportWrite;
          if (input.expectedUpdatedAt && input.expectedUpdatedAt !== report.updatedAt) {
            await fulfillJson(route, { report: clone(report) }, 409);
            return;
          }
          if (input.body !== undefined) report.body = clone(input.body);
          if (input.visitDate !== undefined) report.visitDate = input.visitDate;
          report.updatedAt = this.nextTimestamp();
          await fulfillJson(route, clone(report));
          return;
        }
        if (method === 'DELETE') {
          this.state.reports = this.state.reports.filter((item) => item.number !== reportNumber);
          await fulfillEmpty(route);
          return;
        }
      }

      const action = segments[4];
      if (action === 'comments') {
        if (method === 'GET') {
          await fulfillJson(route, {
            items: clone(this.state.comments.filter((comment) => comment.reportId === report.id)),
          });
          return;
        }
        if (method === 'POST') {
          const comment: reports.ReportComment = {
            id: 'rcm_1234567890',
            reportId: report.id,
            authorId: CURRENT_USER_ID,
            authorDisplayName: 'Morgan Lee',
            body: (body as { body: string }).body,
            createdAt: this.nextTimestamp(),
          };
          this.state.comments.push(comment);
          await fulfillJson(route, clone(comment), 201);
          return;
        }
      }

      if (
        method === 'POST' &&
        ['generate', 'regenerate', 'finalize', 'unfinalize'].includes(action ?? '')
      ) {
        const input = body as ReportWrite;
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== report.updatedAt) {
          await fulfillJson(route, { report: clone(report) }, 409);
          return;
        }
        if (action === 'generate' || action === 'regenerate') {
          report.body = clone(reportBody);
          report.generatedAt = this.nextTimestamp();
        } else if (action === 'finalize') {
          if (this.role !== 'owner') {
            await fulfillJson(
              route,
              { error: { code: 'forbidden', message: 'Owner access required' } },
              403,
            );
            return;
          }
          report.status = 'finalized';
          report.finalizedAt = this.nextTimestamp();
        } else {
          report.status = 'draft';
          report.finalizedAt = null;
        }
        report.updatedAt = this.nextTimestamp();
        await fulfillJson(route, { report: clone(report) });
        return;
      }

      if (action === 'pdf' && method === 'POST') {
        await fulfillJson(route, {
          url: `${DASHBOARD_ORIGIN}/report.pdf`,
          expiresAt: '2026-07-29T12:00:00.000Z',
        });
        return;
      }
    }

    if (segments[0] === 'reports' && segments[2] === 'notes' && method === 'GET') {
      const reportId = decodeURIComponent(segments[1] ?? '');
      await fulfillJson(route, {
        items: clone(
          sourceNotes.map((note) => ({
            ...note,
            reportId,
          })),
        ),
      });
      return;
    }

    if (segments[0] === 'projects' && segments.length === 2) {
      const projectId = decodeURIComponent(segments[1] ?? '');
      const project = this.findProject(projectId);
      if (!project) {
        await fulfillJson(route, { error: { message: 'Project not found' } }, 404);
        return;
      }
      if (method === 'GET') {
        await fulfillJson(route, clone(project));
        return;
      }
      if (method === 'PATCH') {
        const input = body as {
          name?: string;
          clientName?: string;
          address?: string;
        };
        Object.assign(project, input, { updatedAt: this.nextTimestamp() });
        await fulfillJson(route, clone(project));
        return;
      }
      if (method === 'DELETE') {
        this.state.projects = this.state.projects.filter((item) => item.id !== projectId);
        await fulfillEmpty(route);
        return;
      }
    }

    await fulfillJson(
      route,
      {
        error: {
          code: 'unhandled_mock_route',
          message: `Unhandled mock route: ${method} ${url.pathname}`,
        },
      },
      501,
    );
  }
}
