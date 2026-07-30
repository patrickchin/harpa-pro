/**
 * Account route — wires the auth session into the props-only
 * `Account` body.
 *
 * `useUpdateMeMutation` powers the inline editor (Save → PATCH /me
 * → session.refresh()). Avatar UI is intentionally absent.
 */
import { useCallback, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Account, type AccountProfile, type AccountSaveValues } from '@/screens/account';
import { useAuthSession } from '@/lib/auth/session';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import {
  useAccountDeletionPreviewQuery,
  useDeleteMeMutation,
  useUpdateMeMutation,
} from '@/lib/api/hooks';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';
import { clearImageCachesOnSignOut } from '@/lib/files/image-cache';
import { ApiError } from '@/lib/api/errors';

export default function AccountRoute() {
  const router = useRouter();
  const session = useAuthSession();
  const { user, refresh } = session;
  const { refreshing, onRefresh } = useRefresh([refresh]);
  const queryClient = useQueryClient();
  const updateMe = useUpdateMeMutation();
  const deleteMe = useDeleteMeMutation();
  const deletionPreview = useAccountDeletionPreviewQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

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
        const message = err instanceof Error ? err.message : "Couldn't save profile. Try again.";
        setSaveError(message);
        throw err;
      }
    },
    [updateMe, session],
  );

  const handleRequestDeletionPreview = useCallback(async () => {
    setDeleteAccountError(null);
    try {
      const result = await deletionPreview.refetch();
      if (result.error) throw result.error;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't load deletion details. Try again.";
      setDeleteAccountError(message);
    }
  }, [deletionPreview]);

  const finishDeletedSession = useCallback(async () => {
    queryClient.clear();
    await clearImageCachesOnSignOut();
    await session.signOut();
  }, [queryClient, session]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteAccountError(null);
    try {
      await deleteMe.mutateAsync();
      await finishDeletedSession();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await finishDeletedSession();
        return;
      }
      const message =
        err instanceof Error ? err.message : "Couldn't delete account. Try again.";
      setDeleteAccountError(message);
    }
  }, [deleteMe, finishDeletedSession]);

  return (
    <Account
      profile={profile}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as Href)}
      onSaveProfile={handleSaveProfile}
      isSaving={updateMe.isPending}
      saveError={saveError}
      deletionPreview={deletionPreview.data ?? null}
      isDeletionPreviewLoading={deletionPreview.isFetching}
      isDeletingAccount={deleteMe.isPending}
      deleteAccountError={deleteAccountError}
      onRequestDeletionPreview={handleRequestDeletionPreview}
      onDeleteAccount={handleDeleteAccount}
      actions={<AppHeaderActions />}
    />
  );
}
