/**
 * Snapshot tests for human-readable renderers. Renderers are pure
 * so the snapshots double as a contract: changes to the rendering
 * output must be intentional and reviewed in the same PR that
 * regenerates the snapshot.
 *
 * Chalk is disabled (level 0) so snapshots don't include ANSI codes —
 * makes them readable in PR diffs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { renderUser, renderUsage, renderProject, renderProjectList, renderMember, renderMemberList, renderReport, renderReportList } from '../lib/render.js';

beforeAll(() => {
  chalk.level = 0;
});

describe('renderUser', () => {
  it('renders a fully populated user', () => {
    expect(
      renderUser({
        id: '00000000-0000-0000-0000-000000000001',
        phone: '+15550100100',
        displayName: 'Patrick Chin',
        companyName: 'Harpa Pro Ltd',
        createdAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });

  it('renders a user missing optional fields', () => {
    expect(
      renderUser({
        id: '00000000-0000-0000-0000-000000000002',
        phone: '+15550100200',
        displayName: null,
        companyName: null,
        createdAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });
});

describe('renderUsage', () => {
  it('renders months + totals', () => {
    expect(
      renderUsage({
        months: [
          { month: '2025-01', reports: 12, voiceNotes: 47 },
          { month: '2024-12', reports: 8, voiceNotes: 31 },
        ],
        totals: { reports: 20, voiceNotes: 78 },
      }),
    ).toMatchSnapshot();
  });

  it('renders empty usage', () => {
    expect(
      renderUsage({
        months: [],
        totals: { reports: 0, voiceNotes: 0 },
      }),
    ).toMatchSnapshot();
  });
});

describe('renderProject', () => {
  const baseProject = {
    id: '00000000-0000-0000-0000-000000000010',
    name: 'Demo Project',
    clientName: 'Acme Co',
    address: '1 Main St',
    ownerId: '00000000-0000-0000-0000-000000000001',
    myRole: 'owner' as const,
    createdAt: '2025-01-15T10:30:00.000Z',
    updatedAt: '2025-01-16T11:00:00.000Z',
  };

  it('renders a fully populated project with stats', () => {
    expect(
      renderProject({
        ...baseProject,
        stats: { totalReports: 5, drafts: 2, lastReportAt: '2025-01-16T09:00:00.000Z' },
      }),
    ).toMatchSnapshot();
  });

  it('renders a project missing optional fields', () => {
    expect(
      renderProject({
        ...baseProject,
        clientName: null,
        address: null,
      }),
    ).toMatchSnapshot();
  });
});

describe('renderProjectList', () => {
  it('renders a populated page with nextCursor', () => {
    expect(
      renderProjectList({
        items: [
          {
            id: '00000000-0000-0000-0000-000000000020',
            name: 'Project A',
            clientName: 'Client A',
            address: null,
            ownerId: '00000000-0000-0000-0000-000000000001',
            myRole: 'owner',
            createdAt: '2025-01-15T10:30:00.000Z',
            updatedAt: '2025-01-15T10:30:00.000Z',
          },
          {
            id: '00000000-0000-0000-0000-000000000021',
            name: 'Project B',
            clientName: null,
            address: null,
            ownerId: '00000000-0000-0000-0000-000000000001',
            myRole: 'editor',
            createdAt: '2025-01-15T10:30:00.000Z',
            updatedAt: '2025-01-15T10:30:00.000Z',
          },
        ],
        nextCursor: 'cursor-xyz',
      }),
    ).toMatchSnapshot();
  });

  it('renders an empty list', () => {
    expect(
      renderProjectList({ items: [], nextCursor: null }),
    ).toMatchSnapshot();
  });
});

describe('renderMember', () => {
  it('renders a fully populated member', () => {
    expect(
      renderMember({
        userId: '00000000-0000-0000-0000-000000000030',
        displayName: 'Alice',
        phone: '+15550100300',
        role: 'editor',
        joinedAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });

  it('renders a member without display name', () => {
    expect(
      renderMember({
        userId: '00000000-0000-0000-0000-000000000031',
        displayName: null,
        phone: '+15550100301',
        role: 'viewer',
        joinedAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });
});

describe('renderMemberList', () => {
  it('renders a populated list', () => {
    expect(
      renderMemberList({
        items: [
          {
            userId: '00000000-0000-0000-0000-000000000040',
            displayName: 'Owner Person',
            phone: '+15550100400',
            role: 'owner',
            joinedAt: '2025-01-15T10:30:00.000Z',
          },
          {
            userId: '00000000-0000-0000-0000-000000000041',
            displayName: null,
            phone: '+15550100401',
            role: 'editor',
            joinedAt: '2025-01-15T10:30:00.000Z',
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  it('renders an empty member list', () => {
    expect(renderMemberList({ items: [] })).toMatchSnapshot();
  });
});

describe('renderReport', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000050',
    projectId: '00000000-0000-0000-0000-000000000010',
    status: 'draft' as const,
    visitDate: '2025-01-15',
    createdAt: '2025-01-15T10:30:00.000Z',
    updatedAt: '2025-01-15T11:00:00.000Z',
  };
  it('renders a draft report', () => {
    expect(renderReport(base)).toMatchSnapshot();
  });
  it('renders a finalized report', () => {
    expect(
      renderReport({
        ...base,
        status: 'finalized',
        finalizedAt: '2025-01-15T12:00:00.000Z',
        body: { weather: { condition: 'sunny' } },
      }),
    ).toMatchSnapshot();
  });
  it('renders a report missing optional fields', () => {
    expect(renderReport({ ...base, visitDate: null })).toMatchSnapshot();
  });
});

describe('renderReportList', () => {
  it('renders a populated list', () => {
    expect(
      renderReportList({
        items: [
          {
            id: '00000000-0000-0000-0000-000000000060',
            projectId: '00000000-0000-0000-0000-000000000010',
            status: 'draft',
            visitDate: '2025-01-15',
            createdAt: '2025-01-15T10:30:00.000Z',
            updatedAt: '2025-01-15T10:30:00.000Z',
          },
          {
            id: '00000000-0000-0000-0000-000000000061',
            projectId: '00000000-0000-0000-0000-000000000010',
            status: 'finalized',
            visitDate: null,
            createdAt: '2025-01-14T10:30:00.000Z',
            updatedAt: '2025-01-14T10:30:00.000Z',
          },
        ],
        nextCursor: null,
      }),
    ).toMatchSnapshot();
  });
  it('renders an empty list', () => {
    expect(renderReportList({ items: [], nextCursor: null })).toMatchSnapshot();
  });
});
