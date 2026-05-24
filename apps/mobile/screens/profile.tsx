/**
 * Profile screen body — props-only, no API / auth / secure-store /
 * router coupling. Ported from
 * `../haru3-reports/apps/mobile/app/profile.tsx` on branch `dev`.
 *
 * The body owns:
 *  - the AI provider / model picker modal (provider → model step)
 *  - the clear-cache confirm dialog (AppDialogSheet, no Alert.alert)
 *
 * Everything else (auth session, usage query, provider list, query
 * cache clearing, copy-to-clipboard) flows in as typed props.
 *
 * v3 used Supabase token-usage rollups (input/output/cached tokens);
 * v4's `/me/usage` returns simpler `{ reports, voiceNotes }` rows, so
 * the body takes a generic `monthlyUsage` prop with `reportsCount` +
 * `voiceNotesCount`. The "Input / Output" StatTiles are gated to
 * appear only when `monthlyUsage.inputTokens` / `outputTokens` are
 * defined (deferred to P4).
 */
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Bell,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Trash2,
  User,
  Wrench,
  Zap,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { StatTile } from '@/components/primitives/StatTile';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { BuildBadge } from '@/components/primitives/BuildBadge';
import { colors } from '@/lib/design-tokens/colors';

export interface ProfileUser {
  displayName: string | null;
  companyName: string | null;
  phone: string | null;
}

export interface ProfileMonthlyUsage {
  reportsCount: number;
  /**
   * v4 `/me/usage` exposes voice-note counts plus monthly LLM token
   * totals; the route forwards both. `voiceNotesCount` renders as a
   * "Voice Notes" tile and `inputTokens` + `outputTokens` feed the
   * token tiles when present.
   */
  voiceNotesCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiProviderOption {
  key: string;
  label: string;
  desc: string;
}

export interface AiModelOption {
  id: string;
  label: string;
}

export interface ProfileScreenProps {
  user: ProfileUser | null;
  isLoading: boolean;

  monthlyUsage: ProfileMonthlyUsage | null;
  usageLoading: boolean;

  refreshing: boolean;
  onRefresh: () => void;

  onBack: () => void;
  onPressAccount: () => void;
  onPressUsage: () => void;

  /** Copy callback — invoked when user taps the name / phone / company.
   * The route owns the toast / clipboard write. */
  onCopy: (value: string, options: { toast: string }) => void;

  /** Best-effort sign-out invoked from the destructive Sign Out button.
   * Returns a promise; the body shows no busy state for this. */
  onSignOut: () => void | Promise<void>;

  /** Clear-cache invoked from the confirm dialog. Body owns the
   * spinner state. Returns a promise so the body can show "Clearing…". */
  onClearCache: () => Promise<void>;

  /** Developer section visibility — gated on `DEV_TOOLS_VISIBLE` at
   * the call site. Prop (not import) so dev mirrors / tests can flip
   * it without env-var gymnastics. */
  showDeveloperSection: boolean;

  /** AI provider picker — full controlled state. Pass empty arrays
   * when the AI provider picker isn't wired yet (P4). */
  aiProviders: ReadonlyArray<AiProviderOption>;
  aiProvider: string;
  onSelectProvider: (key: string) => void;
  aiModels: ReadonlyArray<AiModelOption>;
  aiModel: string;
  onSelectModel: (modelId: string) => void;
  /** Set of provider keys with API credentials configured. `null` =
   * not yet known (treat everything as available, matches canonical). */
  availableProviderKeys: ReadonlyArray<string> | null;

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
  monthlyUsage,
  usageLoading,
  refreshing,
  onRefresh,
  onBack,
  onPressAccount,
  onPressUsage,
  onCopy,
  onSignOut,
  onClearCache,
  showDeveloperSection,
  aiProviders,
  aiProvider,
  onSelectProvider,
  aiModels,
  aiModel,
  onSelectModel,
  availableProviderKeys,
  actions,
}: ProfileScreenProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState<'provider' | 'model'>('provider');
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

  const selectedProvider = aiProviders.find((p) => p.key === aiProvider);
  const selectedModel = aiModels.find((m) => m.id === aiModel) ?? aiModels[0];

