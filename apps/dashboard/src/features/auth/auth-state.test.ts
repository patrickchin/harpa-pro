import { describe, expect, it } from 'vitest';

import { deriveAuthStatus, resolveAuthRedirect, type DashboardAuthStatus } from './auth-state';

describe('resolveAuthRedirect', () => {
  const cases: Array<{
    status: DashboardAuthStatus;
    pathname: string;
    returnTo?: string;
    expected: string | null;
  }> = [
    { status: 'loading', pathname: '/projects', expected: null },
    {
      status: 'unauthenticated',
      pathname: '/projects',
      expected: '/sign-in',
    },
    {
      status: 'unauthenticated',
      pathname: '/sign-in',
      expected: null,
    },
    {
      status: 'needs-onboarding',
      pathname: '/projects',
      expected: '/onboarding',
    },
    {
      status: 'needs-onboarding',
      pathname: '/onboarding',
      expected: null,
    },
    {
      status: 'authenticated',
      pathname: '/sign-in',
      expected: '/projects',
    },
    {
      status: 'authenticated',
      pathname: '/sign-in',
      returnTo: '/projects/harbor-house/reports/7?tab=review',
      expected: '/projects/harbor-house/reports/7?tab=review',
    },
    {
      status: 'authenticated',
      pathname: '/onboarding',
      expected: '/projects',
    },
    {
      status: 'authenticated',
      pathname: '/onboarding',
      returnTo: '/projects/harbor-house/reports?status=draft',
      expected: '/projects/harbor-house/reports?status=draft',
    },
    {
      status: 'authenticated',
      pathname: '/sign-in',
      returnTo: 'https://attacker.example/projects',
      expected: '/projects',
    },
    {
      status: 'authenticated',
      pathname: '/projects',
      expected: null,
    },
  ];

  it.each(cases)(
    'returns $expected for $status at $pathname',
    ({ status, pathname, returnTo, expected }) => {
      expect(resolveAuthRedirect(status, pathname, returnTo)).toBe(expected);
    },
  );
});

describe('deriveAuthStatus', () => {
  it('keeps the boot gate pending while the session is loading', () => {
    expect(deriveAuthStatus(null, true)).toBe('loading');
  });

  it('requires a session before entering the dashboard', () => {
    expect(deriveAuthStatus(null, false)).toBe('unauthenticated');
  });

  it('routes signed-in users without a display name through onboarding', () => {
    expect(deriveAuthStatus({ displayName: null }, false)).toBe('needs-onboarding');
  });

  it('accepts a named signed-in user', () => {
    expect(deriveAuthStatus({ displayName: 'Morgan Lee' }, false)).toBe('authenticated');
  });
});
