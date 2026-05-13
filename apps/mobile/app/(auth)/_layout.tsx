/**
 * (auth) group layout — auth flow screens (sign-in/phone, sign-in/verify,
 * etc.). Auth gate redirects authenticated / needs-onboarding users away.
 *
 * If `status === 'authenticated'`, redirect to `/(app)/projects`.
 * If `status === 'needs-onboarding' && not on onboarding`, redirect to
 * `/(auth)/onboarding`.
 * Otherwise, render the Stack (no redirect).
 */
import { Stack, usePathname, Redirect } from 'expo-router';
import { useAuthSession } from '@/lib/auth/session';
import { decideAuthRedirect } from '@/lib/auth/auth-gate';

export default function AuthLayout() {
  const { status } = useAuthSession();
  const pathname = usePathname();

  // Auth gate: redirect authenticated / needs-onboarding users away.
  const target = decideAuthRedirect(status, pathname);
  if (target) {
    return <Redirect href={target as any} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
