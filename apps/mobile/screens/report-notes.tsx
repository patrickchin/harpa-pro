/**
 * ReportNotes screen — dedicated source-notes page for a saved
 * report. Finalised reports hide the inline Notes tab and route
 * users here via the "View Notes" entry in the Actions menu (see
 * `ReportActionsMenu`).
 *
 * Props-driven so dev mirrors + tests can render canned data.
 */
import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Button } from '@/components/primitives/Button';
import {
  ReportNotesPane,
  type ReportNoteRow,
} from '@/components/reports/detail/ReportNotesPane';
import { ImagePreviewModal } from '@/components/files/ImagePreviewModal';

export interface ReportNotesProps {
  /** Per-project report number — used in the header title. */
  reportNumber: number | null;
  /** Server-side report uuid (needed for optimistic delete). */
  reportId: string | null;
  /** Source-note rows backing the timeline. */
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  /** Notes timeline load state. */
  isLoading: boolean;
  /** Load error (renders error state when truthy). */
  loadError: Error | null;
  /** Whether we have enough route params to fetch. */
  hasValidRouteParams: boolean;

  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onRetry: () => void;
  /** Navigate back to the projects list when route params are invalid. */
  onBackToProjects: () => void;

  /** Profile button slot — rendered in the header. */
  actions?: ReactNode;
}

export function ReportNotes(props: ReportNotesProps) {
  const {
    reportNumber,
    reportId,
    noteRows,
    isLoading,
    loadError,
    hasValidRouteParams,
    refreshing,
    onRefresh,
    onBack,
    onRetry,
    onBackToProjects,
    actions,
  } = props;

  const [imagePreview, setImagePreview] = useState<{ index: number } | null>(
    null,
  );

  const photoGallery = (noteRows ?? [])
    .filter(
      (n): n is ReportNoteRow & { fileId: string } =>
        n.kind === 'photo' && typeof n.fileId === 'string' && !!n.fileId,
    )
    .map((n) => ({
      fileId: n.fileId,
      title: n.body?.trim() || 'Photo',
      cacheKey: n.fileId,
    }));

  const handleOpenPhoto = (input: { fileId: string; title?: string }) => {
    const idx = photoGallery.findIndex((p) => p.fileId === input.fileId);
    setImagePreview({ index: idx >= 0 ? idx : 0 });
  };

  if (!hasValidRouteParams) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
            onPress={onBackToProjects}
            testID="btn-report-notes-back-projects"
          >
            Back to Projects
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Failed to load notes
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            {loadError instanceof Error
              ? loadError.message
              : 'Notes data is unavailable.'}
          </Text>
          <Button
            variant="secondary"
            size="default"
            className="mt-4"
            onPress={onRetry}
            testID="btn-report-notes-retry"
          >
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 py-4">
        <ScreenHeader
          title={
            reportNumber !== null ? `Report #${reportNumber} notes` : 'Notes'
          }
          onBack={onBack}
          backLabel="Report"
          actions={actions}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        testID="report-notes-screen"
      >
        <ReportNotesPane
          noteRows={noteRows}
          reportId={reportId}
          onOpenPhoto={handleOpenPhoto}
          isLoading={isLoading}
        />
      </ScrollView>

      <ImagePreviewModal
        visible={imagePreview !== null}
        photos={photoGallery}
        initialIndex={imagePreview?.index ?? 0}
        onClose={() => setImagePreview(null)}
      />
    </SafeAreaView>
  );
}
