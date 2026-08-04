import type { projects as projectContract } from '@harpa/api-contract';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsPageView } from './projects-page-view';

const projects: projectContract.Project[] = [
  {
    id: 'prj_1',
    name: 'Harbor House',
    clientName: 'Northstar Developments',
    address: '18 Pier Road',
    ownerId: 'usr_1',
    myRole: 'owner',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T08:00:00.000Z',
  },
  {
    id: 'prj_2',
    name: 'Civic Annex',
    clientName: null,
    address: null,
    ownerId: 'usr_2',
    myRole: 'viewer',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
];

describe('ProjectsPageView', () => {
  it('retains a labelled semantic project table for wide screens', () => {
    render(
      <MemoryRouter>
        <ProjectsPageView projects={projects} onCreateProject={vi.fn()} />
      </MemoryRouter>,
    );

    const table = screen.getByRole('table', { name: 'Projects' });
    expect(within(table).getByRole('columnheader', { name: 'Project' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: 'Client' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: 'Address' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: 'Your role' })).toBeVisible();
    expect(within(table).getByRole('link', { name: 'Harbor House' })).toHaveAttribute(
      'href',
      '/projects/prj_1',
    );
    expect(within(table).getByText('Viewer')).toBeVisible();
    expect(within(table).getAllByText('Not provided')).toHaveLength(2);
  });

  it('renders a project card list with the same links, roles, and details', () => {
    render(
      <MemoryRouter>
        <ProjectsPageView projects={projects} onCreateProject={vi.fn()} />
      </MemoryRouter>,
    );

    const cardList = screen.getByRole('list', { name: 'Projects' });
    const cards = within(cardList).getAllByRole('listitem');
    expect(cards).toHaveLength(2);

    const harborCard = cards[0];
    expect(within(harborCard).getByRole('link', { name: 'Harbor House' })).toHaveAttribute(
      'href',
      '/projects/prj_1',
    );
    expect(within(harborCard).getByText('Owner')).toBeVisible();
    expect(within(harborCard).getByText('Northstar Developments')).toBeVisible();
    expect(within(harborCard).getByText('18 Pier Road')).toBeVisible();
    expect(within(harborCard).getByText('Last updated')).toBeVisible();

    const civicCard = cards[1];
    expect(within(civicCard).getByRole('link', { name: 'Civic Annex' })).toHaveAttribute(
      'href',
      '/projects/prj_2',
    );
    expect(within(civicCard).getByText('Viewer')).toBeVisible();
    expect(within(civicCard).getAllByText('Not provided')).toHaveLength(2);
  });

  it('switches from the table to cards below 1024px', () => {
    render(
      <MemoryRouter>
        <ProjectsPageView projects={projects} onCreateProject={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table', { name: 'Projects' }).parentElement).toHaveClass(
      'hidden',
      'lg:block',
    );
    expect(screen.getByRole('list', { name: 'Projects' })).toHaveClass(
      'grid',
      'gap-3',
      'lg:hidden',
    );
  });

  it('creates a project from the primary action', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <ProjectsPageView projects={[]} onCreateProject={onCreateProject} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No projects yet')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeVisible();

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), '  West Pier  ');
    await user.type(screen.getByRole('textbox', { name: 'Client' }), '  Ardent  ');
    await user.type(screen.getByRole('textbox', { name: 'Address' }), '  4 Dock Lane  ');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(onCreateProject).toHaveBeenCalledWith({
      name: 'West Pier',
      clientName: 'Ardent',
      address: '4 Dock Lane',
    });
  });

  it('enters the create dialog and restores the trigger after Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProjectsPageView projects={[]} onCreateProject={vi.fn()} />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'New project' });
    await user.click(trigger);

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
