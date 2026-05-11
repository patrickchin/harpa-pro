===== FILE: apps/mobile-old/components/reports/generate/GenerateReportInputBar.tsx =====
import { Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useEffect } from "react";
import { Camera, Mic, MicOff, Paperclip, Plus, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LiveWaveform } from "@/components/ui/LiveWaveform";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

/**
 * Bottom input bar (text + voice + camera + attachment). Reads input,
 * voice, and trigger handlers straight from `useGenerateReport()`.
 */
export function GenerateReportInputBar() {
  const { notes, voice, photo, ui } = useGenerateReport();

  // Pulse animation for recording
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (voice.isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.5, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    } else {
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;
    }
  }, [voice.isRecording, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <View className="border-t border-border bg-background px-5 py-3">
      {voice.speechError && (
        <InlineNotice tone="danger" className="mb-2">
          {voice.speechError}
        </InlineNotice>
      )}
      <View className="flex-row items-stretch gap-3">
        <View
          testID={voice.isRecording ? "input-note-recording" : "input-note-container"}
          accessible={voice.isRecording}
          accessibilityRole={voice.isRecording ? "text" : undefined}
          accessibilityLabel={
            voice.isRecording
              ? voice.interimTranscript
                ? `Recording voice note. ${voice.interimTranscript}`
                : "Recording voice note. Listening."
              : undefined
          }
          accessibilityHint={
            voice.isRecording
              ? "Tap the stop button to finish recording, or the cancel button to discard it."
              : undefined
          }
          className={`min-h-[68px] flex-1 rounded-xl border px-4 py-3 ${
            voice.isRecording
              ? "border-warning-border bg-warning-soft"
              : "border-border bg-card"
          }`}
        >
          {voice.isRecording && (
            <>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Listening
              </Text>
              <LiveWaveform amplitude={voice.amplitude} />
              {!!voice.interimTranscript && (
                <Text className="mt-2 text-sm text-muted-foreground">
                  {voice.interimTranscript}
                </Text>
              )}
            </>
          )}

          {!voice.isRecording && (
            <View className="flex-row items-start gap-2">
              <Pressable
                onPress={() => ui.setAttachmentSheetVisible(true)}
                hitSlop={8}
                testID="btn-attachment"
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
                className="min-h-[44px] items-center justify-center"
              >
                <Paperclip size={20} color={colors.muted.foreground} />
              </Pressable>
              <TextInput
                testID="input-note"
                value={notes.input}
                onChangeText={notes.setInput}
                placeholder="Type a site note..."
                placeholderTextColor={colors.muted.foreground}
                className="min-h-[44px] flex-1 text-base text-foreground"
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
              />
            </View>
          )}
        </View>

        {notes.input.trim() ? (
          <Button
            testID="btn-add-note"
            size="lg"
            className="min-h-[68px] min-w-[84px] rounded-xl px-4"
            onPress={notes.add}
          >
            <View className="items-center gap-1">
              <Plus size={18} color={colors.primary.foreground} />
              <Text className="text-xs font-semibold text-primary-foreground">
                Add
              </Text>
            </View>
          </Button>
        ) : (
          <>
            {voice.isRecording ? (
              <Pressable
                onPress={voice.cancelRecording}
                testID="btn-record-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel recording"
              >
                <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3">
                  <View className="items-center gap-1">
                    <X size={24} color={colors.foreground} />
                    <Text className="text-xs font-semibold text-foreground">
                      Cancel
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void photo.handleCameraCapture()}
                testID="btn-camera-capture"
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3">
                  <View className="items-center gap-1">
                    <Camera size={24} color={colors.foreground} />
                    <Text className="text-xs font-semibold text-foreground">
                      Photo
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
            <Pressable
              onPress={voice.toggleRecording}
              className="relative"
              testID={voice.isRecording ? "btn-record-stop" : "btn-record-start"}
              accessibilityRole="button"
              accessibilityLabel={
                voice.isRecording ? "Stop recording" : "Start voice recording"
              }
            >
              {voice.isRecording && (
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 12,
                      backgroundColor: colors.primary.alpha30,
                    },
                    pulseStyle,
                  ]}
                />
              )}
              <View
                className={`min-h-[68px] min-w-[68px] items-center justify-center rounded-xl px-3 ${
                  voice.isRecording ? "bg-destructive" : "border border-border bg-card"
                }`}
              >
                <View className="items-center gap-1">
                  {voice.isRecording ? (
                    <>
                      <MicOff size={24} color={colors.destructive.foreground} />
                      <Text className="text-xs font-semibold text-destructive-foreground">
                        Stop
                      </Text>
                    </>
                  ) : (
                    <>
                      <Mic size={24} color={colors.foreground} />
                      <Text className="text-xs font-semibold text-foreground">
                        Voice
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/GenerateReportActionRow.tsx =====
import { Text, View } from "react-native";
import { RotateCcw, Sparkles } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

/**
 * Persistent action row above the tab bar. Two states:
 *
 *  1. Out of date (no report yet, or new notes since last generation):
 *     a single full-width secondary "Update (N)" / "Generate" button.
 *  2. Up to date: small icon-only "Regenerate" on the left, primary
 *     "Finalize" button filling the rest.
 */
export function GenerateReportActionRow() {
  const { generation, draft, timeline, handleRegenerate } = useGenerateReport();

  const hasReport = generation.report !== null;
  const hasNotes = timeline.items.length > 0;
  const upToDate = hasReport && generation.notesSinceLastGeneration === 0;
  const busy = generation.isUpdating || draft.isFinalizing;

  // State 1: needs (re)generation — single full-width Update/Generate.
  if (!upToDate) {
    const label = generation.isUpdating
      ? "Generating…"
      : !hasReport
        ? "Generate report"
        : `Update report (${generation.notesSinceLastGeneration})`;

    return (
      <View className="mx-5 mt-3">
        <Button
          testID="btn-generate-update-report"
          variant="secondary"
          size="default"
          className="w-full"
          onPress={handleRegenerate}
          disabled={busy || (!hasReport && !hasNotes)}
        >
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color={colors.foreground} />
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Button>
      </View>
    );
  }

  // State 2: up to date — small Regenerate + primary Finalize.
  return (
    <View className="mx-5 mt-3 flex-row gap-2">
      <Button
        testID="btn-generate-update-report"
        variant="secondary"
        size="default"
        accessibilityLabel="Regenerate report"
        onPress={handleRegenerate}
        disabled={busy}
      >
        <RotateCcw size={18} color={colors.foreground} />
      </Button>
      <View className="flex-1">
        <Button
          testID="btn-finalize-report"
          variant="hero"
          size="default"
          className="w-full"
          onPress={() => draft.setIsFinalizeConfirmVisible(true)}
          disabled={busy}
        >
          <Text
            className="text-base font-semibold text-primary-foreground"
            numberOfLines={1}
          >
            {draft.isFinalizing ? "Finalizing…" : "Finalize report"}
          </Text>
        </Button>
      </View>
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/GenerateReportTabBar.tsx =====
import { Keyboard, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Code, FileText, MessageSquare, Pencil } from "lucide-react-native";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { TAB_ORDER, type TabKey } from "@/components/reports/generate/tabs";
import { colors } from "@/lib/design-tokens/colors";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";

// Re-export so consumers (provider, screen) can keep their existing imports.
export { TAB_ORDER, type TabKey };

export function GenerateReportTabBar() {
  const { tabs, notes, generation } = useGenerateReport();
  const notesCount = notes.list.length;

  const select = (tab: TabKey) => {
    Keyboard.dismiss();
    tabs.set(tab);
  };

  return (
    <View className="mx-5 mt-3 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-notes"
        onPress={() => select("notes")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "notes" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <MessageSquare
          size={16}
          color={tabs.active === "notes" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "notes" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("notes", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-report"
        onPress={() => select("report")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "report" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <FileText
          size={16}
          color={tabs.active === "report" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "report" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("report", notesCount)}
        </Text>
        {generation.isUpdating && <ActivityIndicator size="small" color={colors.foreground} />}
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={tabs.openEdit}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "edit" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Pencil
          size={16}
          color={tabs.active === "edit" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "edit" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("edit", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => select("debug")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "debug" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Code
          size={16}
          color={tabs.active === "debug" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "debug" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Debug
        </Text>
      </Pressable>
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/NotesTabPane.tsx =====
import { forwardRef } from "react";
import { ScrollView, View } from "react-native";
import { Mic } from "lucide-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface NotesTabPaneProps {
  width: number;
}

/**
 * Notes tab. Reads timeline data, voice/photo handlers, and members
 * from `useGenerateReport()`. The Update/Regenerate/Finalize CTAs live
 * in `GenerateReportActionRow` above the tab bar so they're reachable
 * from any tab.
 */
export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane({ width }, ref) {
    const { timeline, voice, photo, members, notes, preview } =
      useGenerateReport();

    return (
      <View style={{ width }} className="flex-1">
        <ScrollView
          ref={ref}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <NoteTimeline
            timeline={timeline.items}
            isLoading={timeline.isLoading}
            transcriptionsByFileId={voice.voiceTranscriptionsByFileId}
            transcribingFileIds={voice.pendingVoiceTranscriptionIds}
            memberNames={members}
            noteCreatedAtByFileId={timeline.noteCreatedAtByFileId}
            noteAuthorByFileId={timeline.noteAuthorByFileId}
            onRemoveNote={notes.setDeleteIndex}
            onOpenFile={preview.openFile}
            onRetryPendingPhoto={photo.handleRetryPendingPhoto}
            onDiscardPendingPhoto={photo.handleDiscardPendingPhoto}
            onRetryPendingVoice={voice.handleRetryPendingVoice}
            onDiscardPendingVoice={voice.handleDiscardPendingVoice}
          />

          {timeline.items.length === 0 && !timeline.isLoading && (
            <EmptyState
              icon={<Mic size={28} color={colors.muted.foreground} />}
              title="Start capturing site notes"
              description="Record short voice updates or type notes below. The report will build itself as you go."
            />
          )}
        </ScrollView>
      </View>
    );
  },
);

===== FILE: apps/mobile-old/components/reports/generate/ReportTabPane.tsx =====
import { forwardRef, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Pencil, RotateCcw } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { ReportView } from "@/components/reports/ReportView";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";
import { createEmptyReport } from "@/lib/report-edit-helpers";

interface ReportTabPaneProps {
  width: number;
}

/**
 * Report tab. Pure display: pulls report state from `useGenerateReport()`
 * and renders the read-only `ReportView`. Manual editing happens in the
 * dedicated Edit tab.
 */
export const ReportTabPane = forwardRef<ScrollView, ReportTabPaneProps>(
  function ReportTabPane({ width }, ref) {
    const { generation, draft, handleRegenerate, tabs } = useGenerateReport();

    // Skeleton shown on the "no report yet" empty state. Built via
    // `createEmptyReport()` so the same defaults (e.g. `visitDate` = today)
    // apply whether the user is staring at the empty Report tab or has just
    // tapped "Edit manually". Memoized once per mount — `createEmptyReport`
    // calls `new Date()`, which would otherwise change identity every render
    // and force CompletenessCard to re-render.
    const emptyReportSkeleton = useMemo(() => createEmptyReport(), []);

    return (
      <View style={{ width }} className="flex-1">
        <ScrollView
          ref={ref}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error banner — render before any skeleton/content so the
              regeneration failure is the first thing the user sees. */}
          {generation.error && (
            <Animated.View entering={FadeIn}>
              <InlineNotice tone="danger" className="mb-3">
                {generation.error}
              </InlineNotice>
              <View className="mb-3">
                <Button variant="secondary" size="sm" onPress={handleRegenerate}>
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color={colors.foreground} />
                    <Text className="text-base font-semibold text-foreground">
                      Retry
                    </Text>
                  </View>
                </Button>
              </View>
            </Animated.View>
          )}

          {/* No report yet — show skeleton of missing fields */}
          {!generation.report && !generation.isUpdating && (
            <View className="gap-3">
              <CompletenessCard report={emptyReportSkeleton} />
              <Button
                testID="btn-edit-manually"
                variant="secondary"
                size="default"
                className="w-full"
                onPress={tabs.editManually}
              >
                <View className="flex-row items-center gap-1.5">
                  <Pencil size={14} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    Edit manually
                  </Text>
                </View>
              </Button>
            </View>
          )}

          {/* Generating shimmer */}
          {generation.isUpdating && !generation.report && (
            <View className="gap-3">
              <InlineNotice tone="info">
                Generating your report from the notes collected so far...
              </InlineNotice>
              {[1, 2, 3, 4].map((i) => (
                <Animated.View
                  key={i}
                  entering={FadeIn}
                  className="h-20 rounded-lg bg-secondary"
                />
              ))}
            </View>
          )}

          {/* Live report */}
          {generation.report && (
            <View className="gap-3">
              {generation.isUpdating && (
                <Animated.View entering={FadeIn}>
                  <InlineNotice tone="info">
                    Updating the draft with your newest notes...
                  </InlineNotice>
                </Animated.View>
              )}

              <CompletenessCard report={generation.report} />

              <ReportView report={generation.report} />

              {draft.finalizeError && (
                <Animated.View entering={FadeIn}>
                  <InlineNotice tone="danger">
                    {draft.finalizeError instanceof Error
                      ? draft.finalizeError.message
                      : "Failed to finalize report."}
                  </InlineNotice>
                </Animated.View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  },
);

===== FILE: apps/mobile-old/components/reports/generate/EditTabPane.tsx =====
import { ScrollView, Text, View } from "react-native";
import { FileText } from "lucide-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportEditForm } from "@/components/reports/ReportEditForm";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface EditTabPaneProps {
  width: number;
}

export function EditTabPane({ width }: EditTabPaneProps) {
  const { generation, draft } = useGenerateReport();

  return (
    <View style={{ width }} className="flex-1">
      {generation.report ? (
        <View className="flex-1">
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Edit report
            </Text>
            <Text
              className="text-xs text-muted-foreground"
              testID="edit-autosave-status"
            >
              {draft.isAutoSaving ? "Saving…" : draft.lastSavedAt ? "Saved" : ""}
            </Text>
          </View>
          <ReportEditForm report={generation.report} onChange={generation.setReport} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <EmptyState
            icon={<FileText size={28} color={colors.muted.foreground} />}
            title="Generate a report first to edit"
            description="Once your report is generated from the notes, you can edit any field here."
          />
        </ScrollView>
      )}
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/DebugTabPane.tsx =====
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react-native";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface DebugTabPaneProps {
  width: number;
}

const monoStyle = {
  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
} as const;

export function DebugTabPane({ width }: DebugTabPaneProps) {
  const { notes, generation } = useGenerateReport();
  const notesCount = notes.list.length;
  const { copy: copyDebug, isCopied: isDebugCopied } = useCopyToClipboard();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    request: true,
    prompt: true,
    response: true,
    error: false,
  });
  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Prefer in-memory rawResponse from the current session; fall back to
  // the persisted lastGeneration when the user just opened a draft and
  // hasn't regenerated yet.
  const debugRawRequest = generation.rawRequest ?? generation.lastGeneration?.request ?? null;
  const debugRawResponse = generation.rawResponse ?? generation.lastGeneration?.response ?? null;

  const { systemPrompt, userPrompt, combined } = useMemo(() => {
    const sys =
      debugRawResponse && typeof debugRawResponse === "object" && "systemPrompt" in debugRawResponse
        ? String((debugRawResponse as { systemPrompt?: unknown }).systemPrompt ?? "")
        : (generation.lastGeneration?.systemPrompt ?? "");
    const usr =
      debugRawResponse && typeof debugRawResponse === "object" && "userPrompt" in debugRawResponse
        ? String((debugRawResponse as { userPrompt?: unknown }).userPrompt ?? "")
        : (generation.lastGeneration?.userPrompt ?? "");
    const com =
      sys || usr
        ? [
            sys ? `# System\n\n${sys}` : "",
            usr ? `# User\n\n${usr}` : "",
          ]
            .filter(Boolean)
            .join("\n\n---\n\n")
        : "";
    return { systemPrompt: sys, userPrompt: usr, combined: com };
  }, [debugRawResponse, generation.lastGeneration]);

  return (
    <View style={{ width }} className="flex-1">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View className="gap-4">
          <View className="flex-row items-center gap-2 border border-border bg-card p-3">
            <Text className="text-sm font-bold text-foreground">Status:</Text>
            <Text className="text-sm text-foreground" style={monoStyle}>
              {generation.mutationStatus}
            </Text>
            <Text className="text-sm font-bold text-foreground">Notes:</Text>
            <Text className="text-sm text-foreground" style={monoStyle}>
              {notesCount}
            </Text>
          </View>

          {/* Request */}
          <View>
            <Pressable
              onPress={() => toggle("request")}
              className="mb-1 flex-row items-center gap-1"
              accessibilityLabel="Toggle request body"
            >
              {collapsed.request ? (
                <ChevronRight size={16} color={colors.foreground} />
              ) : (
                <ChevronDown size={16} color={colors.foreground} />
              )}
              <Text className="text-lg font-bold text-foreground">Request Body</Text>
            </Pressable>
            {!collapsed.request && (
              <View className="border border-border bg-card p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <Text className="text-xs text-foreground" style={monoStyle}>
                    {debugRawRequest
                      ? JSON.stringify(debugRawRequest, null, 2)
                      : "No request yet — tap Generate / Update report on the Notes tab."}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Prompt */}
          <View>
            <View className="mb-1 flex-row items-center justify-between">
              <Pressable
                onPress={() => toggle("prompt")}
                className="flex-row items-center gap-1"
                accessibilityLabel="Toggle prompt"
              >
                {collapsed.prompt ? (
                  <ChevronRight size={16} color={colors.foreground} />
                ) : (
                  <ChevronDown size={16} color={colors.foreground} />
                )}
                <Text className="text-lg font-bold text-foreground">Prompt</Text>
              </Pressable>
              {(systemPrompt || userPrompt) && (
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      copyDebug(systemPrompt, {
                        key: "system",
                        toast: "System prompt copied",
                      })
                    }
                    disabled={!systemPrompt}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy system prompt"
                  >
                    {isDebugCopied("system") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">System</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      copyDebug(userPrompt, {
                        key: "user",
                        toast: "User prompt copied",
                      })
                    }
                    disabled={!userPrompt}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy user prompt"
                  >
                    {isDebugCopied("user") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">User</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      copyDebug(combined, {
                        key: "combined",
                        toast: "Full prompt copied",
                      })
                    }
                    disabled={!combined}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy full prompt"
                  >
                    {isDebugCopied("combined") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">Full</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {!collapsed.prompt && (
              <View className="border border-border bg-card p-3">
                {systemPrompt || userPrompt ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <Text className="text-xs text-foreground" style={monoStyle}>
                      {combined}
                    </Text>
                  </ScrollView>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    No prompt yet — generate a report to capture it.
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Response */}
          <View>
            <Pressable
              onPress={() => toggle("response")}
              className="mb-1 flex-row items-center gap-1"
              accessibilityLabel="Toggle LLM response"
            >
              {collapsed.response ? (
                <ChevronRight size={16} color={colors.foreground} />
              ) : (
                <ChevronDown size={16} color={colors.foreground} />
              )}
              <Text className="text-lg font-bold text-foreground">LLM Response</Text>
            </Pressable>
            {!collapsed.response && (
              <View className="border border-border bg-card p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <Text className="text-xs text-foreground" style={monoStyle}>
                    {debugRawResponse ? JSON.stringify(debugRawResponse, null, 2) : ""}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Error */}
          {generation.error && (
            <View>
              <Pressable
                onPress={() => toggle("error")}
                className="mb-1 flex-row items-center gap-1"
                accessibilityLabel="Toggle error"
              >
                {collapsed.error ? (
                  <ChevronRight size={16} color={colors.danger.DEFAULT} />
                ) : (
                  <ChevronDown size={16} color={colors.danger.DEFAULT} />
                )}
                <Text className="text-lg font-bold text-destructive">Error</Text>
              </Pressable>
              {!collapsed.error && (
                <View className="border border-destructive bg-card p-3">
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <Text className="text-xs text-destructive" style={monoStyle}>
                      {generation.error}
                    </Text>
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/GenerateReportProvider.tsx =====
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Keyboard,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, RotateCcw, Sparkles } from "lucide-react-native";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { useVoiceNotePipeline } from "@/hooks/useVoiceNotePipeline";
import { usePhotoUploadPipeline } from "@/hooks/usePhotoUploadPipeline";
import { useReportDraftPersistence } from "@/hooks/useReportDraftPersistence";
import {
  useLocalReportNotes,
  useOtherReportFileIds,
  useReportNotesMutations,
} from "@/hooks/useLocalReportNotes";
import {
  useReportGeneration,
  type LastGeneration,
} from "@/hooks/useReportGeneration";
import { useAuth } from "@/lib/auth";
import { fetchProjectTeam } from "@/lib/project-members";
import { type FileCategory } from "@/lib/file-validation";
import { type NoteEntry, toTextArray } from "@/lib/note-entry";
import { type FileMetadataRow } from "@/lib/file-upload";
import { type GeneratedSiteReport } from "@/lib/generated-report";
import { createEmptyReport } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";
import { TAB_ORDER, type TabKey } from "@/components/reports/generate/tabs";

/**
 * Single source of truth for the Generate Report screen. Owns every
 * orchestration hook the screen used to call inline (notes, generation,
 * draft persistence, voice/photo pipelines, dialog visibility, image
 * preview, tab/pager state, etc.) and exposes the bundle via
 * `useGenerateReport()`. Lets the panes consume what they need without
 * the screen drilling 50+ props through 3 layers.
 *
 * Truly child-local state (e.g. inline section editing in `ReportTabPane`)
 * stays in the child — only state shared across panes lives here.
 */

interface DraftMenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * State hook that runs all orchestration logic for the Generate Report
 * screen. Returns a grouped object instead of 70 flat fields; adding a
 * field to any pipeline hook requires no provider edit.
 */
function useGenerateReportState(projectId: string, reportId: string | undefined) {
  const { user } = useAuth();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // ── Team members (for author names on voice/photo cards) ──
  const { data: team } = useQuery({
    queryKey: ["project-team", projectId],
    queryFn: () => fetchProjectTeam(projectId),
    enabled: !!projectId,
  });
  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    if (team) {
      for (const m of team) {
        if (m.full_name) map.set(m.user_id, m.full_name);
      }
    }
    return map;
  }, [team]);

  // ── Notes (hydrated from `report_notes`) ──
  const { data: noteRows } = useLocalReportNotes(reportId ?? null);
  const { create: createNoteMutation, remove: removeNoteMutation } =
    useReportNotesMutations();
  const [currentInput, setCurrentInput] = useState("");

  const notesWithBody = useMemo(
    () =>
      (noteRows ?? []).filter(
        (n) => typeof n.body === "string" && n.body.length > 0,
      ),
    [noteRows],
  );
  const notesList: NoteEntry[] = useMemo(
    () =>
      notesWithBody.map((n) => ({
        id: n.id,
        authorId: n.author_id,
        isPending: n.isOptimistic === true,
        text: n.body!,
        addedAt: Date.parse(n.created_at) || Date.now(),
        source: n.kind === "voice" ? "voice" : "text",
      })),
    [notesWithBody],
  );
  const notesTextArray = useMemo(() => toTextArray(notesList), [notesList]);

  // ── Report generation ──
  const generation = useReportGeneration(notesTextArray, projectId);

  // ── Tab state + horizontal pager ──
  const [activeTab, setActiveTab] = useState<TabKey>("report");
  // Tracks whether the most recent scroll was started by a user drag.
  // Programmatic scrollTo() animations also fire onMomentumScrollEnd; if
  // we acted on those, two quick tab taps would create a feedback loop
  // (tap → scrollTo → momentumEnd lands mid-flight → setActiveTab to a
  // tab the user didn't pick → scrollTo again → flicker indefinitely).
  const userDraggingRef = useRef(false);

  useEffect(() => {
    if (windowWidth <= 0) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    pagerRef.current?.scrollTo({ x: idx * windowWidth, animated: true });
  }, [activeTab, windowWidth]);

  const handlePagerScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const wasUserDrag = userDraggingRef.current;
      userDraggingRef.current = false;
      if (!wasUserDrag) return;
      if (windowWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
      const next = TAB_ORDER[idx];
      if (next && next !== activeTab) {
        Keyboard.dismiss();
        setActiveTab(next);
      }
    },
    [activeTab, windowWidth],
  );

  const handleRegenerate = useCallback(() => {
    setActiveTab("report");
    generation.regenerate();
  }, [generation]);

  // Lazy-init a blank report when the user opens the Edit tab without one.
  // Manual-entry path: report stays null until the user actively wants to
  // edit, then we seed an empty-but-zod-valid report so autosave + edit
  // form behave the same whether the report came from AI or manual entry.
  const handleOpenEditTab = useCallback(() => {
    Keyboard.dismiss();
    if (!generation.report) {
      generation.setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [generation]);

  const handleEditManually = useCallback(() => {
    if (!generation.report) {
      generation.setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [generation]);

  // ── Image preview ──
  const [imagePreview, setImagePreview] = useState<{
    file: FileMetadataRow;
  } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  // ── Dialog/UI state ──
  const [fileUploadErrorMessage, setFileUploadErrorMessage] = useState<
    string | null
  >(null);
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] =
    useState(false);
  const [noteDeleteIndex, setNoteDeleteIndex] = useState<number | null>(null);

  // ── Draft persistence (autosave + finalize + delete) ──
  const draft = useReportDraftPersistence({
    projectId,
    reportId,
    report: generation.report,
    setReport: generation.setReport,
    lastGeneration: generation.lastGeneration,
    setLastGeneration: generation.setLastGeneration,
  });

  // ── Voice note pipeline ──
  const onVoiceNoteCreate = useCallback(
    ({ body, fileId }: { body: string | null; fileId: string }) => {
      if (!reportId || !projectId) return;
      createNoteMutation.mutate({
        reportId,
        projectId,
        kind: "voice",
        body,
        fileId,
      });
    },
    [createNoteMutation, projectId, reportId],
  );

  const voice = useVoiceNotePipeline({
    projectId,
    reportId,
    userId: user?.id,
    noteRows,
    notesScrollRef,
    onVoiceNoteCreate,
  });

  // ── Photo / file upload pipeline ──
  const photo = usePhotoUploadPipeline({
    projectId,
    reportId,
    userId: user?.id,
    notesScrollRef,
    onUploadError: setFileUploadErrorMessage,
  });

  // ── Timeline derived data ──
  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of noteRows ?? []) {
      if (n.file_id) ids.add(n.file_id);
    }
    return ids;
  }, [noteRows]);

  const noteCreatedAtByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.created_at) m.set(n.file_id, n.created_at);
    }
    return m;
  }, [noteRows]);

  const noteAuthorByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.author_id) m.set(n.file_id, n.author_id);
    }
    return m;
  }, [noteRows]);

  const { data: excludedFileIds } = useOtherReportFileIds(projectId, reportId);

  const { timeline, isLoading: timelineLoading } = useNoteTimeline({
    notes: notesList,
    projectId,
    reportCreatedAt: draft.draftData?.created_at ?? null,
    linkedFileIds,
    excludedFileIds,
    noteCreatedAtByFileId,
    pendingPhotos: photo.queuePendingPhotos,
    pendingVoiceNotes: voice.pendingVoiceNotes,
  });

  // ── Note add/delete actions ──
  const addNote = useCallback(() => {
    const trimmed = currentInput.trim();
    if (!trimmed) return;
    if (!reportId || !projectId) return;
    createNoteMutation.mutate({
      reportId,
      projectId,
      kind: "text",
      body: trimmed,
    });
    setCurrentInput("");
    setTimeout(
      () => notesScrollRef.current?.scrollTo({ y: 0, animated: true }),
      100,
    );
  }, [currentInput, reportId, projectId, createNoteMutation]);

  const handleConfirmDeleteNote = useCallback(() => {
    if (noteDeleteIndex !== null) {
      const target = notesWithBody[noteDeleteIndex];
      if (target && !target.isOptimistic && reportId) {
        removeNoteMutation.mutate({ id: target.id, reportId });
      }
    }
    setNoteDeleteIndex(null);
  }, [noteDeleteIndex, notesWithBody, reportId, removeNoteMutation]);

  // ── Image open from timeline ──
  const handleOpenFile = useCallback((file: FileMetadataRow) => {
    if (file.mime_type.startsWith("image/")) {
      setImagePreview({ file });
    }
  }, []);

  const handlePickAttachment = useCallback(
    (category: Exclude<FileCategory, "avatar" | "voice-note">) => {
      void photo.handleMenuPick(category);
    },
    [photo],
  );

  // ── Header menu ──
  const draftMenuActions: DraftMenuAction[] | undefined = reportId
    ? [
        {
          key: "add-document",
          label: "Add document",
          icon: <FileText size={16} color={colors.foreground} />,
          onPress: () => void photo.handleMenuPick("document"),
          testID: "btn-menu-add-document",
        },
        {
          key: "add-photo",
          label: "Add photo",
          icon: <ImageIcon size={16} color={colors.foreground} />,
          onPress: () => void photo.handleMenuPick("image"),
          testID: "btn-menu-add-photo",
        },
        {
          key: "finalize",
          label: draft.isFinalizing ? "Finalizing..." : "Finalize Report",
          icon: <Sparkles size={16} color={colors.foreground} />,
          onPress: () => draft.setIsFinalizeConfirmVisible(true),
          disabled: !generation.report || draft.isFinalizing,
          testID: "btn-menu-finalize",
        },
        {
          key: "rebuild",
          label: "Regenerate",
          icon: <RotateCcw size={16} color={colors.foreground} />,
          onPress: handleRegenerate,
          disabled: draft.isFinalizing || generation.isUpdating,
          testID: "btn-menu-rebuild",
        },
      ]
    : undefined;

  return {
    // Cross-cutting primitives used everywhere
    projectId,
    reportId,
    handleRegenerate,

    // Grouped by concern
    refs: { pager: pagerRef, notesScroll: notesScrollRef, reportScroll: reportScrollRef },
    tabs: {
      active: activeTab,
      set: setActiveTab,
      windowWidth,
      onPagerMomentumEnd: handlePagerMomentumEnd,
      onPagerScrollBeginDrag: handlePagerScrollBeginDrag,
      openEdit: handleOpenEditTab,
      editManually: handleEditManually,
    },
    notes: {
      list: notesList,
      input: currentInput,
      setInput: setCurrentInput,
      add: addNote,
      deleteIndex: noteDeleteIndex,
      setDeleteIndex: setNoteDeleteIndex,
      confirmDelete: handleConfirmDeleteNote,
    },
    members: memberNames,
    generation,
    draft,
    voice,
    photo,
    timeline: {
      items: timeline,
      isLoading: timelineLoading,
      noteCreatedAtByFileId,
      noteAuthorByFileId,
    },
    preview: {
      file: imagePreview?.file ?? null,
      extras: imagePreviewExtras,
      set: setImagePreview,
      openFile: handleOpenFile,
    },
    ui: {
      attachmentSheetVisible: isAttachmentSheetVisible,
      setAttachmentSheetVisible: setIsAttachmentSheetVisible,
      fileUploadError: fileUploadErrorMessage,
      setFileUploadError: setFileUploadErrorMessage,
    },
    menuActions: draftMenuActions,
    handlePickAttachment,
  };
}

type GenerateReportContextValue = ReturnType<typeof useGenerateReportState>;

const GenerateReportContext = createContext<GenerateReportContextValue | null>(
  null,
);

export function useGenerateReport(): GenerateReportContextValue {
  const v = useContext(GenerateReportContext);
  if (!v) {
    throw new Error(
      "useGenerateReport must be used inside <GenerateReportProvider>",
    );
  }
  return v;
}

interface ProviderProps {
  projectId: string;
  reportId: string | undefined;
  children: ReactNode;
}

/**
 * Wraps the Generate Report screen body and runs every orchestration
 * hook in one place. Children read what they need via `useGenerateReport`.
 */
export function GenerateReportProvider({
  projectId,
  reportId,
  children,
}: ProviderProps) {
  const value = useGenerateReportState(projectId, reportId);
  return (
    <GenerateReportContext.Provider value={value}>
      {children}
    </GenerateReportContext.Provider>
  );
}

===== FILE: apps/mobile-old/components/reports/generate/GenerateReportDialogs.tsx =====
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import {
  getActionErrorDialogCopy,
  getDeleteNoteDialogCopy,
  getFinalizeReportDialogCopy,
} from "@/lib/app-dialog-copy";

/**
 * All modal/dialog UI for the Generate screen. Reads visibility state +
 * dismiss handlers straight from `useGenerateReport()` — no props needed.
 */
export function GenerateReportDialogs() {
  const {
    generation,
    draft,
    notes,
    preview,
    ui,
    handlePickAttachment,
    photo,
  } = useGenerateReport();
  const hasReport = generation.report !== null;
  const finalizeConfirmCopy = getFinalizeReportDialogCopy();
  const deleteNoteCopy = getDeleteNoteDialogCopy();

  const draftDeleteErrorDialog = draft.draftDeleteErrorMessage
    ? getActionErrorDialogCopy({
        title: "Delete Failed",
        fallbackMessage: "Could not delete the draft report.",
        message: draft.draftDeleteErrorMessage,
      })
    : null;

  const fileUploadErrorDialog = ui.fileUploadError
    ? getActionErrorDialogCopy({
        title: "Upload Failed",
        fallbackMessage: "Could not attach the file to this report.",
        message: ui.fileUploadError,
      })
    : null;

  const closeAttachmentSheet = () => ui.setAttachmentSheetVisible(false);
  const cancelFinalize = () => draft.setIsFinalizeConfirmVisible(false);

  return (
    <>
      <AppDialogSheet
        visible={draft.isFinalizeConfirmVisible}
        title={finalizeConfirmCopy.title}
        message={finalizeConfirmCopy.message}
        noticeTone={finalizeConfirmCopy.tone}
        noticeTitle={finalizeConfirmCopy.noticeTitle}
        canDismiss={!draft.isFinalizing}
        onClose={() => {
          if (!draft.isFinalizing) cancelFinalize();
        }}
        actions={[
          {
            label: draft.isFinalizing ? "Finalizing..." : finalizeConfirmCopy.confirmLabel,
            variant: finalizeConfirmCopy.confirmVariant,
            onPress: () => draft.finalizeReport(),
            disabled: draft.isFinalizing || !hasReport,
            accessibilityLabel: "Confirm finalize report",
          },
          {
            label: finalizeConfirmCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: cancelFinalize,
            disabled: draft.isFinalizing,
            accessibilityLabel: "Cancel finalize report",
          },
        ]}
      />

      <AppDialogSheet
        visible={notes.deleteIndex !== null}
        title={deleteNoteCopy.title}
        message={deleteNoteCopy.message}
        noticeTone={deleteNoteCopy.tone}
        noticeTitle={deleteNoteCopy.noticeTitle}
        onClose={() => notes.setDeleteIndex(null)}
        actions={[
          {
            label: deleteNoteCopy.confirmLabel,
            variant: deleteNoteCopy.confirmVariant,
            onPress: notes.confirmDelete,
            accessibilityLabel: "Confirm delete note",
            align: "start",
          },
          {
            label: deleteNoteCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: () => notes.setDeleteIndex(null),
            accessibilityLabel: "Cancel deleting note",
          },
        ]}
      />

      <AppDialogSheet
        visible={draftDeleteErrorDialog !== null}
        title={draftDeleteErrorDialog?.title ?? "Delete Failed"}
        message={draftDeleteErrorDialog?.message ?? ""}
        noticeTone={draftDeleteErrorDialog?.tone ?? "danger"}
        noticeTitle={draftDeleteErrorDialog?.noticeTitle}
        onClose={() => draft.setDraftDeleteErrorMessage(null)}
        actions={
          draftDeleteErrorDialog
            ? [
                {
                  label: draftDeleteErrorDialog.confirmLabel,
                  variant: draftDeleteErrorDialog.confirmVariant,
                  onPress: () => draft.setDraftDeleteErrorMessage(null),
                  accessibilityLabel: "Dismiss draft delete error",
                },
              ]
            : []
        }
      />

      <AppDialogSheet
        visible={fileUploadErrorDialog !== null}
        title={fileUploadErrorDialog?.title ?? "Upload Failed"}
        message={fileUploadErrorDialog?.message ?? ""}
        noticeTone={fileUploadErrorDialog?.tone ?? "danger"}
        noticeTitle={fileUploadErrorDialog?.noticeTitle}
        onClose={() => ui.setFileUploadError(null)}
        actions={
          fileUploadErrorDialog
            ? [
                {
                  label: fileUploadErrorDialog.confirmLabel,
                  variant: fileUploadErrorDialog.confirmVariant,
                  onPress: () => ui.setFileUploadError(null),
                  accessibilityLabel: "Dismiss file upload error",
                  testID: "btn-dismiss-file-upload-error",
                },
              ]
            : []
        }
      />

      <ImagePreviewModal
        visible={preview.file !== null}
        title={preview.file?.filename}
        onClose={() => preview.set(null)}
        {...preview.extras}
      />

      <AppDialogSheet
        visible={ui.attachmentSheetVisible}
        title="Add attachment"
        onClose={closeAttachmentSheet}
        actions={[
          {
            label: "Document",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment("document");
            },
            accessibilityLabel: "Pick a document",
          },
          {
            label: "Photo Library",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment("image");
            },
            accessibilityLabel: "Pick a photo from library",
          },
          {
            label: "Camera",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              void photo.handleCameraCapture();
            },
            accessibilityLabel: "Take a photo with the camera",
          },
          {
            label: "Cancel",
            variant: "quiet",
            onPress: closeAttachmentSheet,
            accessibilityLabel: "Cancel attachment picker",
          },
        ]}
      />
    </>
  );
}

===== FILE: apps/mobile-old/components/reports/StatBar.tsx =====
import { View, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatTile } from "@/components/ui/StatTile";
import { getReportStats } from "@/lib/mobile-ui";

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="flex-row gap-3">
      {stats.map((stat, i) => (
        <StatTile
          key={stat.label}
          value={stat.value}
          label={stat.label}
          tone={stat.tone === "warning" && i === 2 ? "warning" : "default"}
          compact
        />
      ))}
    </Animated.View>
  );
}

===== FILE: apps/mobile-old/components/reports/WeatherStrip.tsx =====
import { View, Text } from "react-native";
import { Cloud, Thermometer, Wind } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface WeatherStripProps {
  report: GeneratedSiteReport;
}

export function WeatherStrip({ report }: WeatherStripProps) {
  const weather = report.report.weather;
  if (!weather) return null;

  const items = [
    weather.conditions ? { icon: Cloud, text: weather.conditions } : null,
    weather.temperature
      ? { icon: Thermometer, text: weather.temperature }
      : null,
    weather.wind ? { icon: Wind, text: weather.wind } : null,
  ].filter(Boolean) as Array<{ icon: typeof Cloud; text: string }>;

  if (items.length === 0) return null;

  return (
    <Card variant="default" padding="md" className="gap-3">
      {items[0] ? (() => {
        const CondIcon = items[0].icon;
        return (
          <View className="flex-row items-start gap-1.5">
            <CondIcon size={14} color={colors.muted.foreground} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-sm font-medium text-foreground">
              {items[0].text}
            </Text>
          </View>
        );
      })() : null}
      {items.length > 1 ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {items.slice(1).map((item) => {
            const Icon = item.icon;
            return (
              <View
                key={item.text}
                className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2"
              >
                <Icon size={14} color={colors.muted.foreground} />
                <Text className="text-sm font-medium text-foreground">{item.text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {weather.impact ? (
        <Text className="text-sm text-muted-foreground">
          Impact: {weather.impact}
        </Text>
      ) : null}
    </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/SummarySectionCard.tsx =====
import { View, Text } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SECTION_ICONS } from "@/lib/section-icons";
import type { GeneratedReportSection } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface SummarySectionCardProps {
  section: GeneratedReportSection;
}

export function SummarySectionCard({ section }: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title={section.title}
        icon={<Icon size={16} color={colors.foreground} />}
      />
      <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
        {section.content}
      </Text>
    </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/IssuesCard.tsx =====
import { View, Text } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toTitleCase } from "@/lib/report-helpers";
import { getIssueSeverityTone } from "@/lib/mobile-ui";
import { colors } from "@/lib/design-tokens/colors";
import type { GeneratedReportIssue } from "@/lib/generated-report";

// Severity styles use the soft `*-border` ramp (instead of the saturated
// `*-DEFAULT`) so cards match the visual weight of the rest of the design
// system (e.g. CompletenessCard, InlineNotice). The 4-px stripe is rendered
// via className so it picks up Tailwind theme changes automatically.
const SEVERITY_STYLES: Record<
  string,
  { stripe: string; bg: string; text: string }
> = {
  danger: {
    stripe: "bg-danger-border",
    bg: "bg-danger-soft",
    text: "text-danger-text",
  },
  warning: {
    stripe: "bg-warning-border",
    bg: "bg-warning-soft",
    text: "text-warning-text",
  },
  neutral: {
    stripe: "bg-border",
    bg: "bg-secondary",
    text: "text-muted-foreground",
  },
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[getIssueSeverityTone(severity)];
}

interface IssuesCardProps {
  issues: readonly GeneratedReportIssue[];
}

export function IssuesCard({ issues }: IssuesCardProps) {
  if (issues.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
        <SectionHeader
          title="Issues"
          icon={<AlertTriangle size={16} color={colors.warning.text} />}
          trailing={
            <View className="rounded-md border border-warning-border bg-warning-soft px-3 py-1.5">
              <Text className="text-sm font-semibold text-warning-text">
                {issues.length}
              </Text>
            </View>
          }
        />
        <View className="mt-4 gap-4">
          {issues.map((issue, index) => {
            const style = getSeverityStyle(issue.severity);
            return (
              <View
                key={`${issue.title}-${index}`}
                className={index > 0 ? "border-t border-border pt-4" : ""}
              >
                <View className="flex-row gap-3">
                  <View
                    className={`${style.stripe} self-stretch rounded-full`}
                    style={{ width: 4 }}
                  />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-start gap-3">
                      <Text className="flex-1 text-base font-semibold text-foreground">
                        {issue.title}
                      </Text>
                      <View className={`${style.bg} shrink-0 rounded-md border border-current px-2.5 py-1.5`}>
                        <Text className={`text-sm font-semibold uppercase tracking-wider ${style.text}`}>
                          {toTitleCase(issue.severity)}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-2 text-sm text-muted-foreground">
                      {[issue.category, issue.status]
                        .filter(Boolean)
                        .map(toTitleCase)
                        .join(" · ")}
                    </Text>
                    <Text className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {issue.details}
                    </Text>
                    {issue.actionRequired ? (
                      <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                        <Text className="text-base font-medium text-warning-text">
                          → {issue.actionRequired}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/WorkersCard.tsx =====
import { View, Text } from "react-native";
import { Users } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedReportWorkers } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface WorkersCardProps {
  workers: GeneratedReportWorkers | null;
}

export function WorkersCard({ workers }: WorkersCardProps) {
  if (!workers) return null;

  const hasRoles = workers.roles.length > 0;
  const maxCount = Math.max(...workers.roles.map((r) => r.count ?? 0), 1);

  return (
    <Card variant="default" padding="lg">
        <SectionHeader
          title="Workers"
          subtitle={workers.totalWorkers !== null ? `${workers.totalWorkers} on site.` : "Crew breakdown recorded."}
          icon={<Users size={16} color={colors.foreground} />}
        />

        {hasRoles && (
          <View className="mt-4 gap-3">
            {workers.roles.map((role, index) => {
              const count = role.count ?? 0;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <View key={`${role.role}-${index}`} className="gap-1.5 rounded-md bg-surface-muted px-3 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base text-foreground">
                      {role.role}
                    </Text>
                    <Text className="text-base font-medium text-muted-foreground">
                      {count}
                    </Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-secondary">
                    <View
                      className="h-2 rounded-full bg-foreground"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {workers.workerHours ? (
          <Text className="mt-4 text-base text-muted-foreground">
            Hours: {workers.workerHours}
          </Text>
        ) : null}
        {workers.notes ? (
          <Text className="mt-2 text-base text-muted-foreground">
            {workers.notes}
          </Text>
        ) : null}
      </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/MaterialsCard.tsx =====
import { View, Text } from "react-native";
import { Package } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getItemMeta } from "@/lib/report-helpers";
import type { GeneratedReportMaterial } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface MaterialsCardProps {
  materials: readonly GeneratedReportMaterial[];
}

export function MaterialsCard({ materials }: MaterialsCardProps) {
  if (materials.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
        <SectionHeader
          title="Materials"
          subtitle={`${materials.length} material${materials.length === 1 ? "" : "s"} recorded.`}
          icon={<Package size={16} color={colors.foreground} />}
        />

        <View className="mt-4 gap-3">
          {materials.map((material, index) => {
            const meta = getItemMeta([material.quantity, material.quantityUnit, material.status, material.condition]);
            return (
              <View key={`${material.name}-${index}`} className="gap-1 rounded-md bg-surface-muted px-3 py-3">
                <Text className="text-base font-medium text-foreground">
                  {material.name}
                </Text>
                {meta && (
                  <Text className="text-sm text-muted-foreground">
                    {meta}
                  </Text>
                )}
                {material.notes && (
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {material.notes}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/NextStepsCard.tsx =====
import { View, Text } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/lib/design-tokens/colors";

interface NextStepsCardProps {
  steps: readonly string[];
}

export function NextStepsCard({ steps }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
        <SectionHeader
          title="Next Steps"
          subtitle={steps.length === 1 ? "1 follow-up action." : `${steps.length} follow-up actions.`}
          icon={<ClipboardList size={16} color={colors.foreground} />}
        />
        <View className="mt-4 gap-3">
          {steps.map((step, index) => (
            <View
              key={`step-${index}`}
              className="flex-row items-start gap-3"
            >
              <Text className="min-w-[18px] text-base font-semibold text-foreground">
                {index + 1}.
              </Text>
              <Text className="flex-1 text-base leading-relaxed text-muted-foreground">
                {step}
              </Text>
            </View>
          ))}
        </View>
      </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/CompletenessCard.tsx =====
import { View, Text } from "react-native";
import { colors } from "@/lib/design-tokens/colors";
import {
  AlertTriangle,
  Cloud,
  Users,
  Package,
  ClipboardList,
} from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedSiteReport } from "@/lib/generated-report";

type MissingField = {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
};

function getMissingFields(report: GeneratedSiteReport): MissingField[] {
  const missing: MissingField[] = [];

  if (!report.report.meta.visitDate) {
    missing.push({ label: "Visit date", icon: ClipboardList });
  }
  if (!report.report.weather) {
    missing.push({ label: "Weather conditions", icon: Cloud });
  }
  if (!report.report.workers) {
    missing.push({ label: "Workers / crew info", icon: Users });
  }
  if (report.report.materials.length === 0) {
    missing.push({ label: "Materials", icon: Package });
  }
  if (report.report.issues.length === 0) {
    missing.push({ label: "Issues / risks", icon: AlertTriangle });
  }
  if (report.report.nextSteps.length === 0) {
    missing.push({ label: "Next steps", icon: ClipboardList });
  }

  return missing;
}

interface CompletenessCardProps {
  report: GeneratedSiteReport;
}

export function CompletenessCard({ report }: CompletenessCardProps) {
  const missingFields = getMissingFields(report);

  if (missingFields.length === 0) {
    return null;
  }

  return (
    <Card variant="emphasis">
        <SectionHeader
          title={`Still missing (${missingFields.length})`}
          subtitle="Add a note about the topics below to complete the report."
          icon={<AlertTriangle size={16} color={colors.warning.text} />}
        />
        <View className="mt-3 flex-row flex-wrap gap-2">
          {missingFields.map((field) => (
            <View
              key={field.label}
              className="flex-row items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-3 py-2"
            >
              <field.icon size={12} color={colors.warning.text} />
              <Text className="text-sm font-semibold uppercase tracking-wider text-warning-text">
                {field.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
  );
}

===== FILE: apps/mobile-old/components/reports/ReportView.tsx =====
import { View, Text } from "react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatBar } from "./StatBar";
import { WeatherStrip } from "./WeatherStrip";
import { WorkersCard } from "./WorkersCard";
import { MaterialsCard } from "./MaterialsCard";
import { IssuesCard } from "./IssuesCard";
import { NextStepsCard } from "./NextStepsCard";
import { SummarySectionCard } from "./SummarySectionCard";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/lib/design-tokens/colors";

interface ReportViewProps {
  report: GeneratedSiteReport;
}

export function ReportView({ report }: ReportViewProps) {
  const { sections } = report.report;

  return (
    <View className="gap-3">
      {/* Key metrics at a glance */}
      <StatBar report={report} />

      {/* Weather context — compact strip */}
      <WeatherStrip report={report} />

      {/* Summary */}
      {report.report.meta.summary ? (
          <Card variant="default" padding="lg">
            <SectionHeader
              title="Summary"
              icon={<FileText size={16} color={colors.foreground} />}
            />
            <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
              {report.report.meta.summary}
            </Text>
          </Card>
      ) : null}

      {/* Issues first — highest priority for action */}
      <IssuesCard issues={report.report.issues} />

      {/* Workers breakdown */}
      <WorkersCard workers={report.report.workers} />

      {/* Materials */}
      <MaterialsCard materials={report.report.materials} />

      {/* Next steps — numbered action items */}
      <NextStepsCard steps={report.report.nextSteps} />

      {/* Summary sections */}
      {sections.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Summary Sections
          </Text>
          {sections.map((section, i) => (
            <SummarySectionCard
              key={`${section.title}-${i}`}
              section={section}
            />
          ))}
        </View>
      )}
    </View>
  );
}

===== FILE: apps/mobile-old/components/reports/PdfPreviewModal.tsx =====
import { View, Text, Modal, ActivityIndicator, Platform } from "react-native";
import { useState, useEffect } from "react";
import { WebView } from "react-native-webview";
import Pdf from "react-native-pdf";
import { colors } from "@/lib/design-tokens/colors";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { Share2 } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  saveReportPdf,
  shareSavedReportPdf,
  openSavedReportPdf,
  type ExportedReport,
} from "@/lib/export-report-pdf";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface PdfPreviewModalProps {
  visible: boolean;
  report: GeneratedSiteReport | undefined;
  siteName?: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({
  visible,
  report,
  siteName,
  onClose,
}: PdfPreviewModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pdfResult, setPdfResult] = useState<ExportedReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPdfResult(null);
      setErrorMessage(null);
      setIsGenerating(false);
      setIsSharing(false);
      return;
    }

    if (!report) return;

    let cancelled = false;
    setIsGenerating(true);
    setErrorMessage(null);

    saveReportPdf(report, { siteName })
      .then((result) => {
        if (!cancelled) {
          setPdfResult(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Could not generate PDF.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, report, siteName]);

  const handleShare = async () => {
    if (!pdfResult || !report) return;
    setIsSharing(true);
    try {
      await shareSavedReportPdf({
        pdfUri: pdfResult.pdfUri,
        reportTitle: report.report.meta.title,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not share the PDF.",
      );
    } finally {
      setIsSharing(false);
    }
  };

  // On Android, WebView can't render local PDFs directly. We render the
  // PDF in-app via `react-native-pdf` and offer an "Open externally" button
  // as a fallback for users who prefer their system viewer.
  const handleOpenExternally = async () => {
    if (!pdfResult) return;
    try {
      await openSavedReportPdf(pdfResult.pdfUri);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not open the PDF.",
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="px-5 pb-2 pt-2">
          <ScreenHeader
            title="PDF Preview"
            onBack={onClose}
            backLabel="Close"
            trailing={
              pdfResult ? (
                <Button
                  variant="secondary"
                  size="default"
                  accessibilityLabel="Share PDF"
                  onPress={handleShare}
                  disabled={isSharing}
                >
                  <View className="flex-row items-center gap-1.5">
                    <Share2 size={14} color={colors.foreground} />
                    <Text className="text-sm font-semibold text-foreground">
                      {isSharing ? "Sharing..." : "Share"}
                    </Text>
                  </View>
                </Button>
              ) : null
            }
          />
        </View>

        {isGenerating ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color={colors.foreground} />
            <Text className="text-base text-muted-foreground">
              Generating PDF...
            </Text>
          </View>
        ) : errorMessage ? (
          <View className="flex-1 items-center justify-center px-5">
            <InlineNotice tone="danger" title="PDF generation failed">
              {errorMessage}
            </InlineNotice>
            <Button
              variant="secondary"
              size="default"
              className="mt-4"
              onPress={onClose}
            >
              Close
            </Button>
          </View>
        ) : pdfResult ? (
          Platform.OS === "ios" ? (
            <WebView
              testID="pdf-preview"
              source={{ uri: pdfResult.pdfUri }}
              style={{ flex: 1 }}
              originWhitelist={["file://*"]}
              allowFileAccess
              startInLoadingState
              renderLoading={() => (
                <View className="absolute inset-0 items-center justify-center bg-background">
                  <ActivityIndicator size="large" color={colors.foreground} />
                </View>
              )}
            />
          ) : (
            <View className="flex-1" testID="pdf-preview">
              <Pdf
                source={{ uri: pdfResult.pdfUri }}
                style={{ flex: 1, backgroundColor: colors.card }}
                trustAllCerts={false}
                onError={(err) => {
                  setErrorMessage(
                    err instanceof Error ? err.message : "Could not display PDF.",
                  );
                }}
              />
              <View className="px-5 py-3">
                <Button
                  variant="secondary"
                  size="default"
                  onPress={handleOpenExternally}
                  accessibilityLabel="Open in external PDF viewer"
                  testID="btn-pdf-open-externally"
                >
                  Open externally
                </Button>
              </View>
            </View>
          )
        ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

===== FILE: apps/mobile-old/components/reports/detail/ReportActionsMenu.tsx =====
import { View, Text, Modal, Pressable } from "react-native";
import {
  Eye,
  FileDown,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/design-tokens/colors";

interface ReportActionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onViewPdf: () => void;
  onSavePdf: () => void;
  onSharePdf: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isExporting: boolean;
  isDeleting: boolean;
}

export function ReportActionsMenu({
  visible,
  onClose,
  onViewPdf,
  onSavePdf,
  onSharePdf,
  onDelete,
  isSaving,
  isExporting,
  isDeleting,
}: ReportActionsMenuProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
        accessible={false}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          accessible={false}
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">Report Actions</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={colors.muted.foreground} />
            </Pressable>
          </View>

          <View className="gap-3 px-5 pt-4">
            <Button
              variant="secondary"
              size="lg"
              className="justify-start"
              accessibilityLabel="View report as PDF"
              testID="btn-report-view-pdf"
              onPress={onViewPdf}
            >
              <View className="flex-row items-center gap-3">
                <Eye size={16} color={colors.foreground} />
                <Text className="text-base font-semibold text-foreground">
                  View PDF
                </Text>
              </View>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              className="justify-start"
              accessibilityLabel="Save report PDF"
              testID="btn-report-save-pdf"
              onPress={onSavePdf}
              disabled={isSaving || isExporting}
            >
              <View className="flex-row items-center gap-3">
                <FileDown size={16} color={colors.foreground} />
                <Text className="text-base font-semibold text-foreground">
                  {isSaving ? "Saving PDF..." : "Save PDF"}
                </Text>
              </View>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              className="justify-start"
              accessibilityLabel="Share report as PDF"
              testID="btn-report-share-pdf"
              onPress={onSharePdf}
              disabled={isExporting || isSaving}
            >
              <View className="flex-row items-center gap-3">
                <Share2 size={16} color={colors.foreground} />
                <Text className="text-base font-semibold text-foreground">
                  {isExporting ? "Sharing PDF..." : "Share PDF"}
                </Text>
              </View>
            </Button>

            <Button
              variant="destructive"
              size="lg"
              className="justify-start"
              accessibilityLabel="Delete report"
              testID="btn-report-delete"
              onPress={onDelete}
              disabled={isDeleting}
            >
              <View className="flex-row items-center gap-3">
                <Trash2 size={16} color={colors.danger.text} />
                <Text className="text-base font-semibold text-danger-text">
                  {isDeleting ? "Deleting..." : "Delete Report"}
                </Text>
              </View>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

===== FILE: apps/mobile-old/components/reports/detail/SavedReportSheet.tsx =====
import { View, Text, ActivityIndicator, Modal, Pressable } from "react-native";
import {
  FileText,
  FolderOpen,
  Share2,
  X,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { colors } from "@/lib/design-tokens/colors";
import { getSavedReportDetails } from "@/lib/export-report-pdf";
import type { SavedReportSheetState } from "@/hooks/useReportPdfActions";

type SavedReportDetails = ReturnType<typeof getSavedReportDetails>;

interface SavedReportSheetProps {
  state: SavedReportSheetState | null;
  details: SavedReportDetails | null;
  errorMessage: string | null;
  isOpening: boolean;
  isSharing: boolean;
  onClose: () => void;
  onOpen: () => void;
  onShare: () => void;
  onRetrySave: () => void;
}

export function SavedReportSheet({
  state,
  details,
  errorMessage,
  isOpening,
  isSharing,
  onClose,
  onOpen,
  onShare,
  onRetrySave,
}: SavedReportSheetProps) {
  const canDismiss = !isOpening && !isSharing;
  const isGenerating = state?.status === "generating";
  const isError = state?.status === "error";

  return (
    <Modal
      visible={state !== null}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (canDismiss) onClose();
      }}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessible={false}
        onPress={() => {
          if (canDismiss) onClose();
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          accessible={false}
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">
              {isGenerating
                ? "Preparing PDF…"
                : isError
                  ? "PDF Failed"
                  : details?.title ?? "PDF Saved"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={!canDismiss}>
              <X size={20} color={colors.muted.foreground} />
            </Pressable>
          </View>

          {isGenerating ? (
            <View className="items-center justify-center gap-3 px-5 py-8">
              <ActivityIndicator size="large" color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Generating PDF for {state?.reportTitle ?? "report"}…
              </Text>
            </View>
          ) : isError ? (
            <View className="gap-4 px-5 pt-4">
              <InlineNotice tone="danger" title="PDF generation failed">
                {state?.errorMessage ?? "Could not generate PDF."}
              </InlineNotice>
              <Button variant="secondary" size="lg" onPress={onRetrySave}>
                Retry
              </Button>
              <Button variant="quiet" size="lg" onPress={onClose}>
                Dismiss
              </Button>
            </View>
          ) : details ? (
            <View className="gap-4 px-5 pt-4">
              <InlineNotice tone="success" title="Saved to app documents">
                {details.locationDescription}
              </InlineNotice>

              <Card className="gap-3">
                <View className="flex-row items-center gap-2">
                  <FolderOpen size={16} color={colors.foreground} />
                  <Text className="text-sm font-semibold text-foreground">
                    Full path
                  </Text>
                </View>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.fullPath}
                </Text>
              </Card>

              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">
                  Open it now or send it somewhere else
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.openHint}
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.shareHint}
                </Text>
              </View>

              {errorMessage ? (
                <InlineNotice tone="danger" title="Action failed">
                  {errorMessage}
                </InlineNotice>
              ) : null}

              <View className="gap-3">
                <Button
                  variant="default"
                  size="lg"
                  className="justify-start"
                  accessibilityLabel="Open saved PDF"
                  onPress={onOpen}
                  disabled={isOpening || isSharing}
                >
                  <View className="flex-row items-center gap-3">
                    <FileText size={16} color={colors.primary.foreground} />
                    <Text className="text-base font-semibold text-primary-foreground">
                      {isOpening ? "Opening PDF..." : "Open PDF"}
                    </Text>
                  </View>
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  className="justify-start"
                  accessibilityLabel="Share saved PDF"
                  onPress={onShare}
                  disabled={isSharing || isOpening}
                >
                  <View className="flex-row items-center gap-3">
                    <Share2 size={16} color={colors.foreground} />
                    <Text className="text-base font-semibold text-foreground">
                      {isSharing ? "Sharing PDF..." : "Share PDF"}
                    </Text>
                  </View>
                </Button>

                <Button
                  variant="quiet"
                  size="lg"
                  className="justify-center"
                  testID="btn-saved-pdf-done"
                  accessibilityLabel="Close saved PDF dialog"
                  onPress={onClose}
                  disabled={isSharing || isOpening}
                >
                  Done
                </Button>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

===== FILE: apps/mobile-old/components/reports/detail/ReportDetailTabBar.tsx =====
import { View, Text, Pressable } from "react-native";
import { FileText, MessageSquare, Pencil } from "lucide-react-native";
import { colors } from "@/lib/design-tokens/colors";

export type ReportDetailTab = "report" | "notes" | "edit";

interface ReportDetailTabBarProps {
  activeTab: ReportDetailTab;
  onChange: (tab: ReportDetailTab) => void;
  notesCount?: number;
}

export function ReportDetailTabBar({
  activeTab,
  onChange,
  notesCount,
}: ReportDetailTabBarProps) {
  const notesLabel =
    typeof notesCount === "number" && notesCount > 0
      ? `Notes (${notesCount})`
      : "Notes";

  return (
    <View className="mx-5 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-report"
        onPress={() => onChange("report")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "report" ? "bg-foreground" : ""
        }`}
      >
        <FileText
          size={16}
          color={
            activeTab === "report"
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "report"
              ? "text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          Report
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-notes"
        onPress={() => onChange("notes")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "notes" ? "bg-foreground" : ""
        }`}
      >
        <MessageSquare
          size={16}
          color={
            activeTab === "notes"
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "notes"
              ? "text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {notesLabel}
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={() => onChange("edit")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "edit" ? "bg-foreground" : ""
        }`}
      >
        <Pencil
          size={16}
          color={
            activeTab === "edit"
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "edit"
              ? "text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          Edit
        </Text>
      </Pressable>
    </View>
  );
}

===== FILE: apps/mobile-old/components/voice-notes/VoiceNoteCard.tsx =====
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Play, Pause, MoreVertical, Sparkles } from "lucide-react-native";
import { useVoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  LONG_TRANSCRIPT_CHAR_THRESHOLD,
  useIsSummarizingFile,
  useSummarizeVoiceNote,
} from "@/hooks/useSummarizeVoiceNote";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { getDeleteVoiceNoteDialogCopy } from "@/lib/app-dialog-copy";
import { Card } from "@/components/ui/Card";
import { type FileMetadataRow } from "@/lib/file-upload";
import { colors } from "@/lib/design-tokens/colors";
import { formatCapturedAt } from "@/lib/format-date";
import { shareVoiceNote } from "@/lib/voice-note-share";

interface VoiceNoteCardProps {
  file: FileMetadataRow;
  /** Transcription text from the associated report_notes row. */
  transcription?: string | null;
  /** True while the transcript is still being generated for this file. */
  isTranscribing?: boolean;
  /** Hide the delete button (for read-only views). */
  readOnly?: boolean;
  /** Display name of the person who recorded this voice note. */
  authorName?: string | null;
  /**
   * ISO timestamp to display in the card header. Should be the
   * `report_notes.created_at` for the note row that links this file to
   * the report — *not* the file's own `created_at`. Falls back to
   * `file.created_at` when null/undefined so legacy callers keep working.
   */
  capturedAt?: string | null;
  /**
   * Disable the auto-summarize-on-long-transcript behaviour. The "Summarize"
   * button still works. Tests use this to keep effects out of snapshots.
   */
  disableAutoSummarize?: boolean;
}

/**
 * Renders a single voice-note file: play/pause button, position indicator,
 * and the transcription text. Used both during report compose and read.
 */
export function VoiceNoteCard({
  file,
  transcription: transcriptionProp,
  isTranscribing,
  readOnly,
  authorName,
  capturedAt,
  disableAutoSummarize,
}: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, {
    file,
    authorName: authorName ?? null,
    fallbackDurationMs: file.duration_ms,
  });
  const deleteFile = useDeleteFile();
  const { copy } = useCopyToClipboard();
  const summarize = useSummarizeVoiceNote();
  const isSummarizingFile = useIsSummarizingFile(file.id);

  // Eagerly download the audio file to disk cache on mount so tapping
  // Play starts instantly from local bytes instead of waiting for a
  // signed-URL fetch + download.
  useEffect(() => {
    void player.preload();
    // Only run once on mount — storagePath is stable for a given card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [progressWidth, setProgressWidth] = useState(0);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isOptionsDialogVisible, setIsOptionsDialogVisible] = useState(false);
  const [isTranscriptDialogVisible, setIsTranscriptDialogVisible] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const deleteDialogCopy = getDeleteVoiceNoteDialogCopy();

  const onTogglePlay = () => {
    if (player.isPlaying) player.pause();
    else void player.play();
  };

  const durationMs = player.durationMs || file.duration_ms || 0;
  const progressRatio = durationMs > 0 ? Math.min(player.positionMs / durationMs, 1) : 0;
  const loadingLabel = player.isDownloading ? "Downloading" : player.isLoading ? "Loading" : null;

  const handleSeekPress = (event: { nativeEvent?: { locationX?: number } }) => {
    if (player.isLoading || durationMs <= 0 || progressWidth <= 0) return;
    const locationX = event.nativeEvent?.locationX ?? 0;
    const ratio = Math.min(Math.max(locationX / progressWidth, 0), 1);
    void player.seekTo(Math.round(durationMs * ratio));
  };

  const transcription = transcriptionProp?.trim() ?? "";
  const voiceTitle = file.voice_title?.trim() ?? "";
  const voiceSummary = file.voice_summary?.trim() ?? "";
  const isLongTranscript = transcription.length > LONG_TRANSCRIPT_CHAR_THRESHOLD;
  const hasSummary = voiceSummary.length > 0;
  const canSummarize = isLongTranscript && !hasSummary && !isTranscribing;

  // Auto-summarize once per mount when we have a long transcript without an
  // existing summary. Two layers of dedup:
  //   1. `hasTriggeredAutoSummarize` is per-instance — stops re-renders of
  //      THIS card from re-firing the mutation.
  //   2. `isSummarizingFile` queries the global TanStack mutation cache —
  //      stops sibling cards rendering the SAME file_id (e.g. compose tab +
  //      project list) from each firing their own duplicate call.
  // The edge function is also idempotent, so this is defence-in-depth.
  const hasTriggeredAutoSummarize = useRef(false);
  useEffect(() => {
    if (disableAutoSummarize) return;
    if (!canSummarize) return;
    if (hasTriggeredAutoSummarize.current) return;
    if (summarize.isPending) return;
    if (isSummarizingFile) return;
    hasTriggeredAutoSummarize.current = true;
    summarize.mutate({
      fileId: file.id,
      transcript: transcription,
      projectId: file.project_id,
    });
    // Auto-summarize fires once per mount. Manual retries go through
    // handleManualSummarize. The mutation object is stable across renders
    // so excluding it doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSummarize,
    disableAutoSummarize,
    file.id,
    file.project_id,
    isSummarizingFile,
    transcription,
  ]);

  const handleManualSummarize = () => {
    if (summarize.isPending || !transcription) return;
    hasTriggeredAutoSummarize.current = true;
    summarize.mutate({
      fileId: file.id,
      transcript: transcription,
      projectId: file.project_id,
    });
  };

  const handleConfirmDelete = () => {
    setIsDeleteDialogVisible(false);
    deleteFile.mutate({
      fileId: file.id,
      storagePath: file.storage_path,
      projectId: file.project_id,
    });
  };

  const closeOptionsDialog = () => {
    setIsOptionsDialogVisible(false);
    setShareError(null);
  };

  const handleOpenOptions = () => {
    setShareError(null);
    setIsOptionsDialogVisible(true);
  };

  const handleShareIntent = async (intent: "share" | "download") => {
    if (isShareBusy) return;
    setShareError(null);
    setIsShareBusy(true);
    try {
      // Make sure the audio is in the disk cache before handing it off
      // to the system share sheet — preload is idempotent and a no-op if
      // the file is already cached.
      await player.preload();
      await shareVoiceNote({
        storagePath: file.storage_path,
        mimeType: file.mime_type,
        intent,
      });
      setIsOptionsDialogVisible(false);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Could not share the voice note.",
      );
    } finally {
      setIsShareBusy(false);
    }
  };

  const handleCopyValue = (
    value: string | null | undefined,
    toast: string,
  ) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return;
    void copy(trimmed, { toast });
  };

  const handleDeleteFromOptions = () => {
    setIsOptionsDialogVisible(false);
    setIsDeleteDialogVisible(true);
  };

  const handleViewTranscript = () => {
    setIsOptionsDialogVisible(false);
    setIsTranscriptDialogVisible(true);
  };

  const headerTimestamp = capturedAt ?? file.created_at;

  // Header layout matches the text-note row in NoteTimeline so both kinds
  // of notes line up identically: author on the left, short id + captured-
  // at on the right, all in muted 10px text.
  return (
    <Card className="gap-2 p-3" testID={`voice-note-card-${file.id}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className="flex-1 text-[10px] font-medium text-muted-foreground"
          numberOfLines={1}
        >
          {authorName ?? "Unknown author"}
        </Text>
        {headerTimestamp ? (
          <Text
            className="text-[10px] text-muted-foreground"
            numberOfLines={1}
            testID={`voice-note-captured-at-${file.id}`}
          >
            {formatCapturedAt(headerTimestamp)}
          </Text>
        ) : null}
      </View>
      {voiceTitle ? (
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={2}
          testID={`voice-note-title-${file.id}`}
        >
          {voiceTitle}
        </Text>
      ) : null}
      {hasSummary ? (
        <Text
          className="text-sm text-foreground"
          testID={`voice-note-summary-${file.id}`}
        >
          {voiceSummary}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onTogglePlay}
          disabled={player.isLoading}
          accessibilityLabel={
            player.isPlaying ? "Pause voice note" : "Play voice note"
          }
          testID={`btn-voice-note-play-${file.id}`}
          className="h-8 w-8 items-center justify-center rounded-full bg-primary"
        >
          {player.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary.foreground} />
          ) : player.isPlaying ? (
            <Pause size={14} color={colors.primary.foreground} />
          ) : (
            <Play size={14} color={colors.primary.foreground} />
          )}
        </Pressable>
        <Pressable
          onPress={handleSeekPress}
          onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
          disabled={player.isLoading || durationMs <= 0}
          accessibilityRole="adjustable"
          accessibilityLabel="Voice note playback position"
          accessibilityValue={{
            min: 0,
            max: Math.round(durationMs / 1000),
            now: Math.round(player.positionMs / 1000),
          }}
          testID={`voice-note-progress-${file.id}`}
          className="h-5 min-w-0 flex-1 justify-center"
        >
          <View className="h-1.5 overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </View>
        </Pressable>
        <Text className="w-[70px] text-right text-xs text-muted-foreground">
          {loadingLabel ?? `${formatDuration(player.positionMs)} / ${formatDuration(durationMs)}`}
        </Text>
        <Pressable
          onPress={handleOpenOptions}
          hitSlop={8}
          disabled={deleteFile.isPending}
          accessibilityLabel="Voice note options"
          testID={`btn-voice-note-options-${file.id}`}
          className="h-8 w-8 items-center justify-center rounded-md"
        >
          {deleteFile.isPending ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <MoreVertical size={18} color={colors.muted.foreground} />
          )}
        </Pressable>
      </View>
      {isTranscribing ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={colors.muted.foreground} />
          <Text className="text-xs italic text-muted-foreground">
            Transcribing…
          </Text>
        </View>
      ) : transcription ? null : (
        <Text className="text-xs italic text-muted-foreground">
          (no transcription yet)
        </Text>
      )}
      {summarize.isPending ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={colors.muted.foreground} />
          <Text className="text-xs italic text-muted-foreground">
            Summarizing…
          </Text>
        </View>
      ) : canSummarize ? (
        <Pressable
          onPress={handleManualSummarize}
          accessibilityRole="button"
          accessibilityLabel="Summarize voice note"
          testID={`btn-voice-note-summarize-${file.id}`}
          className="flex-row items-center gap-1 self-start rounded-md px-1 py-0.5"
        >
          <Sparkles size={12} color={colors.primary.DEFAULT} />
          <Text className="text-xs font-medium text-primary">Summarize</Text>
        </Pressable>
      ) : null}
      {summarize.isError ? (
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-xs text-danger-foreground"
            selectable
            testID={`voice-note-summary-error-${file.id}`}
          >
            {summarize.error?.message ?? "Could not summarize"}
          </Text>
          <Pressable
            onPress={handleManualSummarize}
            accessibilityRole="button"
            accessibilityLabel="Retry summarize"
          >
            <Text className="text-xs font-medium text-primary">Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {player.error ? (
        <Text className="text-xs text-danger-foreground" selectable>{player.error}</Text>
      ) : null}
      <AppDialogSheet
        visible={isDeleteDialogVisible}
        title={deleteDialogCopy.title}
        message={deleteDialogCopy.message}
        noticeTone={deleteDialogCopy.tone}
        noticeTitle={deleteDialogCopy.noticeTitle}
        onClose={() => setIsDeleteDialogVisible(false)}
        actions={[
          {
            label: deleteDialogCopy.confirmLabel,
            variant: deleteDialogCopy.confirmVariant,
            onPress: handleConfirmDelete,
          },
          {
            label: deleteDialogCopy.cancelLabel ?? "Cancel",
            variant: "secondary",
            onPress: () => setIsDeleteDialogVisible(false),
          },
        ]}
      />
      <AppDialogSheet
        visible={isOptionsDialogVisible}
        title="Voice note options"
        onClose={closeOptionsDialog}
        actions={[
          {
            label: "View transcript",
            variant: "secondary",
            disabled: !transcription,
            onPress: handleViewTranscript,
            testID: `dialog-action-voice-note-view-transcript-${file.id}`,
          },
          {
            label: isShareBusy ? "Preparing…" : "Download",
            variant: "secondary",
            disabled: isShareBusy,
            onPress: () => {
              void handleShareIntent("download");
            },
            testID: `dialog-action-voice-note-download-${file.id}`,
          },
          {
            label: isShareBusy ? "Preparing…" : "Share",
            variant: "secondary",
            disabled: isShareBusy,
            onPress: () => {
              void handleShareIntent("share");
            },
            testID: `dialog-action-voice-note-share-${file.id}`,
          },
          ...(readOnly
            ? []
            : [
                {
                  label: "Delete",
                  variant: "destructive" as const,
                  disabled: deleteFile.isPending,
                  onPress: handleDeleteFromOptions,
                  testID: `dialog-action-voice-note-delete-${file.id}`,
                },
              ]),
        ]}
      >
        <View
          className="gap-2 rounded-md bg-muted/40 p-3"
          testID={`voice-note-options-meta-${file.id}`}
        >
          {voiceTitle ? (
            <Pressable
              onPress={() => handleCopyValue(voiceTitle, "Title copied")}
              accessibilityRole="button"
              accessibilityLabel="Copy title"
              testID={`voice-note-options-title-${file.id}`}
            >
              <Text
                className="text-base font-semibold text-foreground"
                numberOfLines={2}
              >
                {voiceTitle}
              </Text>
            </Pressable>
          ) : null}
          {voiceSummary ? (
            <MetaRow
              label="Summary"
              value={voiceSummary}
              onPress={() => handleCopyValue(voiceSummary, "Summary copied")}
              accessibilityLabel="Copy summary"
              testID={`voice-note-options-summary-${file.id}`}
            />
          ) : null}
          <MetaRow
            label="Author"
            value={authorName ?? "Unknown author"}
            onPress={
              authorName
                ? () => handleCopyValue(authorName, "Author copied")
                : undefined
            }
            accessibilityLabel={authorName ? "Copy author" : undefined}
            testID={`voice-note-options-author-${file.id}`}
          />
          <MetaRow
            label="ID"
            value={file.id}
            onPress={() => handleCopyValue(file.id, "Note id copied")}
            accessibilityLabel="Copy id"
            testID={`voice-note-options-id-${file.id}`}
          />
          <MetaRow
            label="Recorded"
            value={formatCapturedAt(headerTimestamp) || "—"}
          />
          <MetaRow
            label="Duration"
            value={durationMs > 0 ? formatDuration(durationMs) : "—"}
          />
          {file.mime_type ? (
            <MetaRow label="Format" value={file.mime_type} />
          ) : null}
          {typeof file.size_bytes === "number" && file.size_bytes > 0 ? (
            <MetaRow label="Size" value={formatBytes(file.size_bytes)} />
          ) : null}
          <Text className="mt-1 text-[10px] italic text-muted-foreground">
            Tap a row to copy.
          </Text>
        </View>
        {shareError ? (
          <Text
            className="mt-2 text-xs text-danger-foreground"
            selectable
            testID={`voice-note-options-error-${file.id}`}
          >
            {shareError}
          </Text>
        ) : null}
      </AppDialogSheet>
      <AppDialogSheet
        visible={isTranscriptDialogVisible}
        title="Transcript"
        onClose={() => setIsTranscriptDialogVisible(false)}
        actions={[
          {
            label: "Copy transcript",
            variant: "secondary",
            disabled: !transcription,
            onPress: () => {
              handleCopyValue(transcription, "Transcript copied");
              setIsTranscriptDialogVisible(false);
            },
            testID: `dialog-action-voice-note-transcript-copy-${file.id}`,
          },
          {
            label: "Close",
            variant: "quiet",
            onPress: () => setIsTranscriptDialogVisible(false),
            testID: `dialog-action-voice-note-transcript-close-${file.id}`,
          },
        ]}
      >
        <View
          className="max-h-[60vh] rounded-md bg-muted/40 p-3"
          testID={`voice-note-transcript-modal-${file.id}`}
        >
          <ScrollView showsVerticalScrollIndicator>
            <Text className="text-sm text-foreground" selectable>
              {transcription || "(no transcription yet)"}
            </Text>
          </ScrollView>
        </View>
      </AppDialogSheet>
    </Card>
  );
}

function MetaRow({
  label,
  value,
  selectable,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  value: string;
  selectable?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const content = (
    <View className="flex-row gap-2">
      <Text className="w-20 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      <Text
        className="flex-1 text-xs text-foreground"
        selectable={selectable}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

===== FILE: apps/mobile-old/components/voice-notes/VoiceNoteList.tsx =====
import { View, Text } from "react-native";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { VoiceNoteCard } from "./VoiceNoteCard";

interface VoiceNoteListProps {
  projectId: string;
  readOnly?: boolean;
}

/** All voice notes for a project. */
export function VoiceNoteList({ projectId, readOnly }: VoiceNoteListProps) {
  const { data, isLoading, error } = useProjectFiles({
    projectId,
    category: "voice-note",
  });

  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading voice notes…</Text>
    );
  }
  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load voice notes: {error.message}
      </Text>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <View className="gap-2" testID="voice-note-list">
      {data.map((file) => (
        <VoiceNoteCard key={file.id} file={file} readOnly={readOnly} />
      ))}
    </View>
  );
}

===== FILE: apps/mobile-old/components/notes/NoteTimeline.tsx =====
import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { AlertCircle, Mic } from "lucide-react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { VoiceNoteCard } from "@/components/voice-notes/VoiceNoteCard";
import { FileCard } from "@/components/files/FileCard";
import { TextNoteCard } from "@/components/notes/TextNoteCard";
import type {
  TimelineItem,
  PendingPhotoItem,
  PendingVoiceItem,
} from "@/hooks/useNoteTimeline";
import type { FileMetadataRow } from "@/lib/file-upload";
import { colors } from "@/lib/design-tokens/colors";
import { formatCapturedAt } from "@/lib/format-date";

const TIMELINE_ROW_LAYOUT = LinearTransition.duration(180);
const TIMELINE_ROW_ENTRY = FadeInDown.duration(140);

interface NoteTimelineProps {
  timeline: readonly TimelineItem[];
  isLoading?: boolean;
  error?: Error | null;
  onRemoveNote?: (sourceIndex: number) => void;
  onOpenFile?: (file: FileMetadataRow) => void;
  /** Transcripts keyed by `file_metadata.id` for voice notes. Looked up
   *  by `VoiceNoteCard` to render the transcribed body beneath each
   *  voice-note row. */
  transcriptionsByFileId?: ReadonlyMap<string, string>;
  /** Voice-note file ids whose transcript is still being generated. */
  transcribingFileIds?: ReadonlySet<string>;
  /** Map of user_id → display name, used to show the author on voice notes. */
  memberNames?: ReadonlyMap<string, string>;
  /** Map of `file_metadata.id` → the linked `report_notes.created_at`,
   *  used as the visible timestamp on voice + photo cards. Falls back
   *  to `file.created_at` when missing. */
  noteCreatedAtByFileId?: ReadonlyMap<string, string>;
  /** Map of `file_metadata.id` → `report_notes.author_id`, used to look
   *  up the photo card's author display name from `memberNames`. */
  noteAuthorByFileId?: ReadonlyMap<string, string>;
  readOnly?: boolean;
  /** Retry handler for a failed pending photo upload. */
  onRetryPendingPhoto?: (localId: string) => void;
  /** Discard handler for a pending photo (failed or in-flight). */
  onDiscardPendingPhoto?: (localId: string) => void;
  /** Retry handler for a failed pending voice note (upload or transcription). */
  onRetryPendingVoice?: (localId: string) => void;
  /** Discard handler for a pending voice note. */
  onDiscardPendingVoice?: (localId: string) => void;
}

/**
 * Renders a chronologically-sorted list of text notes, voice notes, photos,
 * and documents as a single interleaved timeline.
 */
export function NoteTimeline({
  timeline,
  isLoading,
  error,
  onRemoveNote,
  onOpenFile,
  transcriptionsByFileId,
  transcribingFileIds,
  memberNames,
  noteCreatedAtByFileId,
  noteAuthorByFileId,
  readOnly,
  onRetryPendingPhoto,
  onDiscardPendingPhoto,
  onRetryPendingVoice,
  onDiscardPendingVoice,
}: NoteTimelineProps) {
  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading…</Text>
    );
  }

  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load notes: {error.message}
      </Text>
    );
  }

  if (timeline.length === 0) return null;

  return (
    <View className="gap-2" testID="note-timeline">
      {timeline.map((item) => {
        if (item.kind === "file") {
          if (item.file.category === "voice-note") {
            // When this file row originated as an optimistic pending
            // voice note, key by the pending entry's localId so the
            // outer Animated.View is the same instance that wrapped the
            // PendingVoiceCard moments earlier. The inner card type
            // still changes (PendingVoiceCard → VoiceNoteCard), but the
            // wrapping row no longer unmounts — the layout transition
            // smoothly resizes it instead of dropping + re-inserting.
            const voiceKey = `voice-${item.voiceStableKey ?? item.file.id}`;
            return (
              <Animated.View
                key={voiceKey}
                layout={TIMELINE_ROW_LAYOUT}
                entering={TIMELINE_ROW_ENTRY}
              >
                <VoiceNoteCard
                  file={item.file}
                  transcription={transcriptionsByFileId?.get(item.file.id) ?? null}
                  isTranscribing={transcribingFileIds?.has(item.file.id) ?? false}
                  authorName={memberNames?.get(item.file.uploaded_by) ?? null}
                  capturedAt={noteCreatedAtByFileId?.get(item.file.id) ?? null}
                  readOnly={readOnly}
                />
              </Animated.View>
            );
          }
          return (
            <Animated.View
              key={
                item.photoStableKey
                  ? `photo-${item.photoStableKey}`
                  : `file-${item.file.id}`
              }
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <FileCard
                file={item.file}
                onOpen={onOpenFile}
                authorName={
                  noteAuthorByFileId?.get(item.file.id)
                    ? (memberNames?.get(
                        noteAuthorByFileId.get(item.file.id) as string,
                      ) ?? null)
                    : (memberNames?.get(item.file.uploaded_by) ?? null)
                }
                capturedAt={noteCreatedAtByFileId?.get(item.file.id) ?? null}
                readOnly={readOnly}
              />
            </Animated.View>
          );
        }

        if (item.kind === "pending-photo") {
          // Same key scheme as the post-upload photo file row above
          // (`photo-${localId}`) so the swap from PendingMediaCard →
          // FileCard reuses this Animated.View instance and the row
          // morphs in place instead of unmounting + remounting (which
          // would visibly shift everything below it). The inner
          // testID `pending-photo-${localId}` is preserved for Maestro.
          return (
            <Animated.View
              key={`photo-${item.pending.localId}`}
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <PendingMediaCard
                kind="photo"
                pending={item.pending}
                onRetry={onRetryPendingPhoto}
                onDiscard={onDiscardPendingPhoto}
              />
            </Animated.View>
          );
        }

        if (item.kind === "pending-voice") {
          // Key by the same `voice-${localId}` scheme used for the
          // post-upload file row above so the swap reuses this
          // Animated.View instance and the row morphs in place.
          return (
            <Animated.View
              key={`voice-${item.pending.localId}`}
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <PendingMediaCard
                kind="voice"
                pending={item.pending}
                onRetry={onRetryPendingVoice}
                onDiscard={onDiscardPendingVoice}
              />
            </Animated.View>
          );
        }

        // Text note
        const authorName = getTextNoteAuthorName(item.entry.authorId, memberNames);
        return (
          <Animated.View
            key={`note-${item.entry.id ?? item.sourceIndex}`}
            layout={TIMELINE_ROW_LAYOUT}
            entering={TIMELINE_ROW_ENTRY}
          >
            <TextNoteCard
              entry={item.entry}
              sourceIndex={item.sourceIndex}
              authorName={authorName}
              readOnly={readOnly}
              onRemove={onRemoveNote}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Optimistic media card shown while a photo or voice note is uploading
 * (and, for voice, being transcribed). Renders identical chrome for both
 * media kinds — only the leading thumbnail and status copy differ. On
 * failure the card dims, shows a destructive status line, and surfaces
 * inline Retry / Discard actions anchored to this row.
 *
 * Note: this is intentionally separate from the "ready" `FileCard` /
 * `VoiceNoteCard` — those carry full file metadata, signed-URL fetching,
 * delete dialogs, audio playback, and transcript / summarize logic. The
 * pending card is a lightweight placeholder used only until upload
 * completes; merging the two would require branching all of that
 * machinery on a `pending` flag and would balloon both files.
 */
function PendingMediaCard(
  props:
    | {
        kind: "photo";
        pending: PendingPhotoItem;
        onRetry?: (localId: string) => void;
        onDiscard?: (localId: string) => void;
      }
    | {
        kind: "voice";
        pending: PendingVoiceItem;
        onRetry?: (localId: string) => void;
        onDiscard?: (localId: string) => void;
      },
) {
  const { kind, pending, onRetry, onDiscard } = props;
  const failed = pending.status === "failed";
  const isPhoto = kind === "photo";
  const labelNoun = isPhoto ? "photo" : "voice note";
  const testIDPrefix = isPhoto ? "pending-photo" : "pending-voice";

  const statusLabel = isPhoto
    ? failed
      ? "Upload failed"
      : "Uploading…"
    : pending.status === "uploading"
      ? "Uploading audio…"
      : pending.status === "transcribing"
        ? "Transcribing…"
        : "Voice note failed";

  return (
    <View
      testID={`${testIDPrefix}-${pending.localId}`}
      className={
        "gap-2 rounded-lg border bg-card p-3 " +
        (failed ? "border-danger-border" : "border-border")
      }
      style={failed ? { opacity: 0.6 } : undefined}
    >
      <Text className="text-[10px] text-muted-foreground">
        {formatCapturedAt(pending.addedAt)}
      </Text>
      <View className="flex-row items-start gap-3">
        {isPhoto ? (
          <Image
            source={{ uri: pending.thumbnailUri }}
            style={{ width: 64, height: 64, borderRadius: 6 }}
            accessibilityLabel="Uploading photo"
          />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-md bg-secondary">
            <Mic size={18} color={colors.muted.foreground} />
          </View>
        )}
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            {failed ? (
              <AlertCircle size={14} color={colors.danger.DEFAULT} />
            ) : (
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            )}
            <Text
              className={
                failed
                  ? "text-xs font-medium text-danger-foreground"
                  : "text-xs text-muted-foreground"
              }
            >
              {statusLabel}
            </Text>
          </View>
          {!isPhoto && pending.durationMs != null && (
            <Text className="text-[11px] text-muted-foreground">
              {formatDurationMs(pending.durationMs)}
            </Text>
          )}
          {failed && pending.error ? (
            <Text
              className="text-[11px] text-muted-foreground"
              numberOfLines={2}
              selectable
            >
              {pending.error}
            </Text>
          ) : null}
        </View>
      </View>
      {failed && (onRetry || onDiscard) && (
        <View className="flex-row justify-end gap-2 pt-1">
          {onDiscard && (
            <Pressable
              onPress={() => onDiscard(pending.localId)}
              hitSlop={6}
              className="h-7 items-center justify-center rounded-md px-3"
              accessibilityLabel={`Discard ${labelNoun}`}
              testID={`${testIDPrefix}-discard-${pending.localId}`}
            >
              <Text className="text-xs font-medium text-muted-foreground">
                Discard
              </Text>
            </Pressable>
          )}
          {onRetry && (
            <Pressable
              onPress={() => onRetry(pending.localId)}
              hitSlop={6}
              className="h-7 items-center justify-center rounded-md bg-secondary px-3"
              accessibilityLabel={
                isPhoto ? "Retry photo upload" : "Retry voice note"
              }
              testID={`${testIDPrefix}-retry-${pending.localId}`}
            >
              <Text className="text-xs font-semibold text-foreground">
                Retry
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function formatDurationMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTextNoteAuthorName(
  authorId: string | undefined,
  memberNames: ReadonlyMap<string, string> | undefined,
): string {
  if (!authorId) return "Unknown author";
  return memberNames?.get(authorId) ?? authorId;
}

===== FILE: apps/mobile-old/app/projects/[projectId]/reports/generate.tsx =====
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DeleteDraftButton } from "@/components/reports/DeleteDraftButton";
import {
  GenerateReportProvider,
  useGenerateReport,
} from "@/components/reports/generate/GenerateReportProvider";
import { GenerateReportActionRow } from "@/components/reports/generate/GenerateReportActionRow";
import { GenerateReportTabBar } from "@/components/reports/generate/GenerateReportTabBar";
import { NotesTabPane } from "@/components/reports/generate/NotesTabPane";
import { ReportTabPane } from "@/components/reports/generate/ReportTabPane";
import { EditTabPane } from "@/components/reports/generate/EditTabPane";
import { DebugTabPane } from "@/components/reports/generate/DebugTabPane";
import { GenerateReportInputBar } from "@/components/reports/generate/GenerateReportInputBar";
import { GenerateReportDialogs } from "@/components/reports/generate/GenerateReportDialogs";

export default function GenerateReportScreen() {
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId?: string;
  }>();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <GenerateReportProvider projectId={projectId!} reportId={reportId}>
          <GenerateReportLayout />
        </GenerateReportProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Inner body — split out so it can `useGenerateReport()` from inside the
 * provider. Pure layout: header, tab bar, horizontal pager of panes,
 * bottom input bar, and the dialog stack. All state lives in the
 * provider; panes pull what they need themselves.
 */
function GenerateReportLayout() {
  const {
    reportId,
    generation,
    draft,
    menuActions,
    refs,
    tabs,
  } = useGenerateReport();

  const headerTitle =
    generation.report?.report?.meta?.title?.trim() || "New Report";

  return (
    <>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title={headerTitle}
          onBack={draft.handleBack}
          backLabel="Reports"
          trailing={
            reportId ? (
              <DeleteDraftButton
                isDeleting={draft.isDeletingDraft}
                onConfirmDelete={() => draft.deleteDraft()}
                extraActions={menuActions}
              />
            ) : null
          }
        />
      </View>

      <GenerateReportActionRow />

      <GenerateReportTabBar />

      <ScrollView
        ref={refs.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={tabs.onPagerScrollBeginDrag}
        onMomentumScrollEnd={tabs.onPagerMomentumEnd}
        contentOffset={{ x: tabs.windowWidth, y: 0 }}
        className="flex-1"
        // Disable parent's horizontal pan from intercepting taps inside
        // children (e.g. note rows, buttons) on Android.
        nestedScrollEnabled
      >
        <NotesTabPane ref={refs.notesScroll} width={tabs.windowWidth} />
        <ReportTabPane ref={refs.reportScroll} width={tabs.windowWidth} />
        <EditTabPane width={tabs.windowWidth} />
        <DebugTabPane width={tabs.windowWidth} />
      </ScrollView>

      <GenerateReportInputBar />

      <GenerateReportDialogs />
    </>
  );
}

===== FILE: apps/mobile-old/app/projects/[projectId]/reports/[reportId].tsx =====
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { ReportDetailSkeleton } from "@/components/skeletons/ReportDetailSkeleton";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ReportView } from "@/components/reports/ReportView";
import { ReportEditForm } from "@/components/reports/ReportEditForm";
import { PdfPreviewModal } from "@/components/reports/PdfPreviewModal";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { ReportDetailHeader } from "@/components/reports/detail/ReportDetailHeader";
import {
  ReportDetailTabBar,
  type ReportDetailTab,
} from "@/components/reports/detail/ReportDetailTabBar";
import { ReportNotesPane } from "@/components/reports/detail/ReportNotesPane";
import { ReportActionsMenu } from "@/components/reports/detail/ReportActionsMenu";
import { SavedReportSheet } from "@/components/reports/detail/SavedReportSheet";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReportNotes } from "@/hooks/useLocalReportNotes";
import { useLocalReport } from "@/hooks/useLocalReports";
import { useReportAutoSave } from "@/hooks/useReportAutoSave";
import { useRefresh } from "@/hooks/useRefresh";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { useReportPdfActions } from "@/hooks/useReportPdfActions";
import { useReportDelete } from "@/hooks/useReportDelete";
import { type FileMetadataRow } from "@/lib/file-upload";

export default function ReportDetailScreen() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    file: FileMetadataRow;
  } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  const params = useLocalSearchParams<{
    projectId?: string | string[];
    reportId?: string | string[];
  }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const reportId = typeof params.reportId === "string" ? params.reportId : "";
  const hasValidRouteParams = projectId.length > 0 && reportId.length > 0;

  const { data: project } = useLocalProject(hasValidRouteParams ? projectId : null);
  const { data: rawReport, isLoading, error, refetch } = useLocalReport(
    hasValidRouteParams ? reportId : null,
  );
  const { data: noteRows } = useLocalReportNotes(hasValidRouteParams ? reportId : null);

  const { refreshing, onRefresh } = useRefresh([refetch]);

  const reportData = (() => {
    if (!rawReport) return undefined;
    const parsed = normalizeGeneratedReportPayload(rawReport.report_data);
    if (!parsed) return undefined;
    return { report: parsed };
  })();

  const report = reportData?.report;
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(null);
  const [activeTab, setActiveTab] = useState<ReportDetailTab>("report");

  // Sync localReport from the parsed saved report. Refetches (incl.
  // pull-to-refresh) adopt the new server snapshot ONLY when the user has
  // no unsaved local edits — i.e. localReport still matches the previously
  // observed server snapshot. Edits in flight are preserved; autosave is
  // the writer that eventually reconciles them.
  const lastServerJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!report) return;
    const nextJson = JSON.stringify(report);
    if (!localReport) {
      setLocalReport(report);
      lastServerJsonRef.current = nextJson;
      return;
    }
    if (
      lastServerJsonRef.current !== null &&
      JSON.stringify(localReport) === lastServerJsonRef.current
    ) {
      setLocalReport(report);
    }
    lastServerJsonRef.current = nextJson;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const { isSaving: isAutoSaving, lastSavedAt } = useReportAutoSave({
    reportId: hasValidRouteParams ? reportId : null,
    projectId,
    report: localReport,
  });

  const displayReport = localReport ?? report ?? null;
  // Count of source-note rows (text + voice + linked files) used as the
  // badge on the Notes tab so the user can see at a glance how many
  // inputs the report was built from.
  const notesCount = (noteRows ?? []).length;

  const {
    isDeleting,
    reportDialogSheet,
    setReportDialogSheet,
    deleteReport,
    confirmDelete,
    closeReportDialogSheet,
    canDismissReportDialogSheet,
  } = useReportDelete({ projectId, reportId });

  const {
    isExporting,
    isOpeningSavedPdf,
    isSharingSavedPdf,
    isSaving,
    savedReportSheet,
    savedReportSheetError,
    savedReportDetails,
    closeSavedReportSheet,
    handleSavePdf,
    handleOpenSavedPdf,
    handleShareSavedPdf,
    handleSharePdf,
  } = useReportPdfActions({
    displayReport,
    siteName: project?.name ?? null,
    onExportError: setReportDialogSheet,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="px-5 pt-4 pb-2">
          <ScreenHeader
            title="Report"
            onBack={() => router.back()}
            backLabel="Reports"
          />
        </View>
        <ReportDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!hasValidRouteParams) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Invalid report link
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            This report URL is missing the project or report id.
          </Text>
          <Button
            variant="secondary"
            size="default"
            className="mt-4"
            onPress={() => router.replace("/(tabs)/projects")}
          >
            Back to Projects
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !displayReport) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Failed to load report
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            {error instanceof Error ? error.message : "Report data is unavailable."}
          </Text>
          <Button
            variant="secondary"
            size="default"
            className="mt-4"
            onPress={() => refetch()}
          >
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ReportDetailHeader
          report={displayReport}
          onBack={() => router.back()}
          onOpenActions={() => setMenuVisible(true)}
          actionsDisabled={isSaving || isExporting || isDeleting}
        />

        <ReportDetailTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          notesCount={notesCount}
        />

        {activeTab === "edit" ? (
          <View className="flex-row items-center justify-between px-5 pt-1 pb-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Edit report
            </Text>
            <Text className="text-xs text-muted-foreground" testID="edit-autosave-status">
              {isAutoSaving ? "Saving…" : lastSavedAt ? "Saved" : ""}
            </Text>
          </View>
        ) : null}

        {activeTab === "report" ? (
          <Animated.View entering={FadeIn.duration(250)} className="px-5">
            <ReportView report={displayReport} />
          </Animated.View>
        ) : activeTab === "edit" ? (
          <View className="px-5">
            <ReportEditForm report={displayReport} onChange={setLocalReport} />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)}>
            <ReportNotesPane
              projectId={projectId}
              reportId={reportId}
              reportCreatedAt={rawReport?.created_at ?? null}
              noteRows={noteRows}
              onOpenFile={(file) => {
                if (file.mime_type.startsWith("image/")) {
                  setImagePreview({ file });
                }
              }}
            />
          </Animated.View>
        )}
      </ScrollView>

      <ReportActionsMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onViewPdf={() => {
          setMenuVisible(false);
          setPdfPreviewVisible(true);
        }}
        onSavePdf={async () => {
          setMenuVisible(false);
          await handleSavePdf();
        }}
        onSharePdf={async () => {
          setMenuVisible(false);
          await handleSharePdf();
        }}
        onDelete={() => {
          setMenuVisible(false);
          confirmDelete();
        }}
        isSaving={isSaving}
        isExporting={isExporting}
        isDeleting={isDeleting}
      />

      <AppDialogSheet
        visible={reportDialogSheet !== null}
        title={reportDialogSheet?.title ?? "Report Action"}
        message={reportDialogSheet?.message ?? ""}
        noticeTone={reportDialogSheet?.tone ?? "danger"}
        noticeTitle={reportDialogSheet?.noticeTitle}
        onClose={closeReportDialogSheet}
        canDismiss={canDismissReportDialogSheet}
        actions={
          reportDialogSheet?.kind === "confirm-delete"
            ? [
                {
                  label: isDeleting ? "Deleting..." : reportDialogSheet.confirmLabel,
                  variant: reportDialogSheet.confirmVariant,
                  onPress: () => deleteReport(),
                  disabled: isDeleting,
                  accessibilityLabel: "Confirm delete report",
                  align: "start",
                },
                {
                  label: reportDialogSheet.cancelLabel ?? "Cancel",
                  variant: "quiet",
                  onPress: closeReportDialogSheet,
                  disabled: isDeleting,
                  accessibilityLabel: "Cancel delete report",
                },
              ]
            : reportDialogSheet
              ? [
                  {
                    label: reportDialogSheet.confirmLabel,
                    variant: reportDialogSheet.confirmVariant,
                    onPress: closeReportDialogSheet,
                    accessibilityLabel: "Dismiss report action dialog",
                  },
                ]
              : []
        }
      />

      <PdfPreviewModal
        visible={pdfPreviewVisible}
        report={displayReport}
        siteName={project?.name ?? null}
        onClose={() => setPdfPreviewVisible(false)}
      />

      <ImagePreviewModal
        visible={imagePreview !== null}
        title={imagePreview?.file.filename}
        onClose={() => setImagePreview(null)}
        {...imagePreviewExtras}
      />

      <SavedReportSheet
        state={savedReportSheet}
        details={savedReportDetails}
        errorMessage={savedReportSheetError}
        isOpening={isOpeningSavedPdf}
        isSharing={isSharingSavedPdf}
        onClose={closeSavedReportSheet}
        onOpen={handleOpenSavedPdf}
        onShare={handleShareSavedPdf}
        onRetrySave={() => {
          closeSavedReportSheet();
          void handleSavePdf();
        }}
      />
    </SafeAreaView>
  );
}

===== FILE: apps/mobile-old/app/projects/[projectId]/index.tsx =====
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ProjectOverviewSkeleton } from "@/components/skeletons/ProjectOverviewSkeleton";
import { colors } from "@/lib/design-tokens/colors";
import {
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  FolderOpen,
  HardHat,
  MapPin,
  Pencil,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReports } from "@/hooks/useLocalReports";
import { useRefresh } from "@/hooks/useRefresh";
import type { ProjectReportListItem } from "@/lib/project-reports-list";
import {
  computeProjectOverviewStats,
  formatRelativeTime,
} from "@/lib/project-overview";

interface OverviewAction {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  onPress?: () => void;
  comingSoon?: boolean;
  testID?: string;
}

export default function ProjectOverviewScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { copy, isCopied } = useCopyToClipboard();

  const { data: project, isLoading: isLoadingProject, refetch: refetchProject } = useLocalProject(projectId);

  const { data: reports = [], isLoading: isLoadingReports, refetch: refetchReports } =
    useLocalReports(projectId) as {
      data: ProjectReportListItem[];
      isLoading: boolean;
      refetch: () => Promise<unknown>;
    };

  const { refreshing, onRefresh } = useRefresh([refetchProject, refetchReports]);

  const stats = computeProjectOverviewStats(reports);
  const lastReportRelative = formatRelativeTime(stats.lastReportAt);

  const actions: OverviewAction[] = [
    {
      key: "reports",
      title: "Reports",
      description:
        stats.totalReports === 0
          ? "No reports yet"
          : `${stats.totalReports} report${stats.totalReports === 1 ? "" : "s"} · Last ${lastReportRelative.toLowerCase()}`,
      icon: ClipboardList,
      onPress: () => router.push(`/projects/${projectId}/reports`),
      testID: "btn-open-reports",
    },
    {
      key: "documents",
      title: "Documents",
      description: "Drawings, permits, contracts",
      icon: FolderOpen,
      comingSoon: true,
    },
    {
      key: "materials-equipment",
      title: "Materials & Equipment",
      description: "Track materials, tools, and machinery",
      icon: HardHat,
      comingSoon: true,
    },
    {
      key: "members",
      title: "Members",
      description: "Invite teammates to this project",
      icon: Users,
      onPress: () => router.push(`/projects/${projectId}/members`),
      testID: "btn-open-members",
    },
  ];

  const isLoading = isLoadingProject || isLoadingReports;
  const siteName = project?.name?.trim() || "Project";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-3">
        <ScreenHeader
          title={siteName}
          onBack={() => router.back()}
          backLabel="Projects"
        />
      </View>

      {isLoading ? (
        <ProjectOverviewSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="flex-row items-center justify-between gap-3">
            {(project?.client_name || project?.address) ? (
              <View className="min-w-0 flex-1 gap-1">
                {project.client_name ? (
                  <Pressable
                    onPress={() =>
                      copy(project.client_name, {
                        key: "client",
                        toast: "Client copied",
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Copy client: ${project.client_name}`}
                    testID="btn-copy-client"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <Text className="flex-1 text-body font-medium text-foreground">
                      {project.client_name}
                    </Text>
                    {isCopied("client") ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
                ) : null}
                {project.address ? (
                  <Pressable
                    onPress={() =>
                      copy(project.address, {
                        key: "address",
                        toast: "Address copied",
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Copy address: ${project.address}`}
                    testID="btn-copy-address"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <MapPin size={14} color={colors.muted.foreground} />
                    <Text className="flex-1 text-body text-muted-foreground">
                      {project.address}
                    </Text>
                    {isCopied("address") ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.push(`/projects/${projectId}/edit`)}
              className="shrink-0 flex-row items-center gap-1.5"
              accessibilityLabel="Edit project details"
              testID="btn-edit-project"
            >
              <Pencil size={14} color={colors.foreground} />
              <Text className="text-sm font-semibold text-foreground">Edit</Text>
            </Button>
          </View>

          <View className="flex-row gap-3">
            <StatTile
              value={stats.totalReports}
              label="Total reports"
            />
            <StatTile
              value={stats.draftReports}
              label="Drafts"
              tone={stats.draftReports > 0 ? "warning" : "default"}
            />
          </View>

          <Card variant="muted" padding="md" className="gap-1">
            <Text className="text-label text-muted-foreground">Last report</Text>
            <Text className="text-title-sm text-foreground">{lastReportRelative}</Text>
          </Card>

          <View className="gap-3">
            {actions.map((action, index) => {
              const Icon = action.icon;
              const isDisabled = action.comingSoon || !action.onPress;
              return (
                <View
                  key={action.key}
                >
                  <Pressable
                    onPress={action.onPress}
                    disabled={isDisabled}
                    testID={action.testID}
                    accessibilityRole="button"
                    accessibilityLabel={action.title}
                    accessibilityState={{ disabled: isDisabled }}
                  >
                    <Card
                      variant={action.comingSoon ? "muted" : "default"}
                      padding="md"
                      className="flex-row items-center gap-3"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                        <Icon size={20} color={colors.muted.foreground} />
                      </View>
                      <View className="min-w-0 flex-1 gap-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-lg font-semibold text-foreground">
                            {action.title}
                          </Text>
                          {action.comingSoon ? (
                            <View className="rounded-md border border-border bg-card px-2 py-0.5">
                              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                                Soon
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm text-muted-foreground">
                          {action.description}
                        </Text>
                      </View>
                      {!isDisabled ? (
                        <ChevronRight size={18} color={colors.muted.foreground} />
                      ) : null}
                    </Card>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

===== FILE: apps/mobile-old/app/(camera)/capture.tsx =====
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraType,
  type FlashMode,
} from "expo-camera";
import { File } from "expo-file-system";
import {
  Camera as CameraIcon,
  RefreshCw,
  X,
  Zap,
  ZapOff,
} from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { commitCameraSession } from "@/lib/camera-session-registry";
import { colors } from "@/lib/design-tokens/colors";

const MAX_BURST = 20;

interface Capture {
  uri: string;
  width: number;
  height: number;
}

/**
 * Full-screen burst capture modal. UI per docs/10-media-pipeline.md §B.
 *
 * The screen owns no upload logic — its single output is a `string[]` of
 * local file URIs, posted back to the caller via `commitCameraSession`.
 * That keeps the screen reusable from any caller (report, avatar, …)
 * without coupling it to project/report ids.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const handleCapture = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;
    if (captures.length >= MAX_BURST) return;
    setIsCapturing(true);
    try {
      const photo: CameraCapturedPicture | undefined =
        await cameraRef.current.takePictureAsync({
          quality: 0.9,
          skipProcessing: false,
          exif: false,
          imageType: "jpg",
        });
      if (photo?.uri) {
        setCaptures((prev) => [
          ...prev,
          { uri: photo.uri, width: photo.width, height: photo.height },
        ]);
      }
    } catch {
      // Swallow — a single bad shot shouldn't kill the screen. The user
      // can simply press the shutter again.
    } finally {
      setIsCapturing(false);
    }
  }, [captures.length, isCapturing]);

  const handleRemove = useCallback((uri: string) => {
    setCaptures((prev) => prev.filter((c) => c.uri !== uri));
    // Best-effort cache cleanup; ignore errors (file may already be gone
    // or live outside our managed cache root on some platforms).
    try {
      new File(uri).delete();
    } catch {
      // ignore
    }
  }, []);

  const handleDone = useCallback(() => {
    if (sessionId) {
      commitCameraSession(
        sessionId,
        captures.map((c) => c.uri),
      );
    }
    router.back();
  }, [captures, router, sessionId]);

  const discardAndClose = useCallback(() => {
    for (const c of captures) {
      try {
        new File(c.uri).delete();
      } catch {
        // ignore
      }
    }
    setConfirmDiscardOpen(false);
    router.back();
  }, [captures, router]);

  const handleCancel = useCallback(() => {
    if (captures.length > 0) {
      setConfirmDiscardOpen(true);
      return;
    }
    router.back();
  }, [captures.length, router]);

  // ── Permission gates ────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain;
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <View style={styles.permissionInner}>
          <CameraIcon size={48} color="#ffffff" />
          <Text style={styles.permissionTitle}>Camera access is off</Text>
          <Text style={styles.permissionBody}>
            Allow camera access to capture site photos for your reports.
          </Text>
          <View style={styles.permissionActions}>
            <Button
              testID="btn-camera-permission-action"
              onPress={() =>
                canAskAgain ? requestPermission() : Linking.openSettings()
              }
            >
              {canAskAgain ? "Allow camera" : "Open Settings"}
            </Button>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.permissionCancel}
              testID="btn-camera-permission-cancel"
            >
              <Text style={styles.permissionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera UI ───────────────────────────────────────────────────────

  const flashIcon =
    flash === "off" ? (
      <ZapOff size={22} color="#ffffff" />
    ) : (
      <Zap size={22} color={flash === "on" ? colors.accent.DEFAULT : "#ffffff"} />
    );
  const nextFlash: FlashMode =
    flash === "off" ? "auto" : flash === "auto" ? "on" : "off";

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mode="picture"
        pictureSize="1920x1080"
        responsiveOrientationWhenOrientationLocked={false}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            testID="btn-camera-cancel"
            style={styles.iconButton}
          >
            <X size={24} color="#ffffff" />
          </Pressable>
          <Pressable
            onPress={() => setFlash(nextFlash)}
            accessibilityRole="button"
            accessibilityLabel={`Flash ${flash}`}
            testID="btn-camera-flash"
            style={styles.iconButton}
          >
            {flashIcon}
            <Text style={styles.flashLabel}>{flash}</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />

        {/* Thumbnail strip + flip */}
        <View style={styles.stripRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripContent}
            style={styles.strip}
          >
            {captures.map((c, idx) => (
              <Pressable
                key={c.uri}
                onPress={() => handleRemove(c.uri)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}
                testID={`btn-camera-thumb-${idx}`}
                style={styles.thumbWrap}
              >
                <Image source={{ uri: c.uri }} style={styles.thumb} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            testID="btn-camera-flip"
            style={[styles.iconButton, styles.flipButton]}
          >
            <RefreshCw size={22} color="#ffffff" />
          </Pressable>
        </View>

        {/* Shutter */}
        <View style={styles.shutterRow}>
          <Pressable
            onPress={handleCapture}
            disabled={isCapturing || captures.length >= MAX_BURST}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            testID="btn-camera-shutter"
            style={({ pressed }) => [
              styles.shutter,
              (pressed || isCapturing) && styles.shutterPressed,
              captures.length >= MAX_BURST && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>

        {/* Bottom action bar */}
        <View style={styles.bottomBar}>
          <Text style={styles.countLabel} testID="lbl-camera-count">
            {captures.length === 0
              ? "No photos"
              : `${captures.length} photo${captures.length === 1 ? "" : "s"}`}
            {captures.length >= MAX_BURST ? " (max)" : ""}
          </Text>
          <Button
            onPress={handleDone}
            disabled={captures.length === 0}
            testID="btn-camera-done"
          >
            Done
          </Button>
        </View>
      </SafeAreaView>

      <AppDialogSheet
        visible={confirmDiscardOpen}
        title="Discard photos?"
        message={`You have ${captures.length} unsaved photo${captures.length === 1 ? "" : "s"}.`}
        onClose={() => setConfirmDiscardOpen(false)}
        actions={[
          {
            label: "Keep editing",
            onPress: () => setConfirmDiscardOpen(false),
            variant: "secondary",
          },
          {
            label: "Discard",
            onPress: discardAndClose,
            variant: "destructive",
            testID: "btn-camera-confirm-discard",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  flashLabel: {
    color: "#ffffff",
    fontSize: 9,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  strip: { flexGrow: 0, flexShrink: 1 },
  stripContent: { gap: 6, alignItems: "center" },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  thumb: { width: "100%", height: "100%" },
  flipButton: { marginLeft: "auto" },
  shutterRow: { alignItems: "center", paddingVertical: 12 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ffffff",
  },
  shutterPressed: { opacity: 0.7 },
  shutterDisabled: { opacity: 0.4 },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  countLabel: { color: "#ffffff", fontSize: 14, fontWeight: "500" },
  permissionInner: { paddingHorizontal: 32, alignItems: "center", gap: 16 },
  permissionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  permissionBody: {
    color: "#d6d3cc",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 21,
  },
  permissionActions: { marginTop: 16, gap: 8, alignSelf: "stretch" },
  permissionCancel: { paddingVertical: 12, alignItems: "center" },
  permissionCancelText: { color: "#ffffff", fontSize: 15 },
});

===== FILE: apps/mobile-old/components/ui/UsageBarChart.tsx =====
import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import { cn } from "@/lib/utils";
import { colors } from "@/lib/design-tokens/colors";

export interface BarDatum {
  label: string;
  value: number;
}

interface UsageBarChartProps {
  data: BarDatum[];
  /** Formatted string shown below the chart title */
  unit?: string;
  className?: string;
}

const CHART_HEIGHT = 120;
const BAR_RADIUS = 4;
const BAR_COLOR = colors.chart.fill;
const BAR_COLOR_LIGHT = colors.chart.track;
const GRID_COLOR = colors.chart.grid;

export function UsageBarChart({ data, unit, className }: UsageBarChartProps) {
  if (!data.length) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // We want to show at most 6 months to keep labels readable
  const visible = data.slice(0, 6).reverse();
  const barCount = visible.length;
  const barGap = 8;
  const barWidth = Math.max(16, Math.min(36, (280 - barGap * (barCount - 1)) / barCount));
  const chartWidth = barCount * barWidth + (barCount - 1) * barGap;

  return (
    <View className={cn("items-center", className)}>
      <View style={{ width: chartWidth, height: CHART_HEIGHT }}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <Line
              key={frac}
              x1={0}
              y1={CHART_HEIGHT * (1 - frac)}
              x2={chartWidth}
              y2={CHART_HEIGHT * (1 - frac)}
              stroke={GRID_COLOR}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* Bars */}
          {visible.map((d, i) => {
            const barHeight = Math.max(2, (d.value / maxValue) * (CHART_HEIGHT - 4));
            const x = i * (barWidth + barGap);
            const y = CHART_HEIGHT - barHeight;

            return (
              <Rect
                key={d.label}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={d.value > 0 ? BAR_COLOR : BAR_COLOR_LIGHT}
              />
            );
          })}
        </Svg>
      </View>

      {/* Labels row */}
      <View
        style={{
          width: chartWidth,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        {visible.map((d, i) => (
          <Text
            key={d.label}
            style={{ width: barWidth, textAlign: "center" }}
            className="text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>

      {unit ? (
        <Text className="mt-1 text-xs text-muted-foreground">{unit}</Text>
      ) : null}
    </View>
  );
}

===== FILE: apps/mobile-old/lib/section-icons.ts =====
import {
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Eye,
  HardHat,
} from "lucide-react-native";

export const SECTION_ICONS: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Weather: Cloud,
  Manpower: Users,
  "Work Progress": TrendingUp,
  Progress: TrendingUp,
  "Site Conditions": HardHat,
  Observations: Eye,
  Issues: AlertTriangle,
  "Next Steps": ClipboardList,
};

===== FILE: apps/mobile-old/lib/report-helpers.ts =====
export {
  toTitleCase,
  formatDate,
  getWorkersLines,
  getWeatherLines,
  getIssueMeta,
  getItemMeta,
  getReportCompleteness,
} from "@harpa/report-core";

===== FILE: apps/mobile-old/hooks/useReportPdfActions.ts =====
import { useState } from "react";
import {
  exportReportPdf,
  getSavedReportDetails,
  openSavedReportPdf,
  saveReportPdf,
  shareSavedReportPdf,
} from "@/lib/export-report-pdf";
import {
  getActionErrorDialogCopy,
  type AppDialogCopy,
} from "@/lib/app-dialog-copy";
import type { GeneratedSiteReport } from "@/lib/generated-report";

export interface SavedReportSheetState {
  status: "generating" | "ready" | "error";
  locationDescription?: string;
  pdfUri?: string;
  reportTitle: string;
  errorMessage?: string;
}

interface UseReportPdfActionsArgs {
  displayReport: GeneratedSiteReport | null;
  siteName: string | null;
  onExportError: (copy: AppDialogCopy & { kind: "error" }) => void;
}

export function useReportPdfActions({
  displayReport,
  siteName,
  onExportError,
}: UseReportPdfActionsArgs) {
  const [isExporting, setIsExporting] = useState(false);
  const [isOpeningSavedPdf, setIsOpeningSavedPdf] = useState(false);
  const [isSharingSavedPdf, setIsSharingSavedPdf] = useState(false);
  const [savedReportSheet, setSavedReportSheet] =
    useState<SavedReportSheetState | null>(null);
  const [savedReportSheetError, setSavedReportSheetError] = useState<string | null>(
    null,
  );

  const isSaving = savedReportSheet?.status === "generating";

  const closeSavedReportSheet = () => {
    setSavedReportSheet(null);
    setSavedReportSheetError(null);
    setIsOpeningSavedPdf(false);
    setIsSharingSavedPdf(false);
  };

  const handleSavePdf = async () => {
    if (!displayReport) return;
    setSavedReportSheetError(null);

    setSavedReportSheet({
      status: "generating",
      reportTitle: displayReport.report.meta.title,
    });

    try {
      const result = await saveReportPdf(displayReport, { siteName });
      setSavedReportSheet({
        status: "ready",
        locationDescription:
          result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
        pdfUri: result.pdfUri,
        reportTitle: displayReport.report.meta.title,
      });
    } catch (e) {
      setSavedReportSheet({
        status: "error",
        reportTitle: displayReport.report.meta.title,
        errorMessage: e instanceof Error ? e.message : "Could not generate PDF.",
      });
    }
  };

  const handleOpenSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsOpeningSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await openSavedReportPdf(savedReportSheet.pdfUri);
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error ? error.message : "Could not open the saved PDF.",
      );
    } finally {
      setIsOpeningSavedPdf(false);
    }
  };

  const handleShareSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsSharingSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await shareSavedReportPdf({
        pdfUri: savedReportSheet.pdfUri,
        reportTitle: savedReportSheet.reportTitle,
      });
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error ? error.message : "Could not share the saved PDF.",
      );
    } finally {
      setIsSharingSavedPdf(false);
    }
  };

  const handleSharePdf = async () => {
    if (!displayReport) return;
    setIsExporting(true);
    setSavedReportSheetError(null);
    try {
      const result = await exportReportPdf(displayReport, { siteName });

      if (result.shareErrorMessage) {
        setSavedReportSheet({
          status: "ready",
          locationDescription:
            result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
          pdfUri: result.pdfUri,
          reportTitle: displayReport.report.meta.title,
        });
        setSavedReportSheetError(result.shareErrorMessage);
      }
    } catch (e) {
      onExportError({
        kind: "error",
        ...getActionErrorDialogCopy({
          title: "Export Failed",
          fallbackMessage: "Could not generate PDF.",
          message: e instanceof Error ? e.message : "Could not generate PDF.",
        }),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const savedReportDetails =
    savedReportSheet?.status === "ready" &&
    savedReportSheet.locationDescription &&
    savedReportSheet.pdfUri
      ? getSavedReportDetails({
          locationDescription: savedReportSheet.locationDescription,
          pdfUri: savedReportSheet.pdfUri,
        })
      : null;

  return {
    isExporting,
    isOpeningSavedPdf,
    isSharingSavedPdf,
    isSaving,
    savedReportSheet,
    savedReportSheetError,
    savedReportDetails,
    closeSavedReportSheet,
    handleSavePdf,
    handleOpenSavedPdf,
    handleShareSavedPdf,
    handleSharePdf,
  };
}

===== FILE: apps/mobile-old/hooks/useVoiceNotePlayer.ts =====
/**
 * Per-card view of the global audio playback state.
 *
 * `useVoiceNotePlayer` is a thin selector over `AudioPlaybackProvider`.
 * Each `VoiceNoteCard` calls it with its own `storagePath`; the hook
 * returns playback state scoped to that file (so cards that aren't the
 * active one always see `isPlaying=false`, `positionMs=0`, etc.) and
 * forwards control calls to the global provider.
 *
 * This shape preserves the previous hook API so existing call sites
 * keep working without changes.
 */
import { useCallback, useMemo } from "react";
import { useAudioPlayback } from "@/lib/audio/AudioPlaybackProvider";
import { type FileMetadataRow } from "@/lib/file-upload";

export type VoiceNotePlayerState = {
  isLoading: boolean;
  isDownloading: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
};

export type VoiceNotePlayer = VoiceNotePlayerState & {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (positionMs: number) => Promise<void>;
  /** Eagerly download audio to disk cache for instant playback. */
  preload: () => Promise<void>;
};

export type UseVoiceNotePlayerOptions = {
  /** Full row, used by the MiniPlayer to show "now playing" metadata. */
  file?: FileMetadataRow | null;
  /** Display name shown in the MiniPlayer; null hides it. */
  authorName?: string | null;
  /** Duration to show before the player has loaded. */
  fallbackDurationMs?: number | null;
};

/**
 * Hook signature accepts both:
 *   useVoiceNotePlayer(storagePath, fallbackDurationMs)   // legacy
 *   useVoiceNotePlayer(storagePath, { file, authorName }) // preferred
 */
export function useVoiceNotePlayer(
  storagePath: string | null | undefined,
  optionsOrFallback?: UseVoiceNotePlayerOptions | number | null,
): VoiceNotePlayer {
  const ctx = useAudioPlayback();

  const options: UseVoiceNotePlayerOptions =
    typeof optionsOrFallback === "object" && optionsOrFallback !== null
      ? optionsOrFallback
      : { fallbackDurationMs: optionsOrFallback ?? null };

  const isActive = !!storagePath && ctx.activeStoragePath === storagePath;

  const play = useCallback(async () => {
    if (!storagePath) return;
    await ctx.play({
      storagePath,
      file: options.file ?? null,
      authorName: options.authorName ?? null,
      fallbackDurationMs: options.fallbackDurationMs ?? null,
    });
  }, [
    ctx,
    storagePath,
    options.file,
    options.authorName,
    options.fallbackDurationMs,
  ]);

  const pause = useCallback(() => {
    if (!isActive) return;
    ctx.pause();
  }, [ctx, isActive]);

  const seekTo = useCallback(
    async (ms: number) => {
      if (!isActive) return;
      await ctx.seekTo(ms);
    },
    [ctx, isActive],
  );

  const preload = useCallback(async () => {
    if (!storagePath) return;
    await ctx.preload(storagePath);
  }, [ctx, storagePath]);

  return useMemo<VoiceNotePlayer>(
    () => ({
      isLoading: isActive ? ctx.isLoading : false,
      isDownloading: isActive ? ctx.isDownloading : false,
      isPlaying: isActive ? ctx.isPlaying : false,
      positionMs: isActive ? ctx.positionMs : 0,
      durationMs: isActive
        ? ctx.durationMs || options.fallbackDurationMs || 0
        : options.fallbackDurationMs ?? 0,
      error: isActive ? ctx.error : null,
      play,
      pause,
      seekTo,
      preload,
    }),
    [
      isActive,
      ctx.isLoading,
      ctx.isDownloading,
      ctx.isPlaying,
      ctx.positionMs,
      ctx.durationMs,
      ctx.error,
      options.fallbackDurationMs,
      play,
      pause,
      seekTo,
      preload,
    ],
  );
}

===== FILE: apps/mobile-old/lib/audio/AudioPlaybackProvider.tsx =====
/**
 * Centralized voice-note playback (v2 — screen-scoped).
 *
 * Owns a single `expo-audio` `AudioPlayer` for the entire app so that:
 *   1. Starting a new voice note always stops the previous one — no
 *      overlapping audio when the user navigates between reports.
 *   2. Playback is scoped to the screen that started it. The provider
 *      records the pathname at the moment of `play()` and tears the
 *      player down whenever the pathname changes (navigation away),
 *      or the app goes to `background` / `inactive`.
 *   3. Music ducking is polite: while a voice note plays we use
 *      `interruptionMode: "doNotMix"` (pauses other apps' audio on
 *      iOS); when we stop, we flip to `mixWithOthers` +
 *      `playsInSilentMode: false` to release the exclusive audio
 *      session so iOS auto-resumes the user's music.
 *
 * Playback state (isPlaying / position / duration) is driven by a
 * `playbackStatusUpdate` listener — *not* polling. The previous polling
 * loop had a race where a tick landing immediately after `p.play()`
 * could observe `playing=false` (because expo-audio sets the flag
 * asynchronously) and write that into state, leaving the play/pause
 * button stuck on Play even though audio was running. The listener is
 * the only writer of `isPlaying`, so it can't desync.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { getSignedUrl } from "@/lib/file-upload";
import { backend } from "@/lib/backend";
import {
  VOICE_NOTE_CACHE_DIR_NAME,
  toVoiceNoteCacheFilename,
} from "@/lib/voice-note-cache";
import { type FileMetadataRow } from "@/lib/file-upload";

const DOWNLOAD_OK_MIN = 200;
const DOWNLOAD_OK_MAX = 299;

/** Active audio mode while a voice note is playing. */
const VOICE_NOTE_PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  interruptionMode: "doNotMix",
} as const;

/**
 * Audio mode applied on stop / finish / background. Switching to
 * `mixWithOthers` + `playsInSilentMode: false` releases the exclusive
 * audio session on iOS, which lets the system auto-resume any music
 * the user paused when our voice note started.
 */
const VOICE_NOTE_PLAYBACK_AUDIO_MODE_RELEASE = {
  allowsRecording: false,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  interruptionMode: "mixWithOthers",
} as const;

export type AudioPlaybackState = {
  /** storage_path of the file currently loaded in the player, or null. */
  activeStoragePath: string | null;
  /** Full row for the active file when known. */
  activeFile: FileMetadataRow | null;
  /** Display name of the recorder, when known. */
  activeAuthorName: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
};

export type PlayInput = {
  storagePath: string;
  fallbackDurationMs?: number | null;
  file?: FileMetadataRow | null;
  authorName?: string | null;
};

export type AudioPlaybackContextValue = AudioPlaybackState & {
  play: (input: PlayInput) => Promise<void>;
  pause: () => void;
  /** Resume the active file from its current position. No-op if nothing loaded. */
  resume: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  /** Stop and unload the active player; releases audio session. */
  stop: () => void;
  /** Eagerly download a file into the disk cache without creating a player. */
  preload: (storagePath: string) => Promise<void>;
};

const initialState: AudioPlaybackState = {
  activeStoragePath: null,
  activeFile: null,
  activeAuthorName: null,
  isPlaying: false,
  isLoading: false,
  isDownloading: false,
  positionMs: 0,
  durationMs: 0,
  error: null,
};

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(null);

export function useAudioPlayback(): AudioPlaybackContextValue {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) {
    throw new Error(
      "useAudioPlayback must be used inside an <AudioPlaybackProvider>",
    );
  }
  return ctx;
}

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioPlaybackState>(initialState);

  const playerRef = useRef<AudioPlayer | null>(null);
  const playerStoragePathRef = useRef<string | null>(null);
  const listenerSubRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  /** Token bumped on each `play()` call so stale async work can be ignored. */
  const playTokenRef = useRef(0);
  /** Pathname at the moment of the last successful `play()`. */
  const owningPathnameRef = useRef<string | null>(null);
  /** Whether *something* is currently active (player loaded or loading). */
  const isActiveRef = useRef(false);

  const releaseAudioSession = useCallback(() => {
    // Best-effort: a failure here just means iOS holds the session a
    // moment longer; the next setAudioModeAsync will reconcile.
    void setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE_RELEASE).catch(
      () => undefined,
    );
  }, []);

  const detachListener = useCallback(() => {
    const sub = listenerSubRef.current;
    listenerSubRef.current = null;
    if (sub) {
      try {
        sub.remove();
      } catch {
        // Swallow — already removed by player teardown.
      }
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    detachListener();
    const p = playerRef.current;
    playerRef.current = null;
    playerStoragePathRef.current = null;
    isActiveRef.current = false;
    if (p) {
      // expo-audio's `remove()` doesn't always halt audio that is
      // already buffered/playing — particularly when invoked mid-flight
      // (e.g. immediately after `play()` while the asset is still
      // attaching). If we skip pause(), the player can keep playing as
      // an orphan even though we've nulled our ref, and the next
      // `play()` will create a *second* player on top of it. Mute and
      // pause first, then remove, so the audio reliably halts.
      try {
        p.volume = 0;
      } catch {
        // swallow — volume setter may throw on torn-down players
      }
      try {
        p.pause();
      } catch {
        // swallow — pause may throw if the player was already removed
      }
      try {
        p.remove();
      } catch {
        // expo-audio occasionally throws if the player was already
        // removed by a fast unmount; swallow and continue.
      }
    }
  }, [detachListener]);

  const stop = useCallback(() => {
    const wasActive = isActiveRef.current || !!playerRef.current;
    destroyPlayer();
    owningPathnameRef.current = null;
    if (mountedRef.current) {
      setState(initialState);
    }
    if (wasActive) {
      releaseAudioSession();
    }
  }, [destroyPlayer, releaseAudioSession]);

  // Keep a ref to the latest stop() so listeners with stale closures can
  // call it without re-subscribing.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      destroyPlayer();
    };
  }, [destroyPlayer]);

  // Auto-stop on screen change. usePathname() updates when the user
  // navigates; if it differs from the pathname captured at play() time
  // and we have something active, tear it down.
  const pathname = usePathname();
  useEffect(() => {
    const owning = owningPathnameRef.current;
    if (!owning) return;
    if (!isActiveRef.current && !playerRef.current) return;
    if (pathname === owning) return;
    stopRef.current();
  }, [pathname]);

  // Auto-stop when the app goes to background / inactive.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (s: AppStateStatus) => {
        if (s !== "background" && s !== "inactive") return;
        if (!isActiveRef.current && !playerRef.current) return;
        stopRef.current();
      },
    );
    return () => {
      try {
        sub.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const attachListener = useCallback(
    (p: AudioPlayer) => {
      detachListener();
      const sub = p.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        if (!mountedRef.current) return;
        if (playerRef.current !== p) return; // stale subscription
        const finished = !!status.didJustFinish;
        setState((prev) => {
          const durationMs =
            status.duration && status.duration > 0
              ? Math.round(status.duration * 1000)
              : prev.durationMs;
          const positionMs =
            status.currentTime != null
              ? Math.round(status.currentTime * 1000)
              : prev.positionMs;
          return {
            ...prev,
            isPlaying: finished ? false : !!status.playing,
            isLoading: prev.isLoading && !status.isLoaded ? true : false,
            positionMs: finished ? 0 : positionMs,
            durationMs,
          };
        });
        if (finished) {
          // Natural end of track — release the session so the user's
          // music can auto-resume, and clear the active file.
          stopRef.current();
        }
      });
      listenerSubRef.current = sub as { remove: () => void };
    },
    [detachListener],
  );

  const getCachedAudioUri = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (!FileSystem.cacheDirectory) {
        throw new Error("Audio cache is unavailable on this device");
      }
      const cacheDir = `${FileSystem.cacheDirectory}${VOICE_NOTE_CACHE_DIR_NAME}/`;
      const localUri = `${cacheDir}${toVoiceNoteCacheFilename(storagePath)}`;
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) return "uri" in info && info.uri ? info.uri : localUri;

      if (mountedRef.current) {
        setState((s) => ({ ...s, isDownloading: true }));
      }
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      const url = await getSignedUrl(backend, storagePath);
      const downloaded = await FileSystem.downloadAsync(url, localUri);
      if (!mountedRef.current) return null;
      if (
        downloaded.status < DOWNLOAD_OK_MIN ||
        downloaded.status > DOWNLOAD_OK_MAX
      ) {
        throw new Error(`Could not download audio (${downloaded.status})`);
      }
      return downloaded.uri;
    },
    [],
  );

  const preload = useCallback(
    async (storagePath: string) => {
      if (!storagePath) return;
      try {
        await getCachedAudioUri(storagePath);
        if (mountedRef.current) {
          setState((s) => ({ ...s, isDownloading: false }));
        }
      } catch {
        // Best-effort: a failed preload just means the first play will
        // download instead. Don't surface this as an error.
        if (mountedRef.current) {
          setState((s) => ({ ...s, isDownloading: false }));
        }
      }
    },
    [getCachedAudioUri],
  );

  const play = useCallback(
    async (input: PlayInput) => {
      const { storagePath, fallbackDurationMs, file, authorName } = input;
      if (!storagePath) return;

      const token = ++playTokenRef.current;

      // If the same file is already loaded, just resume it.
      if (
        playerRef.current &&
        playerStoragePathRef.current === storagePath
      ) {
        const p = playerRef.current;
        try {
          await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
        } catch (err) {
          if (mountedRef.current) {
            setState((s) => ({
              ...s,
              error:
                err instanceof Error
                  ? err.message
                  : "Could not configure audio playback",
            }));
          }
          return;
        }
        const duration = p.duration ?? 0;
        if (duration > 0 && p.currentTime >= duration) {
          p.seekTo(0);
        }
        owningPathnameRef.current = pathname;
        isActiveRef.current = true;
        p.play();
        // Optimistically mark playing so the UI doesn't flicker between
        // tap and the first listener event. The listener will reconcile.
        if (mountedRef.current) {
          setState((s) => ({ ...s, isPlaying: true }));
        }
        return;
      }

      // Different file (or none) — tear down any current player first.
      destroyPlayer();

      if (mountedRef.current) {
        setState({
          activeStoragePath: storagePath,
          activeFile: file ?? null,
          activeAuthorName: authorName ?? null,
          isPlaying: false,
          isLoading: true,
          isDownloading: false,
          positionMs: 0,
          durationMs: fallbackDurationMs ?? 0,
          error: null,
        });
      }
      isActiveRef.current = true;
      owningPathnameRef.current = pathname;

      try {
        await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
        const audioUri = await getCachedAudioUri(storagePath);
        if (!mountedRef.current || token !== playTokenRef.current) return;
        if (!audioUri) return;

        const p = createAudioPlayer({ uri: audioUri });
        playerRef.current = p;
        playerStoragePathRef.current = storagePath;
        attachListener(p);

        p.play();
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            isLoading: false,
            isDownloading: false,
            // Optimistic — the listener will confirm or correct.
            isPlaying: true,
            durationMs:
              Math.round((p.duration ?? 0) * 1000) ||
              s.durationMs ||
              fallbackDurationMs ||
              0,
          }));
        }
      } catch (err) {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        const message =
          err instanceof Error ? err.message : "Could not load audio";
        isActiveRef.current = false;
        owningPathnameRef.current = null;
        setState((s) => ({
          ...s,
          isLoading: false,
          isDownloading: false,
          isPlaying: false,
          error: message,
        }));
      }
    },
    [attachListener, destroyPlayer, getCachedAudioUri, pathname],
  );

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    if (mountedRef.current) {
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const resume = useCallback(async () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          error:
            err instanceof Error
              ? err.message
              : "Could not configure audio playback",
        }));
      }
      return;
    }
    const duration = p.duration ?? 0;
    if (duration > 0 && p.currentTime >= duration) {
      p.seekTo(0);
    }
    p.play();
    if (mountedRef.current) {
      setState((s) => ({ ...s, isPlaying: true }));
    }
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    const p = playerRef.current;
    if (!p) return;
    const durationSec = p.duration ?? 0;
    const clampedMs = clamp(
      positionMs,
      0,
      durationSec > 0 ? Math.round(durationSec * 1000) : positionMs,
    );
    await p.seekTo(clampedMs / 1000);
    if (mountedRef.current) {
      setState((s) => ({ ...s, positionMs: clampedMs }));
    }
  }, []);

  const value = useMemo<AudioPlaybackContextValue>(
    () => ({
      ...state,
      play,
      pause,
      resume,
      seekTo,
      stop,
      preload,
    }),
    [state, play, pause, resume, seekTo, stop, preload],
  );

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

