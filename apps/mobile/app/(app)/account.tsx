/**
 * Account route — wires the auth session into the props-only
 * `Account` body.
 *
 * P3.15.4 wiring:
 *  - `useUpdateMeMutation` powers the inline editor (Save → PATCH /me
 *    → session.refresh()).
 *  - `<AvatarUploader />` is injected as the avatar slot. The fileId
 *    is persisted to AsyncStorage from inside the uploader (no
 *    backend route yet — see NOTE in AvatarUploader; P4).
 */
import { useCallback, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import { Account, type AccountProfile, type AccountSaveValues } from '@/screens/account';
import { AvatarUploader } from '@/components/account/AvatarUploader';
import { useAuthSession } from '@/lib/auth/session';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { useUpdateMeMutation } from '@/lib/api/hooks';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function AccountRoute() {
  const router = useRouter();
  const session = useAuthSession();
  const { user, refresh } = session;
  const { refreshing, onRefresh } = useRefresh([refresh]);
  const updateMe = useUpdateMeMutation();
  const [saveError, setSaveError] = useState<string | null>(null);

  const profile: AccountProfile | null = user
    ? {
        email: user.email,
        fullName: user.displayName,
        companyName: user.companyName,
      }
    : null;

  const handleSaveProfile = useCallback(
    async ({ displayName, companyName }: AccountSaveValues) => {
      setSaveError(null);
      try {
        await updateMe.mutateAsync({
          body: { displayName, companyName },
        });
        await session.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save profile.';
        setSaveError(message);
        throw err;
      }
    },
    [updateMe, session],
  );

  return (
    <Account
      profile={profile}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as Href)}
      avatarSlot={<AvatarUploader />}
      onSaveProfile={handleSaveProfile}
      isSaving={updateMe.isPending}
      saveError={saveError}
      actions={<AppHeaderActions />}
    />
  );
}
