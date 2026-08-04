import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DashboardShell } from './dashboard-shell';

const user = {
  id: 'usr_1',
  email: 'morgan@example.com',
  displayName: 'Morgan Lee',
  companyName: 'Northstar Builders',
};

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverMock {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('DashboardShell', () => {
  it('renders the global shell without project-only navigation', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <DashboardShell user={user} onSignOut={vi.fn()}>
          <h1>Projects</h1>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('brand-mark')).toHaveAttribute(
      'src',
      expect.stringContaining('brand-icon.svg'),
    );
    expect(screen.getByRole('link', { name: 'Harpa Pro' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    expect(document.querySelector('#dashboard-content > div')).toHaveClass(
      'max-w-app',
      'px-5',
      'sm:px-6',
      'xl:px-8',
    );
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
    const primaryNavigation = screen.getByRole('navigation', { name: 'Primary' });
    expect(primaryNavigation).toHaveClass('overflow-x-auto', 'lg:flex-col');
    expect(primaryNavigation.parentElement).toHaveClass('flex-wrap', 'lg:flex-nowrap');

    await interaction.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(screen.getByText('morgan@example.com')).toBeVisible();
    expect(screen.getByText('Northstar Builders')).toBeVisible();
    await interaction.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
