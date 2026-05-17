/**
 * Account route — wires the auth session into the props-only
 * `Account` body.
 *
 * Editing fields + avatar upload are deferred to P4; this route shows
 * the read-only form pulling phone / displayName / companyName from
 * the session user.
 */
import { useRouter } from 'expo-router';

import { Account, type AccountProfile } from '@/screens/account';
import { useAuthSession } from '@/lib/auth/session';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

export default function AccountRoute() {
  const router = useRouter();
  const { user, refresh } = useAuthSession();
  const { refreshing, onRefresh } = useRefresh([refresh]);

  const profile: AccountProfile | null = user
    ? {
        phone: user.phone,
        fullName: user.displayName,
        companyName: user.companyName,
      }
    : null;

  return (
    <Account
      profile={profile}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as never)}
      // TODO(P4): inject real <AvatarUploader /> once the R2 upload
      // pipeline + signed-URL flow are stable.
    />
  );
}
