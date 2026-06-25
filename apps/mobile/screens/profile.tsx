/**
 * Profile (settings) screen body — props-only, no API / auth /
 * secure-store / router coupling.
 *
 * Layout:
 *  - Top user card is a single Pressable that links to the Account
 *    Details screen. Tapping anywhere on the card navigates; there
 *    is no separate "Account Details" row.
 *  - Usage This Month is a plain link row (no inline stats); the
 *    detail screen at `/usage` owns the breakdown.
 *  - Developer options have moved to their own screen (`/developer`)
 *    and surface here as a single gated link row.
 *
 * The body still owns the clear-cache confirm dialog (AppDialogSheet,
 * no Alert.alert).
 */
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Bell,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Trash2,
  User,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { BuildBadge } from '@/components/primitives/BuildBadge';
import { colors } from '@/lib/design-tokens/colors';

export interface ProfileUser {
  displayName: string | null;
  companyName: string | null;
  email: string | null;
}

export interface ProfileScreenProps {
  user: ProfileUser | null;
  isLoading: boolean;

  refreshing: boolean;
  onRefresh: () => void;

  onBack: () => void;
  onPressAccount: () => void;
  onPressUsage: () => void;
  onPressPrivacyPolicy: () => void;
  onPressDeveloper: () => void;

  /** Best-effort sign-out invoked from the destructive Sign Out button.
   * Returns a promise; the body shows no busy state for this. */
  onSignOut: () => void | Promise<void>;

  /** Clear-cache invoked from the confirm dialog. Body owns the
   * spinner state. Returns a promise so the body can show "Clearing…". */
  onClearCache: () => Promise<void>;

  /** Developer link visibility — gated on `DEV_TOOLS_VISIBLE` at the
   * call site. Prop (not import) so dev mirrors / tests can flip it
   * without env-var gymnastics. */
  showDeveloperSection: boolean;

  actions?: ReactNode;
}

interface SectionLink {
  label: string;
  Icon: LucideIcon;
  onPress?: () => void;
  testID?: string;
}

export function Profile({
  user,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
  onPressAccount,
  onPressUsage,
  onPressPrivacyPolicy,
  onPressDeveloper,
  onSignOut,
  onClearCache,
  showDeveloperSection,
  actions,
}: ProfileScreenProps) {
  const [clearCacheDialogVisible, setClearCacheDialogVisible] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      await onClearCache();
    } finally {
      setIsClearingCache(false);
      setClearCacheDialogVisible(false);
    }
  };

  const displayName = user?.displayName?.trim() || 'New User';
  const companyName = user?.companyName?.trim() || 'Add your company details';
  const email = user?.email?.trim() || 'No email on file';

  const sections: SectionLink[] = [
    {
      label: 'Usage This Month',
      Icon: Zap,
      onPress: onPressUsage,
      testID: 'btn-open-usage',
    },
    {
      label: 'Privacy Policy',
      Icon: ShieldCheck,
      onPress: onPressPrivacyPolicy,
      testID: 'btn-open-privacy-policy',
    },
    { label: 'Notifications', Icon: Bell },
  ];

  if (showDeveloperSection) {
    sections.push({
      label: 'Developer',
      Icon: Wrench,
      onPress: onPressDeveloper,
      testID: 'btn-open-developer',
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} testID="screen-profile">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 pt-4 pb-6 gap-5">
          <ScreenHeader title="Profile" onBack={onBack} actions={actions} />

          <Pressable testID="btn-open-account" onPress={onPressAccount}>
            <Card variant="emphasis" className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-xl border border-border bg-card">
                <User size={24} color={colors.foreground} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text testID="profile-display-name" className="text-title text-foreground">
                  {displayName}
                </Text>
                <Text testID="profile-email" className="text-body text-muted-foreground">
                  {email}
                </Text>
                <Text testID="profile-company-name" className="text-sm text-muted-foreground">
                  {companyName}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.muted.foreground} />
            </Card>
          </Pressable>
        </View>

        {isLoading && (
          <View className="px-5 pb-4">
            <Card className="flex-row items-center gap-3">
              <ActivityIndicator color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Loading your account details…
              </Text>
            </Card>
          </View>
        )}

        <View className="gap-2 px-5">
          {sections.map((item) => {
            const disabled = !item.onPress;
            return (
              <View key={item.label}>
                <Pressable
                  onPress={item.onPress}
                  disabled={disabled}
                  testID={item.testID}
                >
                  <Card className="flex-row items-center gap-4">
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <item.Icon
                        size={20}
                        color={
                          disabled ? colors.muted.disabled : colors.muted.foreground
                        }
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={
                          disabled
                            ? 'text-title-sm text-muted-foreground'
                            : 'text-title-sm text-foreground'
                        }
                      >
                        {item.label}
                      </Text>
                    </View>
                    <ChevronRight
                      size={16}
                      color={
                        disabled ? colors.muted.disabled : colors.muted.foreground
                      }
                    />
                  </Card>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View className="mt-8 px-5">
          <Button
            testID="btn-clear-cache"
            onPress={() => setClearCacheDialogVisible(true)}
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={isClearingCache}
          >
            <View className="flex-row items-center justify-center gap-2">
              {isClearingCache ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Trash2 size={16} color={colors.foreground} />
              )}
              <Text className="text-base font-semibold text-foreground">
                {isClearingCache ? 'Clearing…' : 'Clear cached data'}
              </Text>
            </View>
          </Button>
        </View>

        <View className="mt-4 px-5">
          <Button
            testID="btn-sign-out"
            onPress={() => {
              void onSignOut();
            }}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            <View className="flex-row items-center justify-center gap-2">
              <LogOut size={16} color={colors.danger.text} />
              <Text className="text-base font-semibold text-danger-text">Sign Out</Text>
            </View>
          </Button>
        </View>

        <AppDialogSheet
          visible={clearCacheDialogVisible}
          title="Clear cached data?"
          message="This empties the in-memory query cache and refetches the screens you have open. Use this if reports or voice notes look stale or out of place."
          noticeTone="warning"
          onClose={() => setClearCacheDialogVisible(false)}
          actions={[
            {
              testID: 'btn-confirm-clear-cache',
              label: isClearingCache ? 'Clearing…' : 'Clear cache',
              variant: 'destructive',
              onPress: () => {
                void handleClearCache();
              },
              disabled: isClearingCache,
            },
            {
              label: 'Cancel',
              variant: 'secondary',
              onPress: () => setClearCacheDialogVisible(false),
            },
          ]}
        />

        <BuildBadge testID="profile-build-badge" />
      </ScrollView>
    </SafeAreaView>
  );
}
