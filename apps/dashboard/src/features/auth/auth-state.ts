export type DashboardAuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'needs-onboarding'
  | 'authenticated';

interface SessionProfile {
  displayName: string | null;
}

export function deriveAuthStatus(
  user: SessionProfile | null,
  isPending: boolean,
): DashboardAuthStatus {
  if (isPending) return 'loading';
  if (!user) return 'unauthenticated';
  return user.displayName == null ? 'needs-onboarding' : 'authenticated';
}

const publicPaths = new Set(['/sign-in']);
const authFlowPaths = new Set(['/sign-in', '/onboarding']);

function safeReturnTo(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const base = new URL('https://dashboard.harpapro.test');
    const target = new URL(value, base);
    if (target.origin !== base.origin || authFlowPaths.has(target.pathname)) {
      return null;
    }
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export function resolveAuthRedirect(
  status: DashboardAuthStatus,
  pathname: string,
  returnTo?: string,
): string | null {
  if (status === 'loading') return null;
  if (status === 'unauthenticated') {
    return publicPaths.has(pathname) ? null : '/sign-in';
  }
  if (status === 'needs-onboarding') {
    return pathname === '/onboarding' ? null : '/onboarding';
  }
  if (authFlowPaths.has(pathname)) {
    return safeReturnTo(returnTo) ?? '/projects';
  }
  return null;
}
