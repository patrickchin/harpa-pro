/**
 * Developer screen body — props-only, no API / auth coupling. Renders
 * a single-step AI model picker. The leading "Default" row clears the
 * server-side override (`{vendor:null, model:null}`) so the API uses
 * its current default model. Other rows pin the user's choice.
 *
 * The previous version did AsyncStorage-only and never told the API.
 * Here, the parent's `onSelectModel` is wired to the server via
 * `useAiProvider`. See
 * docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import {
  Bot,
  Check,
  ChevronRight,
  FlaskConical,
  Wrench,
  X,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { colors } from '@/lib/design-tokens/colors';
import type { AiSelection } from '@/lib/ai/useAiProvider';

export interface AiModelOption {
  readonly id: string;
  readonly label: string;
  readonly tagline?: string;
  readonly latencyMs?: number;
  readonly costPerReport?: number;
  readonly isDefault?: boolean;
}

export interface DeveloperScreenProps {
  onBack: () => void;

  /** Vendor's model catalogue. The single-step picker iterates these. */
  aiModels: ReadonlyArray<AiModelOption>;
  /** `null` = use server default. */
  aiSelection: AiSelection | null;
  /** Pass `null` to clear the override back to the server default. */
  onSelectModel: (next: AiSelection | null) => void;
  /** True while the initial settings query is in flight. */
  isLoadingSelection: boolean;

  // ── Generate-report tab visibility flags ───────────────────────
  showGenerateDebugTab: boolean;
  onToggleGenerateDebugTab: (next: boolean) => void;
}

function formatCost(cost: number): string {
  // costPerReport is USD; show fractional cents for sub-cent prices.
  if (cost < 0.01) return `${(cost * 100).toFixed(2)}¢/report`;
  return `$${cost.toFixed(3)}/report`;
}

function formatLatency(ms: number): string {
  return `~${(ms / 1000).toFixed(1)}s`;
}

export function Developer({
  onBack,
  aiModels,
  aiSelection,
  onSelectModel,
  isLoadingSelection,
  showGenerateDebugTab,
  onToggleGenerateDebugTab,
}: DeveloperScreenProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const defaultEntry = aiModels.find((m) => m.isDefault);
  const selectedEntry =
    aiSelection !== null ? aiModels.find((m) => m.id === aiSelection.model) : null;

  const summary =
    aiSelection === null
      ? `Default${defaultEntry ? ` · ${defaultEntry.label}` : ''}`
      : selectedEntry?.label ?? aiSelection.model;

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
            <Text className="text-label text-muted-foreground">AI Model</Text>
          </View>

          <Card className="gap-3">
            <Pressable
              testID="btn-open-ai-model"
              onPress={() => setModalVisible(true)}
              disabled={isLoadingSelection}
            >
              <View className="flex-row items-center gap-3">
                <Bot size={18} color={colors.muted.foreground} />
                <View className="flex-1">
                  <Text className="text-title-sm text-foreground" selectable>
                    {isLoadingSelection ? 'Loading…' : summary}
                  </Text>
                  <Text
                    testID="ai-model-id"
                    className="text-body text-muted-foreground"
                    numberOfLines={1}
                    selectable
                  >
                    {aiSelection === null
                      ? 'Server-managed default'
                      : aiSelection.model}
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
              Generate Report
            </Text>
          </View>

          <Card className="gap-4">
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
                <Text className="text-xl font-bold text-foreground">
                  Select AI Model
                </Text>
                <Pressable
                  testID="btn-ai-modal-close"
                  onPress={() => setModalVisible(false)}
                  hitSlop={12}
                >
                  <X size={20} color={colors.muted.foreground} />
                </Pressable>
              </View>

              <View className="px-5 pt-3 gap-2">
                {/* Leading "Default" row clears any user override. */}
                <Pressable
                  testID="ai-model-default"
                  onPress={() => {
                    onSelectModel(null);
                    setModalVisible(false);
                  }}
                >
                  <Card
                    className={`flex-row items-center gap-3 ${
                      aiSelection === null ? 'border-primary' : ''
                    }`}
                  >
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-foreground">
                        Default (recommended)
                      </Text>
                      <Text className="text-base text-muted-foreground">
                        Server picks the best model for each request
                        {defaultEntry ? ` · currently ${defaultEntry.label}` : ''}
                      </Text>
                    </View>
                    {aiSelection === null && (
                      <Check size={18} color={colors.foreground} />
                    )}
                  </Card>
                </Pressable>

                {aiModels.map((m) => {
                  const isSelected =
                    aiSelection !== null && aiSelection.model === m.id;
                  const meta = [
                    m.tagline,
                    m.latencyMs !== undefined ? formatLatency(m.latencyMs) : null,
                    m.costPerReport !== undefined ? formatCost(m.costPerReport) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Pressable
                      key={m.id}
                      testID={`ai-model-${m.id}`}
                      onPress={() => {
                        onSelectModel({ vendor: 'openai', model: m.id });
                        setModalVisible(false);
                      }}
                    >
                      <Card
                        className={`flex-row items-center gap-3 ${
                          isSelected ? 'border-primary' : ''
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            className="text-lg font-semibold text-foreground"
                            selectable
                          >
                            {m.label}
                          </Text>
                          <Text
                            className="text-base text-muted-foreground"
                            selectable
                          >
                            {m.id}
                          </Text>
                          {meta ? (
                            <Text className="text-body text-muted-foreground">
                              {meta}
                            </Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <Check size={18} color={colors.foreground} />
                        )}
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
