/**
 * SavedReport screen body — props-only, no API/auth/secure-store.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`
 * on branch `dev`. v4 uses slug-native route params (`project` +
 * per-project `number`) and the API report status enum is
 * `draft|finalized` (not `final`).
 *
 * The body owns:
 *  - active tab state (Report / Notes / Edit)
 *  - actions-menu visibility
 *  - PDF preview modal visibility
 *  - image preview state
 *  - the "confirm delete" and "confirm unfinalize" dialog visibility
 *  - locally-edited `report` (drives the Edit tab); when the saved
 *    snapshot changes underneath unchanged local edits we adopt it
 *    (the canonical `lastServerJsonRef` reconciliation pattern).
 *
 * Everything else (data, persistence, PDF actions) flows in through
 * typed props so this screen can be rendered with canned values from
 * dev mirrors + tests.
 */
import { useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { ReportView } from '@/components/reports/ReportView';
import { ReportEditForm } from '@/components/reports/ReportEditForm';
import { PdfPreviewModal } from '@/components/reports/PdfPreviewModal';
import { ImagePreviewModal } from '@/components/files/ImagePreviewModal';
import { ReportPhotos } from '@/components/reports/detail/ReportPhotos';
import { ReportDetailHeader } from '@/components/reports/detail/ReportDetailHeader';
import {
  ReportDetailTabBar,
  type ReportDetailTab,
} from '@/components/reports/detail/ReportDetailTabBar';
import {
  ReportNotesPane,
  type ReportNoteRow,
} from '@/components/reports/detail/ReportNotesPane';
import { ReportActionsMenu } from '@/components/reports/detail/ReportActionsMenu';
import { SavedReportSheet } from '@/components/reports/detail/SavedReportSheet';
import { ReportDetailSkeleton } from '@/components/skeletons/ReportDetailSkeleton';
import {
  getDeleteReportDialogCopy,
  getUnfinalizeReportDialogCopy,
} from '@/lib/app-dialog-copy';
import type { GeneratedSiteReport } from '@harpa/report-core';
import type { UseReportPdfActionsReturn } from '@/lib/use-report-pdf-actions';

export type SavedReportStatus = 'draft' | 'finalized';

export interface SavedReportProps {
  /** Normalized GeneratedSiteReport (or null when not yet resolved). */
  report: GeneratedSiteReport | null;
  /** Saved-report status — controls Edit tab visibility + read-only chrome. */
  reportStatus: SavedReportStatus | null;
  /** Project display name (used as the PDF site name). */
  projectName: string | null;
  /** Source-note rows (text/voice/photo/document) backing the Notes tab. */
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  /** Saved-report load state. */
  isLoading: boolean;
  /** Saved-report load error (renders error state when truthy). */
  loadError: Error | null;
  /** Whether we have enough route params to fetch. */
  hasValidRouteParams: boolean;

  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onRetry: () => void;
  /** Navigate back to the projects list when route params are invalid. */
  onBackToProjects: () => void;

  /** Edit-tab live patch sink (no-op until persistence wires). */
  onChangeReport: (next: GeneratedSiteReport) => void;
  isAutoSaving: boolean;
  lastSavedAt: number | null;

  /** Resolved permissions for hiding rows in the actions menu. */
  canUnfinalize: boolean;
  canDelete: boolean;
  /** Mutation orchestration — called from inside confirm dialogs. */
  onConfirmDelete: () => void | Promise<void>;
  onConfirmUnfinalize: () => void | Promise<void>;
  isDeleting: boolean;
  isUnfinalizing: boolean;

  /** PDF action state machine (from useReportPdfActions). */
  pdfActions: UseReportPdfActionsReturn;

  /** Optional initial tab for dev mirrors + tests. */
  initialTab?: ReportDetailTab;
}

export function SavedReport(props: SavedReportProps) {
  const {
    report,
    reportStatus,
    projectName,
    noteRows,
    isLoading,
    loadError,
    hasValidRouteParams,
    refreshing,
    onRefresh,
    onBack,
    onRetry,
    onBackToProjects,
    onChangeReport,
    isAutoSaving,
    lastSavedAt,
    canUnfinalize,
    canDelete,
    onConfirmDelete,
    onConfirmUnfinalize,
    isDeleting,
    isUnfinalizing,
    pdfActions,
    initialTab,
  } = props;

  const [menuVisible, setMenuVisible] = useState(false);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    fileId: string;
    title?: string;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmUnfinalizeOpen, setConfirmUnfinalizeOpen] = useState(false);
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ReportDetailTab>(
    initialTab ?? 'report',
  );

  const isFinal = reportStatus === 'finalized';

  // Finalized reports are read-only — bounce back to Report tab if the
  // status flips to finalized while the user is on Edit.
  useEffect(() => {
    if (isFinal && activeTab === 'edit') {
      setActiveTab('report');
    }
  }, [isFinal, activeTab]);

  // Sync localReport from the parsed saved report. Refetches adopt the
  // new server snapshot ONLY when the user has no unsaved local edits.
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
  }, [report]);

  const displayReport = localReport ?? report ?? null;
  const notesCount = (noteRows ?? []).length;

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
  } = pdfActions;

  const handleEditChange = (next: GeneratedSiteReport) => {
    setLocalReport(next);
    onChangeReport(next);
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-5 pt-4 pb-2">
          <ScreenHeader
            title="Report"
            onBack={onBack}
            backLabel="Reports"
          />
        </View>
        <ReportDetailSkeleton />
      </SafeAreaView>
    );
  }

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
            testID="btn-saved-report-back-projects"
          >
            Back to Projects
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !displayReport) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Failed to load report
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            {loadError instanceof Error
              ? loadError.message
              : 'Report data is unavailable.'}
          </Text>
          <Button
            variant="secondary"
            size="default"
            className="mt-4"
            onPress={onRetry}
            testID="btn-saved-report-retry"
          >
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const deleteCopy = getDeleteReportDialogCopy();
  const unfinalizeCopy = getUnfinalizeReportDialogCopy();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ReportDetailHeader
          report={displayReport}
          onBack={onBack}
          onOpenActions={() => setMenuVisible(true)}
          actionsDisabled={
            isSaving || isExporting || isDeleting || isUnfinalizing
          }
        />

        <ReportDetailTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          notesCount={notesCount}
          showEditTab={!isFinal}
        />

        {activeTab === 'edit' ? (
          <View className="flex-row items-center justify-between px-5 pt-1 pb-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Edit report
            </Text>
            <Text
              className="text-xs text-muted-foreground"
              testID="edit-autosave-status"
            >
              {isAutoSaving ? 'Saving…' : lastSavedAt ? 'Saved' : ''}
            </Text>
          </View>
        ) : null}

        {activeTab === 'report' ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            className="px-5"
            testID="saved-report-pane"
          >
            <ReportView report={displayReport} />
            <View className="mt-4">
              <ReportPhotos
                noteRows={noteRows}
                onOpenPhoto={setImagePreview}
              />
            </View>
          </Animated.View>
        ) : activeTab === 'edit' ? (
          <View className="px-5" testID="saved-report-edit-pane">
            <ReportEditForm
              report={displayReport}
              onChange={handleEditChange}
            />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)}>
            <ReportNotesPane
              noteRows={noteRows}
              onOpenPhoto={setImagePreview}
            />
          </Animated.View>
        )}
      </ScrollView>

      <ReportActionsMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        canUnfinalize={canUnfinalize}
        canDelete={canDelete}
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
        onUnfinalize={() => {
          setMenuVisible(false);
          // iOS RN `Modal` cannot present a second native modal until
          // the first finishes dismissing. Defer the confirm dialog
          // so the action sheet has time to drop. Without this the
          // confirm dialog never appears (Maestro confirmed on iOS
          // 26.5 / RN 0.75).
          setTimeout(() => setConfirmUnfinalizeOpen(true), 350);
        }}
        onDelete={() => {
          setMenuVisible(false);
          setTimeout(() => setConfirmDeleteOpen(true), 350);
        }}
        isSaving={isSaving}
        isExporting={isExporting}
        isUnfinalizing={isUnfinalizing}
        isDeleting={isDeleting}
      />

      <AppDialogSheet
        visible={confirmDeleteOpen}
        title={deleteCopy.title}
        message={deleteCopy.message}
        noticeTone={deleteCopy.tone}
        noticeTitle={deleteCopy.noticeTitle}
        onClose={() => {
          if (!isDeleting) setConfirmDeleteOpen(false);
        }}
        canDismiss={!isDeleting}
        actions={[
          {
            label: isDeleting ? 'Deleting...' : deleteCopy.confirmLabel,
            variant: deleteCopy.confirmVariant,
            onPress: async () => {
              await onConfirmDelete();
              setConfirmDeleteOpen(false);
            },
            disabled: isDeleting,
            accessibilityLabel: 'Confirm delete report',
            align: 'start',
            testID: 'btn-confirm-delete-report',
          },
          {
            label: deleteCopy.cancelLabel ?? 'Cancel',
            variant: 'quiet',
            onPress: () => setConfirmDeleteOpen(false),
            disabled: isDeleting,
            accessibilityLabel: 'Cancel delete report',
          },
        ]}
      />

      <AppDialogSheet
        visible={confirmUnfinalizeOpen}
        title={unfinalizeCopy.title}
        message={unfinalizeCopy.message}
        noticeTone={unfinalizeCopy.tone}
        noticeTitle={unfinalizeCopy.noticeTitle}
        onClose={() => {
          if (!isUnfinalizing) setConfirmUnfinalizeOpen(false);
        }}
        canDismiss={!isUnfinalizing}
        actions={[
          {
            label: isUnfinalizing
              ? 'Unfinalizing...'
              : unfinalizeCopy.confirmLabel,
            variant: unfinalizeCopy.confirmVariant,
            onPress: async () => {
              await onConfirmUnfinalize();
              setConfirmUnfinalizeOpen(false);
            },
            disabled: isUnfinalizing,
            accessibilityLabel: 'Confirm unfinalize report',
            align: 'start',
            testID: 'btn-confirm-unfinalize-report',
          },
          {
            label: unfinalizeCopy.cancelLabel ?? 'Cancel',
            variant: 'quiet',
            onPress: () => setConfirmUnfinalizeOpen(false),
            disabled: isUnfinalizing,
            accessibilityLabel: 'Cancel unfinalize report',
          },
        ]}
      />

      <PdfPreviewModal
        visible={pdfPreviewVisible}
        report={displayReport}
        siteName={projectName}
        onClose={() => setPdfPreviewVisible(false)}
      />

      <ImagePreviewModal
        visible={imagePreview !== null}
        fileId={imagePreview?.fileId ?? null}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
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
