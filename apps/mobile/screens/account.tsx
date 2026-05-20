/**
 * Account screen body — props-only, no API / auth / secure-store coupling.
 *
 * Ported from `../haru3-reports/apps/mobile/app/account.tsx` on branch
 * `dev`. Renders the read-only account details form with avatar slot,
 * phone (managed via OTP) + display name + company name fields.
 *
 * v3 used Supabase storage for the avatar via `AvatarUploader`; in v4
 * the upload pipeline isn't in scope for P3.13, so we accept an
 * optional `avatarSlot` ReactNode and the route passes a static
 * placeholder. Editing the fields lives in P4 (the route currently
 * keeps them read-only, matching canonical).
 */
import { RefreshControl, ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { User } from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Input } from '@/components/primitives/Input';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { AccountDetailsSkeleton } from '@/components/skeletons/AccountDetailsSkeleton';
import { colors } from '@/lib/design-tokens/colors';

export interface AccountProfile {
  phone: string;
  fullName: string | null;
  companyName: string | null;
}

export interface AccountScreenProps {
  profile: AccountProfile | null;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  /**
   * Avatar slot — rendered above the form. Optional so the route can
   * inject the real `AvatarUploader` once it lands (P4). When unset
   * we render a non-interactive placeholder.
   */
  avatarSlot?: ReactNode;
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
}: AccountScreenProps) {
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
            contentContainerStyle={{ gap: 20 }}
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
              value={profile.fullName ?? ''}
              editable={false}
            />
            <Input
              label="Company Name"
              value={profile.companyName ?? ''}
              editable={false}
            />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
