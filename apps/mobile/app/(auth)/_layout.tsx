/**
 * (auth) group layout — auth flow screens (sign-in/phone, sign-in/verify,
 * etc.). Auth gate redirects authenticated / needs-onboarding users away.
 *
 * If `status === 'authenticated'`, redirect to `/(app)/projects`.
 * If `status === 'needs-onboarding' && not on onboarding`, redirect to
 * `/(auth)/onboarding`.
 * Otherwise, render the Stack (no redirect).
 */
import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useAuthSession } from '@/lib/auth/session';
import { decideAuthRedirect } from '@/lib/auth/auth-gate';

export default function AuthLayout() {
  const { status } = useAuthSession();
  const pathname = usePathname();
  const router = useRouter();

  // Auth gate: redirect authenticated / needs-onboarding users away.
  useEffect(() => {
    const target = decideAuthRedirect(status, pathname);
    if (target) {
      router.replace(target as any);
    }
  }, [status, pathname, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