  const displayName = user?.displayName?.trim() || 'New User';
  const companyName = user?.companyName?.trim() || 'Add your company details';
  const phoneNumber = user?.phone?.trim() || 'No phone number on file';
  const hasRealName = Boolean(user?.displayName?.trim());
  const hasRealCompany = Boolean(user?.companyName?.trim());
  const hasRealPhone = Boolean(user?.phone?.trim());

  const sections: SectionLink[] = [
    { label: 'Account Details', Icon: User, onPress: onPressAccount, testID: 'btn-open-account' },
    { label: 'Notifications', Icon: Bell },
  ];

  const formatTokenCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const usageTiles: ReactNode[] = [];
  if (monthlyUsage) {
    usageTiles.push(
      <StatTile
        key="reports"
        value={monthlyUsage.reportsCount}
        label="Reports"
        compact
        className="min-w-[29%] flex-1"
      />,
    );
    if (typeof monthlyUsage.voiceNotesCount === 'number') {
      usageTiles.push(
        <StatTile
          key="voice"
          value={monthlyUsage.voiceNotesCount}
          label="Voice Notes"
          compact
          className="min-w-[29%] flex-1"
        />,
      );
    }
    if (typeof monthlyUsage.inputTokens === 'number') {
      usageTiles.push(
        <StatTile
          key="in"
          value={formatTokenCount(monthlyUsage.inputTokens)}
          label="Input"
          compact
          className="min-w-[29%] flex-1"
        />,
      );
    }
    if (typeof monthlyUsage.outputTokens === 'number') {
      usageTiles.push(
        <StatTile
          key="out"
          value={formatTokenCount(monthlyUsage.outputTokens)}
          label="Output"
          compact
          className="min-w-[29%] flex-1"
        />,
      );
    }
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

          <Card variant="emphasis" className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-xl border border-border bg-card">
              <User size={24} color={colors.foreground} />
            </View>
            <View className="flex-1 gap-0.5">
              <Pressable
                onPress={() => hasRealName && onCopy(displayName, { toast: 'Name copied' })}
                disabled={!hasRealName}
                accessibilityRole={hasRealName ? 'button' : undefined}
                accessibilityLabel={hasRealName ? `Copy name: ${displayName}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-display-name" className="text-title text-foreground">
                  {displayName}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => hasRealPhone && onCopy(phoneNumber, { toast: 'Phone copied' })}
                disabled={!hasRealPhone}
                accessibilityRole={hasRealPhone ? 'button' : undefined}
                accessibilityLabel={hasRealPhone ? `Copy phone: ${phoneNumber}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-phone" className="text-body text-muted-foreground">
                  {phoneNumber}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => hasRealCompany && onCopy(companyName, { toast: 'Company copied' })}
                disabled={!hasRealCompany}
                accessibilityRole={hasRealCompany ? 'button' : undefined}
                accessibilityLabel={hasRealCompany ? `Copy company: ${companyName}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-company-name" className="text-sm text-muted-foreground">
                  {companyName}
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {isLoading && (
          <View className="px-5 pb-4">
            <Card className="flex-row items-center gap-3">
              <ActivityIndicator color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Loading your account details...
              </Text>
            </Card>
          </View>
        )}

        <View className="gap-2 px-5">
          {/* Usage stats card */}
          <View>
            <Pressable testID="btn-open-usage" onPress={onPressUsage}>
              <Card className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Zap size={18} color={colors.foreground} />
                    <Text className="text-title-sm text-foreground">
                      Usage This Month
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted.foreground} />
                </View>
                {usageLoading ? (
                  <View className="h-[84px] flex-row items-center justify-center">
                    <ActivityIndicator size="small" color={colors.foreground} />
                  </View>
                ) : monthlyUsage ? (
                  <View className="flex-row flex-wrap gap-3">{usageTiles}</View>
                ) : (
                  <View
                    testID="usage-empty-state"
                    className="h-[84px] flex-row items-center justify-center"
                  >
                    <Text
                      accessible
                      accessibilityLabel="No reports generated yet this month"
                      className="text-base text-muted-foreground"
                    >
                      No reports generated yet this month.
                    </Text>
                  </View>
                )}
              </Card>
            </Pressable>
          </View>

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

        {showDeveloperSection && aiProviders.length > 0 && (
          <View className="mt-6 px-5" testID="developer-section">
            <View className="mb-2 flex-row items-center gap-2">
              <Wrench size={16} color={colors.muted.foreground} />
              <Text className="text-label text-muted-foreground">Developer</Text>
            </View>

            <Card className="gap-3">
              <Pressable
                testID="btn-open-ai-model"
                onPress={() => {
                  setModalStep('provider');
                  setModalVisible(true);
                }}
              >
                <View className="flex-row items-center gap-3">
                  <Bot size={18} color={colors.muted.foreground} />
                  <View className="flex-1">
                    <Text className="text-title-sm text-foreground" selectable>
                      {selectedProvider?.label ?? 'Select provider'}
                      {selectedModel ? ` \u00b7 ${selectedModel.label}` : ''}
                    </Text>
                    <Text
                      testID="ai-model-id"
                      className="text-body text-muted-foreground"
                      numberOfLines={1}
                      selectable
                    >
                      {selectedModel?.id ?? selectedProvider?.desc ?? ''}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted.foreground} />
                </View>
              </Pressable>
            </Card>
          </View>
        )}

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable
            className="flex-1 justify-end bg-black/40"
            onPress={() => setModalVisible(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="bg-background pb-10"
            >
              <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
                <View className="flex-row items-center gap-2 flex-1">
                  {modalStep === 'model' && (
                    <Pressable
                      testID="btn-ai-modal-back"
                      onPress={() => setModalStep('provider')}
                      hitSlop={12}
                    >
                      <ChevronLeft size={22} color={colors.muted.foreground} />
                    </Pressable>
                  )}
                  <Text className="text-xl font-bold text-foreground">
                    {modalStep === 'provider'
                      ? 'Select AI Provider'
                      : `Select Model · ${selectedProvider?.label ?? aiProvider}`}
                  </Text>
                </View>
                <Pressable
                  testID="btn-ai-modal-close"
                  onPress={() => setModalVisible(false)}
                  hitSlop={12}
                >
                  <X size={20} color={colors.muted.foreground} />
                </Pressable>
              </View>
              {modalStep === 'provider' ? (
                <View className="px-5 pt-3 gap-2">
                  {aiProviders.map((p) => {
                    const isAvailable =
                      !availableProviderKeys || availableProviderKeys.includes(p.key);
                    const isSelected = aiProvider === p.key;
                    return (
                      <Pressable
                        key={p.key}
                        testID={`ai-provider-${p.key}`}
                        onPress={() => {
                          if (!isAvailable) return;
                          onSelectProvider(p.key);
                          setModalStep('model');
                        }}
                        disabled={!isAvailable}
                      >
                        <Card
                          className={`flex-row items-center gap-3 ${
                            isSelected ? 'border-primary' : ''
                          }`}
                          style={!isAvailable ? { opacity: 0.35 } : undefined}
                        >
                          <View className="flex-1">
                            <Text className="text-lg font-semibold text-foreground">
                              {p.label}
                            </Text>
                            <Text className="text-base text-muted-foreground">
                              {isAvailable ? p.desc : 'No API key configured'}
                            </Text>
                          </View>
                          {isSelected && <Check size={18} color={colors.foreground} />}
                          <ChevronRight size={16} color={colors.muted.foreground} />
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View className="px-5 pt-3 gap-2">
                  {aiModels.map((m) => {
                    const isSelected = aiModel === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        testID={`ai-model-${m.id}`}
                        onPress={() => {
                          onSelectModel(m.id);
                          setModalVisible(false);
                        }}
                      >
                        <Card
                          className={`flex-row items-center gap-3 ${
                            isSelected ? 'border-primary' : ''
                          }`}
                        >
                          <View className="flex-1">
                            <Text className="text-lg font-semibold text-foreground" selectable>
                              {m.label}
                            </Text>
                            <Text className="text-base text-muted-foreground" selectable>
                              {m.id}
                            </Text>
                          </View>
                          {isSelected && <Check size={18} color={colors.foreground} />}
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

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
