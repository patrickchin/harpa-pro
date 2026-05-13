/**
 * Auth gate decision functions — pure, testable.
 *
 * Two route groups have auth guards:
 *   - (auth) screens are FOR unauthenticated users. If you're already
 *     signed in, bounce to the app. If you need onboarding but aren't
 *     on the onboarding screen yet, bounce there.
 *   - (app) screens are FOR authenticated users. If you're not signed
 *     in or need onboarding, bounce to the appropriate auth screen.
 *
 * Both guards return a target route (string) or null (no redirect).
 * Wired in the respective _layout.tsx files via <Redirect> or
 * router.replace (Pitfall 5: single async flow, no setTimeout chains).
 */
import type { AuthStatus } from './session';

/**
 * (auth) route group gate. Decides whether an authenticated or
 * needs-onboarding user should redirect away from a public auth screen.
 *
 * @param status — current auth session status
 * @param pathname — expo-router pathname (e.g. `/(auth)/sign-in/phone`)
 * @returns redirect target or null (allow mount)
 */
export function decideAuthRedirect(status: AuthStatus, pathname: string): string | null {
  if (status === 'authenticated') {
    return '/(app)/projects';
  }
  // Security review §1 P1: exact match, not includes. The runtime path
  // from usePathname() is /(auth)/onboarding (confirmed via canonical).
  if (status === 'needs-onboarding' && pathname !== '/(auth)/onboarding') {
    return '/(auth)/onboarding';
  }
  return null;
}

/**
 * (app) route group gate. Decides whether an unauthenticated or
 * needs-onboarding user should redirect away from a protected screen.
 *
 * @param status — current auth session status
 * @returns redirect target or null (allow mount)
 */
export function decideAppRedirect(status: AuthStatus): string | null {
  if (status === 'unauthenticated') {
    return '/(auth)/sign-in/phone';
  }
  if (status === 'needs-onboarding') {
    return '/(auth)/onboarding';
  }
  return null;
}
