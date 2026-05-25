/**
 * Developer screen body — props-only, no API / auth coupling. Owns the
 * AI provider / model picker modal that used to live on the Profile
 * screen. Lives on its own route so the Profile (settings) page can
 * stay focused on account + usage + sign-out.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Wrench,
  X,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { colors } from '@/lib/design-tokens/colors';

export interface AiProviderOption {
  key: string;
  label: string;
  desc: string;
}

export interface AiModelOption {
  id: string;
  label: string;
}

export interface DeveloperScreenProps {
  onBack: () => void;

  aiProviders: ReadonlyArray<AiProviderOption>;
  aiProvider: string;
  onSelectProvider: (key: string) => void;
  aiModels: ReadonlyArray<AiModelOption>;
  aiModel: string;
  onSelectModel: (modelId: string) => void;
  /** Set of provider keys with API credentials configured. `null` =
   * not yet known (treat everything as available). */
  availableProviderKeys: ReadonlyArray<string> | null;

  // ── Generate-report tab visibility flags ───────────────────────
  /** When true, the Debug tab is visible on the Generate Report screen. */
  showGenerateDebugTab: boolean;
  onToggleGenerateDebugTab: (next: boolean) => void;
  /** When true, the manual Edit tab is visible on the Generate Report screen. */
  showGenerateEditTab: boolean;
  onToggleGenerateEditTab: (next: boolean) => void;
}

export function Developer({
  onBack,
  aiProviders,
  aiProvider,
  onSelectProvider,
  aiModels,
  aiModel,
  onSelectModel,
  availableProviderKeys,
  showGenerateDebugTab,
  onToggleGenerateDebugTab,
  showGenerateEditTab,
  onToggleGenerateEditTab,
}: DeveloperScreenProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState<'provider' | 'model'>('provider');

  const selectedProvider = aiProviders.find((p) => p.key === aiProvider);
  const selectedModel = aiModels.find((m) => m.id === aiModel) ?? aiModels[0];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} testID="screen-developer">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="px-5 pt-4 pb-6 gap-5">
          <ScreenHeader title="Developer" onBack={onBack} />
        </View>

        <View className="px-5" testID="developer-section">
          <View className="mb-2 flex-row items-center gap-2">
            <Wrench size={16} color={colors.muted.foreground} />
            <Text className="text-label text-muted-foreground">AI Provider</Text>
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

        <View className="px-5 mt-6" testID="developer-section-tabs">
          <View className="mb-2 flex-row items-center gap-2">
            <FlaskConical size={16} color={colors.muted.foreground} />
            <Text className="text-label text-muted-foreground">
              Generate Report Tabs
            </Text>
          </View>

          <Card className="gap-4">
            <View
              testID="row-toggle-generate-edit-tab"
              className="flex-row items-center gap-3"
            >
              <View className="flex-1">
                <Text className="text-title-sm text-foreground">
                  Manual edit tab
                </Text>
                <Text className="text-body text-muted-foreground">
                  Show the Edit tab on the Generate Report screen.
                </Text>
              </View>
              <Switch
                testID="switch-generate-edit-tab"
                value={showGenerateEditTab}
                onValueChange={onToggleGenerateEditTab}
              />
            </View>

            <View
              testID="row-toggle-generate-debug-tab"
              className="flex-row items-center gap-3"
            >
              <View className="flex-1">
                <Text className="text-title-sm text-foreground">
                  Debug tab
                </Text>
                <Text className="text-body text-muted-foreground">
                  Show the Debug tab on the Generate Report screen.
                </Text>
              </View>
              <Switch
                testID="switch-generate-debug-tab"
                value={showGenerateDebugTab}
                onValueChange={onToggleGenerateDebugTab}
              />
            </View>
          </Card>
        </View>

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
      </ScrollView>
    </SafeAreaView>
  );
}
