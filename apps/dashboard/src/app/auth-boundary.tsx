import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuthSession } from '@/features/auth';
import { resolveAuthRedirect } from '@/features/auth/auth-state';

export function AuthBoundary(): React.JSX.Element {
  const { status } = useAuthSession();
  const location = useLocation();
  const returnTo =
    typeof location.state?.from === 'string'
      ? location.state.from
      : `${location.pathname}${location.search}`;
  const redirect = resolveAuthRedirect(status, location.pathname, returnTo);

  if (status === 'loading') {
    return (
      <main
        className="grid min-h-screen place-content-center place-items-center gap-3 bg-background px-5 py-10 text-center"
        aria-busy="true"
      >
        <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-accent" />
        <p className="text-body text-muted-foreground">Opening Harpa Pro…</p>
      </main>
    );
  }

  if (redirect) {
    const keepsReturnIntent = redirect === '/sign-in' || redirect === '/onboarding';
    return (
      <Navigate replace state={keepsReturnIntent ? { from: returnTo } : undefined} to={redirect} />
    );
  }

  return <Outlet />;
}
