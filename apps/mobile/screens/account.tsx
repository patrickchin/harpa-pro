/**
 * Account screen body — props-only, no API / auth / secure-store coupling.
 *
 * Ported from `../haru3-reports/apps/mobile/app/account.tsx` on branch
 * `dev`. Renders the account details form with an avatar slot, email
 * (read-only — managed via OTP) + inline-editable display name +
 * company name.
 *
 * Editing model:
 *  - The form starts read-only with an "Edit" affordance.
 *  - Tapping "Edit" flips the name + company inputs to editable. The
 *    route owns the persistence side via `onSaveProfile` (optimistic
 *    via `useUpdateMeMutation`).
 *  - "Save" calls `onSaveProfile(values)` and returns to read-only on
 *    success; "Cancel" reverts to the original values.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Trash2, User } from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { AccountDetailsSkeleton } from '@/components/skeletons/AccountDetailsSkeleton';
import { colors } from '@/lib/design-tokens/colors';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';

export interface AccountProfile {
  email: string;
  fullName: string | null;
  companyName: string | null;
}

export interface AccountSaveValues {
  displayName: string;
  companyName: string;
}

export interface AccountDeletionProject {
  id: string;
  name: string;
}

export interface AccountDeletionTransferProject extends AccountDeletionProject {
  newOwnerId: string;
  newOwnerEmail: string;
}

export interface AccountDeletionPreview {
  email: string;
  soloProjectsDeleted: AccountDeletionProject[];
  sharedProjectsTransferred: AccountDeletionTransferProject[];
  sharedProjectsLeft: AccountDeletionProject[];
  personalFilesDeleted: number;
}

export interface AccountScreenProps {
  profile: AccountProfile | null;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  /**
   * Avatar slot — rendered above the form. Optional so the dev mirror /
   * tests can inject a placeholder; the real route passes
   * `<AvatarUploader />`.
   */
  avatarSlot?: ReactNode;
  /**
   * Persist edited values. The route is expected to call
   * `useUpdateMeMutation` optimistically and resolve / reject this
   * promise. When unset, the inline editor is hidden (read-only mode).
   */
  onSaveProfile?: (values: AccountSaveValues) => Promise<void>;
  /** Set when an in-flight save is pending; disables Save/Cancel. */
  isSaving?: boolean;
  /** Surfaces a save error inside the form. */
  saveError?: string | null;

  deletionPreview?: AccountDeletionPreview | null;
  isDeletionPreviewLoading?: boolean;
  isDeletingAccount?: boolean;
  deleteAccountError?: string | null;
  onRequestDeletionPreview?: () => void | Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  actions?: ReactNode;
}

function DefaultAvatarPlaceholder() {
  return (
    <View
      testID="account-avatar-placeholder"
      className="h-24 w-24 items-center justify-center rounded-full border border-border bg-card"
    >
      <User size={40} color={colors.muted.foreground} />
    </View>
  );
}

