/**
 * ReportTabPane — read-only Report tab. Pulls report state from
 * `useGenerateReport()` and renders `ReportView` once a report exists.
 * Empty / generating / error states each render their own surface so
 * the user always sees a coherent screen, never a blank pane.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/ReportTabPane.tsx`
 * on branch `dev`. ReportPhotos is deferred — the v4 upload pipeline +
 * `useLocalReportNotes` haven't landed yet, so there are no file rows
 * to feed it. The pane reserves the slot with a TODO marker so the
 * later port is a drop-in.
 */
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Pencil, RotateCcw } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { CompletenessCard } from '@/components/reports/CompletenessCard';
import { ReportView } from '@/components/reports/ReportView';
import { useGenerateReport } from '@/components/reports/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';
import { createEmptyReport } from '@/lib/report-edit-helpers';

interface ReportTabPaneProps {
  width: number;
}

export function ReportTabPane({ width }: ReportTabPaneProps) {
  const { generation, draft, tabs, handleRegenerate } = useGenerateReport();

  // Skeleton shown on the "no report yet" empty state. Built via
  // `createEmptyReport()` so the same defaults (e.g. `visitDate` =
  // today) apply whether the user is staring at the empty Report tab
  // or has just tapped "Edit manually". Memoized once per mount —
  // `createEmptyReport` calls `new Date()`, which would otherwise
  // change identity every render and force CompletenessCard to
  // re-render.
  const emptyReportSkeleton = useMemo(() => createEmptyReport(), []);

  return (
    <View style={{ width }} className="flex-1" testID="report-tab-pane">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {generation.error ? (
          <Animated.View entering={FadeIn}>
            <InlineNotice tone="danger" className="mb-3">
              {generation.error}
            </InlineNotice>
            <View className="mb-3">
              <Button
                variant="secondary"
                size="sm"
                onPress={handleRegenerate}
                testID="btn-report-tab-retry"
              >
                <View className="flex-row items-center gap-1.5">
                  <RotateCcw size={14} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    Retry
                  </Text>
                </View>
              </Button>
            </View>
          </Animated.View>
        ) : null}

        {!generation.report && !generation.isUpdating ? (
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
        ) : null}

        {generation.isUpdating && !generation.report ? (
          <View className="gap-3" testID="report-tab-generating">
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
        ) : null}

        {generation.report ? (
          <View className="gap-3" testID="report-tab-live">
            {generation.isUpdating ? (
              <Animated.View entering={FadeIn}>
                <InlineNotice tone="info">
                  Updating the draft with your newest notes...
                </InlineNotice>
              </Animated.View>
            ) : null}

            <CompletenessCard report={generation.report} />

            <ReportView report={generation.report} />

            {/* TODO(P3.8/P3.9): mount ReportPhotos here once the upload
                pipeline + `useLocalReportNotes` are ported. ReportPhotos
                needs note rows + signed URLs (Pitfall 8); the slot
                stays in place so the later port is a drop-in. */}

            {draft.finalizeError ? (
              <Animated.View entering={FadeIn}>
                <InlineNotice tone="danger">
                  {draft.finalizeError instanceof Error
                    ? draft.finalizeError.message
                    : draft.finalizeError}
                </InlineNotice>
              </Animated.View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
