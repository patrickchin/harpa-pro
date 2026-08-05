import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '@/features/auth';
import type { DashboardAuthStatus } from '@/features/auth/auth-state';
import { AuthBoundary } from './auth-boundary';

vi.mock('@/features/auth', () => ({
  useAuthSession: vi.fn(),
}));

const useAuthSessionMock = vi.mocked(useAuthSession);

function LocationProbe(): React.JSX.Element {
  const location = useLocation();

  return (
    <>
      <p>Path: {location.pathname}</p>
      <p>Query: {location.search}</p>
      <p>From: {String(location.state?.from ?? '')}</p>
    </>
  );
}

function mockSession(status: DashboardAuthStatus): void {
  useAuthSessionMock.mockReturnValue({
    status,
    user: null,
    refresh: vi.fn(),
    signOut: vi.fn(),
  });
}

function BoundaryRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AuthBoundary />}>
        <Route path="/sign-in" element={<LocationProbe />} />
        <Route path="/onboarding" element={<LocationProbe />} />
        <Route path="/projects" element={<p>Project directory</p>} />
        <Route path="/projects/:project/reports/:number" element={<LocationProbe />} />
      </Route>
    </Routes>
  );
}

function renderBoundary(
  status: DashboardAuthStatus,
  initialEntry = '/projects',
): ReturnType<typeof render> {
  mockSession(status);

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BoundaryRoutes />
    </MemoryRouter>,
  );
}

describe('AuthBoundary', () => {
  beforeEach(() => {
    useAuthSessionMock.mockReset();
  });

  it('keeps protected content behind the session loading gate', () => {
    renderBoundary('loading');

    expect(screen.getByText('Opening Harpa Pro…')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Project directory')).not.toBeInTheDocument();
  });

  it('redirects signed-out users and retains their requested URL', () => {
    renderBoundary('unauthenticated', '/projects?sort=recent');

    expect(screen.getByText('Path: /sign-in')).toBeVisible();
    expect(screen.getByText('From: /projects?sort=recent')).toBeVisible();
  });

  it('preserves a deep link and query through sign-in and onboarding', () => {
    const requested = '/projects/harbor-house/reports/7?tab=review';
    const rendered = renderBoundary('unauthenticated', requested);

    expect(screen.getByText('Path: /sign-in')).toBeVisible();
    expect(screen.getByText(`From: ${requested}`)).toBeVisible();

    mockSession('needs-onboarding');
    rendered.rerender(
      <MemoryRouter initialEntries={[requested]}>
        <BoundaryRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText('Path: /onboarding')).toBeVisible();
    expect(screen.getByText(`From: ${requested}`)).toBeVisible();

    mockSession('authenticated');
    rendered.rerender(
      <MemoryRouter initialEntries={[requested]}>
        <BoundaryRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText('Path: /projects/harbor-house/reports/7')).toBeVisible();
    expect(screen.getByText('Query: ?tab=review')).toBeVisible();
  });

  it('routes incomplete accounts through onboarding', () => {
    renderBoundary('needs-onboarding');

    expect(screen.getByText('Path: /onboarding')).toBeVisible();
  });

  it('renders the requested protected route for an authenticated user', () => {
    renderBoundary('authenticated');

    expect(screen.getByText('Project directory')).toBeVisible();
  });
});