export function Account({
  profile,
  refreshing,
  onRefresh,
  onBack,
  avatarSlot,
  onSaveProfile,
  isSaving = false,
  saveError = null,
  deletionPreview = null,
  isDeletionPreviewLoading = false,
  isDeletingAccount = false,
  deleteAccountError = null,
  onRequestDeletionPreview,
  onDeleteAccount,
  actions,
}: AccountScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');

  // Layout-shift probes — the same ids are attached in
  // `AccountDetailsSkeleton` so we can measure how far each landmark
  // moves between the skeleton frame and the loaded frame.
  const onAvatarLayout = useLayoutShiftProbe('account:avatar');
  const onInfoNoticeLayout = useLayoutShiftProbe('account:info-notice');
  const onEmailFieldLayout = useLayoutShiftProbe('account:email-field');
  const onCompanyFieldLayout = useLayoutShiftProbe('account:company-field');

  // Reset draft fields whenever the underlying profile changes (e.g.
  // refresh) and we aren't actively editing.
  useEffect(() => {
    if (!isEditing) {
      setEditName(profile?.fullName ?? '');
      setEditCompany(profile?.companyName ?? '');
    }
  }, [profile?.fullName, profile?.companyName, isEditing]);

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background" testID="screen-account-loading">
        <View className="px-5 py-4">
          <ScreenHeader
            title="Account Details"
            onBack={onBack}
            backLabel="Profile"
            actions={actions}
          />
        </View>
        <AccountDetailsSkeleton canEdit={typeof onSaveProfile === 'function'} />
      </SafeAreaView>
    );
  }

  const canEdit = typeof onSaveProfile === 'function';
  const canDeleteAccount = typeof onDeleteAccount === 'function';
  const nameValue = isEditing ? editName : (profile.fullName ?? '');
  const companyValue = isEditing ? editCompany : (profile.companyName ?? '');
  const expectedDeleteEmail = profile.email.trim().toLowerCase();
  const deleteEmailMatches =
    deleteConfirmEmail.trim().toLowerCase() === expectedDeleteEmail;

  const handleStartEdit = () => {
    setEditName(profile.fullName ?? '');
    setEditCompany(profile.companyName ?? '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditName(profile.fullName ?? '');
    setEditCompany(profile.companyName ?? '');
  };

  const handleSave = async () => {
    if (!onSaveProfile) return;
    const trimmedName = editName.trim();
    const trimmedCompany = editCompany.trim();
    try {
      await onSaveProfile({
        displayName: trimmedName,
        companyName: trimmedCompany,
      });
      setIsEditing(false);
    } catch {
      // The route surfaces `saveError`; keep the editor open.
    }
  };

  const handleOpenDeleteDialog = async () => {
    setDeleteConfirmEmail('');
    setDeleteDialogVisible(true);
    try {
      await onRequestDeletionPreview?.();
    } catch {
      // Route-owned error state is rendered in the dialog.
    }
  };

  const handleConfirmDelete = async () => {
    if (!onDeleteAccount || !deleteEmailMatches || isDeletingAccount) return;
    await onDeleteAccount();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" testID="screen-account">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1">
          <View className="px-5 py-4">
            <ScreenHeader
              title="Account Details"
              onBack={onBack}
              backLabel="Profile"
              actions={actions}
            />
          </View>

          <View className="flex-1">
            <ScrollView
              className="flex-1 px-5"
              contentContainerStyle={{ gap: 20, paddingBottom: 40 }}
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
            <View
              className="items-center pt-2"
              onLayout={onAvatarLayout}
            >
              {avatarSlot ?? <DefaultAvatarPlaceholder />}
            </View>

            <View onLayout={onInfoNoticeLayout}>
              <InlineNotice tone="info">
                Email is managed through sign-in. Contact support if you need to recover access to a different address.
              </InlineNotice>
            </View>

            <View onLayout={onEmailFieldLayout}>
              <Input
                label="Email"
                value={profile.email}
                editable={false}
              />
            </View>
            <Input
              label="Full Name"
              testID="input-full-name"
              value={nameValue}
              editable={isEditing && !isSaving}
              onChangeText={setEditName}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Your full name"
            />
            <View onLayout={onCompanyFieldLayout}>
              <Input
                label="Company Name"
                testID="input-company-name"
                value={companyValue}
                editable={isEditing && !isSaving}
                onChangeText={setEditCompany}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your company"
              />
            </View>

            {saveError ? (
              <View testID="account-save-error">
                <InlineNotice tone="danger">{saveError}</InlineNotice>
              </View>
            ) : null}

            {canEdit && !isEditing ? (
              <Button
                testID="btn-edit-profile"
                variant="secondary"
                size="lg"
                onPress={handleStartEdit}
              >
                <Text className="text-base font-semibold text-foreground">
                  Edit
                </Text>
              </Button>
            ) : canEdit && isEditing ? (
              <View className="gap-3">
                <Button
                  testID="btn-save-profile"
                  variant="default"
                  size="lg"
                  onPress={() => {
                    void handleSave();
                  }}
                  disabled={isSaving}
                >
                  <Text className="text-base font-semibold text-background">
                    {isSaving ? 'Saving…' : 'Save'}
                  </Text>
                </Button>
                <Button
                  testID="btn-cancel-edit"
                  variant="secondary"
                  size="lg"
                  onPress={handleCancel}
                  disabled={isSaving}
                >
                  <Text className="text-base font-semibold text-foreground">
                    Cancel
                  </Text>
                </Button>
              </View>
            ) : null}

            {canDeleteAccount ? (
              <View className="gap-3 border-t border-border pt-2">
                <InlineNotice tone="warning">
                  Account deletion is permanent. Solo projects are deleted;
                  shared projects remain for other members.
                </InlineNotice>
                <Button
                  testID="btn-open-delete-account"
                  variant="destructive"
                  size="lg"
                  onPress={() => {
                    void handleOpenDeleteDialog();
                  }}
                  disabled={isDeletingAccount}
                >
                  <View className="flex-row items-center justify-center gap-2">
                    <Trash2 size={16} color={colors.danger.text} />
                    <Text className="text-base font-semibold text-danger-text">
                      Delete account
                    </Text>
                  </View>
                </Button>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>

      {canDeleteAccount ? (
        <AppDialogSheet
          visible={deleteDialogVisible}
          title="Delete account?"
          message="This permanently deletes your Harpa Pro account, signs out all devices, and removes personal account data. Shared project records may remain visible to the other members."
          noticeTone="warning"
          canDismiss={!isDeletingAccount}
          onClose={() => {
            if (!isDeletingAccount) {
              setDeleteDialogVisible(false);
            }
          }}
          actions={[
            {
              testID: 'btn-confirm-delete-account',
              label: isDeletingAccount ? 'Deleting…' : 'Delete account',
              variant: 'destructive',
              disabled:
                !deleteEmailMatches ||
                isDeletingAccount ||
                isDeletionPreviewLoading,
              onPress: () => {
                void handleConfirmDelete();
              },
            },
            {
              label: 'Cancel',
              variant: 'secondary',
              disabled: isDeletingAccount,
              onPress: () => setDeleteDialogVisible(false),
            },
          ]}
        >
          <View className="gap-4">
            {isDeletionPreviewLoading ? (
              <Text className="text-body text-muted-foreground">
                Loading deletion details…
              </Text>
            ) : deletionPreview ? (
              <View className="gap-2">
                <DeletionPreviewLine
                  label="Projects deleted"
                  items={deletionPreview.soloProjectsDeleted}
                  fallback="None"
                />
                <DeletionPreviewLine
                  label="Ownership transferred"
                  items={deletionPreview.sharedProjectsTransferred}
                  fallback="None"
                  getSuffix={(item) => `to ${item.newOwnerEmail}`}
                />
                <DeletionPreviewLine
                  label="Projects left"
                  items={deletionPreview.sharedProjectsLeft}
                  fallback="None"
                />
                <Text className="text-sm text-muted-foreground">
                  {deletionPreview.personalFilesDeleted} file row
                  {deletionPreview.personalFilesDeleted === 1 ? '' : 's'} owned by
                  this account will be removed.
                </Text>
              </View>
            ) : (
              <Text className="text-body text-muted-foreground">
                Deletion details are unavailable. You can retry or cancel.
              </Text>
            )}

            <Input
              label="Type your email to confirm"
              testID="input-delete-account-email"
              value={deleteConfirmEmail}
              editable={!isDeletingAccount}
              onChangeText={setDeleteConfirmEmail}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={profile.email}
            />

            {deleteAccountError ? (
              <InlineNotice tone="danger">{deleteAccountError}</InlineNotice>
            ) : null}
          </View>
        </AppDialogSheet>
      ) : null}
    </SafeAreaView>
  );
}

function DeletionPreviewLine<T extends AccountDeletionProject>({
  label,
  items,
  fallback,
  getSuffix,
}: {
  label: string;
  items: T[];
  fallback: string;
  getSuffix?: (item: T) => string;
}) {
  const body = items.length
    ? items.map((item) => `${item.name}${getSuffix ? ` ${getSuffix(item)}` : ''}`).join(', ')
    : fallback;
  return (
    <Text className="text-sm text-muted-foreground">
      <Text className="font-semibold text-foreground">{label}: </Text>
      {body}
    </Text>
  );
}
