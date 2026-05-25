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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MoreHorizontal } from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Skeleton } from '@/components/primitives/Skeleton';
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
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';
import { colors } from '@/lib/design-tokens/colors';
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
  /**
   * Server-side report uuid. Threaded into `ReportNotesPane` so the
   * optimistic delete mutation can target the correct `reportNotes`
   * cache page. Optional for backward-compat with dev mirrors that
   * don't have a server id; when absent the kebab Delete is hidden.
   */
  reportId?: string | null;
  /**
   * Per-project report number — used to build stable testIDs for Maestro.
   * Optional for backward-compat with dev mirrors / tests.
   */
  reportNumber?: number | null;
  /** Project display name (used as the PDF site name). */
  projectName: string | null;
  /** Source-note rows (text/voice/photo/document) backing the Notes tab. */
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  /** Saved-report load state. */
  isLoading: boolean;
  /** Notes timeline load state — drives the Notes tab skeleton. */
  notesLoading?: boolean;
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

  /** Profile button slot — rendered in the report detail header. */
  actions?: ReactNode;

  /**
   * Invoked from the Actions menu's "View Notes" entry on finalised
   * reports. When provided, the menu surfaces a "View Notes" row;
   * tapping it should navigate to the dedicated notes screen.
   * Omitted (no entry rendered) for drafts — drafts show the Notes
   * tab inline instead.
   */
  onViewNotes?: () => void;

  /**
   * P4.8 — show the Report Debug entry in the actions menu. Gated by
   * the same `showDeveloperSection` flag (env.EXPO_PUBLIC_USE_FIXTURES
   * or __DEV__) that controls the Profile developer section.
   */
  showDeveloperSection?: boolean;
  /** Invoked when the user taps the Report Debug entry. */
  onOpenDebug?: () => void;
}

export function SavedReport(props: SavedReportProps) {
  const {
    report,
    reportStatus,
    reportId = null,
    reportNumber,
    projectName,
    noteRows,
    isLoading,
    notesLoading = false,
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
    actions,
    onViewNotes,
    showDeveloperSection,
    onOpenDebug,
  } = props;

  const [menuVisible, setMenuVisible] = useState(false);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    index: number;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmUnfinalizeOpen, setConfirmUnfinalizeOpen] = useState(false);
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ReportDetailTab>(
    initialTab ?? 'report',
  );

  // Layout-shift probes — landmarks that should land at the same Y
  // when the loading branch swaps to the loaded `ReportDetailHeader`.
  // Only the loading side records frames today (see
  // `lib/layout-shift-probe.ts`); the ids match the equivalent
  // landmarks rendered by `ReportDetailHeader` + `<ReportView />`.
  const loadingHeaderProbe = useLayoutShiftProbe('report-detail:header');
  const loadingTitleProbe = useLayoutShiftProbe('report-detail:title-block');

  const isFinal = reportStatus === 'finalized';

  // Finalized reports are read-only — bounce back to Report tab if the
  // status flips to finalized while the user is on Edit or Notes (the
  // Notes tab is hidden for finalised reports; access moves to the
  // Actions menu).
  useEffect(() => {
    if (isFinal && (activeTab === 'edit' || activeTab === 'notes')) {
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

  // Gallery of all photo-notes — drives the swipeable preview modal.
  // Order matches `noteRows`; both `ReportPhotos` and `ReportNotesPane`
  // tap-handlers resolve into this same list by `fileId`.
  const photoGallery = useMemo(
    () =>
      (noteRows ?? [])
        .filter(
          (n): n is ReportNoteRow & { fileId: string } =>
            n.kind === 'photo' &&
            typeof n.fileId === 'string' &&
            !!n.fileId,
        )
        .map((n) => ({
          fileId: n.fileId,
          title: n.body?.trim() || 'Photo',
          cacheKey: n.fileId,
        })),
    [noteRows],
  );

  const handleOpenPhoto = (input: { fileId: string; title?: string }) => {
    const idx = photoGallery.findIndex((p) => p.fileId === input.fileId);
    setImagePreview({ index: idx >= 0 ? idx : 0 });
  };

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
    // Mirror `ReportDetailHeader`'s chrome (px-5 py-4 wrapper +
    // ScreenHeader with eyebrow supporting row + visit-date pill /
    // Actions row at mt-3) so the first card under the skeleton
    // lands on the same Y as `<ReportView />`'s first child once
    // the report loads. The Actions button is intentionally NOT
    // mounted during load (the saved-report test guards against
    // `btn-report-actions` appearing in the skeleton tree); the
    // placeholder View below keeps the row height stable.
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-5 py-4" onLayout={loadingHeaderProbe}>
          <View onLayout={loadingTitleProbe}>
            <ScreenHeader
              title="Report"
              titleAccessory={<Skeleton width={120} height={12} />}
              onBack={onBack}
              backLabel="Reports"
              actions={actions}
            />
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Skeleton width={14} height={14} circle />
              <Skeleton width={72} height={14} />
            </View>
            <View className="min-h-touch flex-row items-center gap-1.5 rounded-md border border-border bg-secondary px-4 py-3">
              <MoreHorizontal size={16} color={colors.foreground} />
              <Skeleton width={48} height={14} />
            </View>
          </View>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
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
          actions={actions}
          reportNumber={reportNumber}
        />

        <ReportDetailTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          notesCount={notesCount}
          showEditTab={!isFinal}
          showNotesTab={!isFinal}
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
            <ReportView report={displayReport} reportNumber={reportNumber ?? undefined} />
            <View className="mt-4">
              <ReportPhotos
                noteRows={noteRows}
                onOpenPhoto={handleOpenPhoto}
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
              reportId={reportId ?? null}
              onOpenPhoto={handleOpenPhoto}
              isLoading={notesLoading}
            />
          </Animated.View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <ReportActionsMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        canUnfinalize={canUnfinalize}
        canDelete={canDelete}
        onViewPdf={() => {
          setMenuVisible(false);
          setPdfPreviewVisible(true);
        }}
        onViewNotes={
          onViewNotes
            ? () => {
                setMenuVisible(false);
                onViewNotes();
              }
            : undefined
        }
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
        showDeveloperSection={showDeveloperSection}
        onOpenDebug={
          onOpenDebug
            ? () => {
                setMenuVisible(false);
                onOpenDebug();
              }
            : undefined
        }
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
        photos={photoGallery}
        initialIndex={imagePreview?.index ?? 0}
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
