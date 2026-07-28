import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { DashboardShell } from './dashboard-shell';

const user = {
  id: 'usr_1',
  email: 'morgan@example.com',
  displayName: 'Morgan Lee',
  companyName: 'Northstar Builders',
};

describe('DashboardShell', () => {
  it('renders the global shell without project-only navigation', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <DashboardShell user={user} onSignOut={vi.fn()}>
          <h1>Projects</h1>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Harpa Pro' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
  });

  it('renders canonical project navigation and a working account menu', async () => {
    const interaction = userEvent.setup();
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={['/projects/harbor-house/members']}>
        <DashboardShell
          user={user}
          project={{
            name: 'Harbor House',
            slug: 'harbor-house',
            role: 'owner',
          }}
          onSignOut={onSignOut}
        >
          <h1>Members</h1>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/projects/harbor-house',
    );
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/projects/harbor-house/reports',
    );
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/projects/harbor-house/members',
    );
    expect(screen.getByRole('link', { name: 'Project settings' })).toHaveAttribute(
      'href',
      '/projects/harbor-house/settings',
    );

    await interaction.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(screen.getByText('morgan@example.com')).toBeVisible();
    expect(screen.getByText('Northstar Builders')).toBeVisible();
    await interaction.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
