import type { notes, projects, reports } from '@harpa/api-contract';

import type { ReportsApi } from '../api';

export const reportBodyFixture: reports.ReportBody = {
  meta: {
    title: 'Highland Tower progress report',
    summary: 'East footing work continued and the concrete pour remains on schedule.',
    visitDate: '2026-07-28T00:00:00.000Z',
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

export function reportFixture(overrides: Partial<reports.Report> = {}): reports.Report {
  return {
    id: 'rpt_01234567',
    number: 7,
    projectId: 'prj_01234567',
    status: 'draft',
    visitDate: '2026-07-28T00:00:00.000Z',
    body: structuredClone(reportBodyFixture),
    notesSinceLastGeneration: 0,
    notesChangedAt: null,
    generatedAt: '2026-07-28T09:00:00.000Z',
    needsRegeneration: false,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T09:00:00.000Z',
    ...overrides,
  };
}

export const noteFixtures: notes.Note[] = [
  {
    id: 'not_01234567',
    reportId: 'rpt_01234567',
    authorId: 'usr_01234567',
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
    createdAt: '2026-07-28T08:30:00.000Z',
    updatedAt: '2026-07-28T08:30:00.000Z',
  },
  {
    id: 'not_12345678',
    reportId: 'rpt_01234567',
    authorId: 'usr_01234567',
    kind: 'voice',
    body: null,
    fileId: null,
    thumbnailFileId: null,
    files: [],
    transcript: 'Four carpenters worked on formwork.',
    title: 'Morning crew update',
    summary: 'The formwork crew made steady progress.',
    durationSec: 32,
    language: 'en',
    transcribeProvider: 'fixture',
    transcribedAt: '2026-07-28T08:45:00.000Z',
    source: 'voice',
    meta: {},
    createdAt: '2026-07-28T08:44:00.000Z',
    updatedAt: '2026-07-28T08:45:00.000Z',
  },
];

export const commentFixture: reports.ReportComment = {
  id: 'rcm_01234567',
  reportId: 'rpt_01234567',
  authorId: 'usr_01234567',
  authorDisplayName: 'Sam Builder',
  body: 'Please confirm the concrete quantity before sharing.',
  createdAt: '2026-07-28T10:00:00.000Z',
};

export function fakeReportsApi(overrides: Partial<ReportsApi> = {}): ReportsApi {
  const report = reportFixture();
  return {
    listReports: async () => ({ items: [report], nextCursor: null }),
    createReport: async () => report,
    getReport: async () => report,
    updateReport: async (_project, _number, input) =>
      reportFixture({
        body: input.body,
        visitDate: input.body.meta.visitDate,
        updatedAt: '2026-07-28T09:01:00.000Z',
      }),
    deleteReport: async () => undefined,
    listNotes: async () => ({ items: noteFixtures }),
    getFileUrl: async (fileId) => ({
      url: `https://files.example.test/${fileId}`,
      expiresAt: '2026-07-28T10:00:00.000Z',
    }),
    generateReport: async () => ({ report }),
    updateGeneratedReport: async () => ({ report }),
    finalizeReport: async () => ({
      report: reportFixture({
        status: 'finalized',
        finalizedAt: '2026-07-28T10:00:00.000Z',
      }),
    }),
    reopenReport: async () => ({ report }),
    renderPdf: async () => ({
      url: 'https://files.example.test/report.pdf',
      expiresAt: '2026-07-28T10:00:00.000Z',
    }),
    listComments: async () => ({ items: [commentFixture] }),
    createComment: async (_project, _number, body) => ({
      ...commentFixture,
      body,
    }),
    ...overrides,
  };
}

export const roles: Record<projects.ProjectRole, projects.ProjectRole> = {
  owner: 'owner',
  editor: 'editor',
  viewer: 'viewer',
};
