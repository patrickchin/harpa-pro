import type { projects, reports } from '@harpa/api-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { ProjectOverview } from './project-overview';

const baseProject: projects.Project = {
  id: 'prj_1',
  name: 'Harbor House',
  clientName: 'Northstar Developments',
  address: '18 Pier Road',
  ownerId: 'usr_1',
  myRole: 'owner',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-29T08:00:00.000Z',
  stats: {
    totalReports: 12,
    drafts: 3,
    lastReportAt: '2026-07-28T08:00:00.000Z',
  },
};

const members: Array<z.infer<typeof projects.projectMember>> = [
  {
    userId: 'usr_1',
    displayName: 'Morgan Lee',
    email: 'morgan@example.com',
    role: 'owner',
    joinedAt: '2026-07-01T00:00:00.000Z',
  },
];

const recentReports: reports.Report[] = [
  {
    id: 'rpt_1',
    number: 14,
    projectId: baseProject.id,
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
    notesSinceLastGeneration: 1,
    notesChangedAt: '2026-07-29T07:30:00.000Z',
    generatedAt: null,
    needsRegeneration: true,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-29T07:30:00.000Z',
  },
];

describe('ProjectOverview', () => {
  it('summarizes report status and exposes the writer actions', async () => {
    const user = userEvent.setup();
    const onCreateReport = vi.fn();
    render(
      <MemoryRouter>
        <ProjectOverview project={baseProject} members={members} onCreateReport={onCreateReport} />
      </MemoryRouter>,
    );

    expect(screen.getByText('12', { selector: '[data-stat-value]' })).toBeVisible();
    expect(screen.getByText('3', { selector: '[data-stat-value]' })).toBeVisible();
    expect(screen.getByText('Morgan Lee')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View all members' })).toHaveAttribute(
      'href',
      '/projects/prj_1/members',
    );
    expect(screen.getByRole('button', { name: 'New report' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue work' })).toHaveAttribute(
      'href',
      '/projects/prj_1/reports?status=draft',
    );

    await user.click(screen.getByRole('button', { name: 'New report' }));

    expect(onCreateReport).toHaveBeenCalledOnce();
  });

  it('shows recent reports with status and a direct workspace link', () => {
    render(
      <MemoryRouter>
        <ProjectOverview
          project={baseProject}
          members={members}
          onCreateReport={vi.fn()}
          recentReports={recentReports}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Recent reports' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'East elevation progress' })).toHaveAttribute(
      'href',
      '/projects/prj_1/reports/14',
    );
    expect(screen.getByText('Draft')).toBeVisible();
    expect(screen.getByText('Needs update')).toBeVisible();
  });

  it('does not expose report mutation controls to a viewer', () => {
    render(
      <MemoryRouter>
        <ProjectOverview
          project={{ ...baseProject, myRole: 'viewer' }}
          members={members}
          onCreateReport={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'New report' })).not.toBeInTheDocument();
  });
});
