/**
 * Account screen body — props-only, no API / auth / secure-store coupling.
 *
 * Ported from `../haru3-reports/apps/mobile/app/account.tsx` on branch
 * `dev`. Renders the account details form with an avatar slot, phone
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
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { User } from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { AccountDetailsSkeleton } from '@/components/skeletons/AccountDetailsSkeleton';
import { colors } from '@/lib/design-tokens/colors';

export interface AccountProfile {
  phone: string;
  fullName: string | null;
  companyName: string | null;
}

export interface AccountSaveValues {
  displayName: string;
  companyName: string;
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
}: AccountScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');

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
          />
        </View>
        <AccountDetailsSkeleton />
      </SafeAreaView>
    );
  }

  const canEdit = typeof onSaveProfile === 'function';
  const nameValue = isEditing ? editName : (profile.fullName ?? '');
  const companyValue = isEditing ? editCompany : (profile.companyName ?? '');

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

  return (
    <SafeAreaView className="flex-1 bg-background" testID="screen-account">
      <View className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader
            title="Account Details"
            onBack={onBack}
            backLabel="Profile"
          />
        </View>

        <View className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20, paddingBottom: 40 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View className="items-center pt-2">
              {avatarSlot ?? <DefaultAvatarPlaceholder />}
            </View>

            <InlineNotice tone="info">
              Phone numbers are managed through sign-in. Contact support if you need to recover access to a different number.
            </InlineNotice>

            <Input
              label="Phone"
              value={profile.phone}
              editable={false}
            />
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
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
