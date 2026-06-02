/**
 * Profile (settings) route — wires the auth session, sign-out, and
 * query-cache clearing into the props-only `Profile` body.
 *
 * The Profile screen no longer renders inline usage stats or the AI
 * provider picker; those live on `/usage` and `/developer`
 * respectively. This route only needs auth + navigation + cache.
 */
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Profile } from '@/screens/profile';
import { useAuthSession } from '@/lib/auth/session';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';
import { clearImageCachesOnSignOut } from '@/lib/files/image-cache';

export default function ProfileRoute() {
  const router = useRouter();
  const { status, user, signOut } = useAuthSession();
  const queryClient = useQueryClient();

  const { refreshing, onRefresh } = useRefresh([]);

  return (
    <Profile
      user={
        user
          ? {
              displayName: user.displayName,
              companyName: user.companyName,
              email: user.email,
            }
          : null
      }
      isLoading={status === 'loading'}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/projects')}
      onPressAccount={() => router.push('/(app)/account' as Href)}
      onPressUsage={() => router.push('/(app)/usage' as Href)}
      onPressDeveloper={() => router.push('/(app)/developer' as Href)}
      onSignOut={async () => {
        await signOut();
        // Auth gate in (app)/_layout.tsx redirects automatically when
        // status becomes 'unauthenticated'. Explicit navigation here
        // causes a POP_TO_TOP error because the (app) stack is already
        // unmounting.
      }}
      onClearCache={async () => {
        queryClient.clear();
        await Promise.all([
          clearImageCachesOnSignOut(),
          queryClient.refetchQueries({ type: 'active' }),
        ]);
      }}
      showDeveloperSection
      actions={<AppHeaderActions />}
    />
  );
}
