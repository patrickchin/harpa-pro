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
 *  - active tab state (Report / Notes / Review)
 *  - actions-menu visibility
 *  - PDF preview modal visibility
 *  - image preview state
 *  - the "confirm delete" and "confirm unfinalize" dialog visibility
 *  - locally-edited `report` (drives the per-card edit modal); when the saved
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
import { ReportEditModal } from '@/components/reports/edit/ReportEditModal';
import type { ReportEditTarget } from '@/components/reports/edit/types';
import { PdfPreviewModal } from '@/components/reports/PdfPreviewModal';
import { ImagePreviewModal } from '@/components/files/ImagePreviewModal';
import { ReportPhotos } from '@/components/reports/detail/ReportPhotos';
import { PhotoAttachmentPickerSheet } from '@/components/reports/detail/PhotoAttachmentPickerSheet';
import { PhotoGroupPlacementSheet } from '@/components/reports/detail/PhotoGroupPlacementSheet';
import { ReportDetailHeader } from '@/components/reports/detail/ReportDetailHeader';
import {
  ReportDetailTabBar,
  type ReportDetailTab,
} from '@/components/reports/detail/ReportDetailTabBar';
import {
  ReportNotesPane,
  type ReportNoteRow,
} from '@/components/reports/detail/ReportNotesPane';
import {
  ReportReviewPane,
  type ReportReviewPaneProps,
} from '@/components/reports/detail/ReportReviewPane';
import { flattenPhotoGallery } from '@/lib/api/to-report-note-row';
import { ReportActionsMenu } from '@/components/reports/detail/ReportActionsMenu';
import { SavedReportSheet } from '@/components/reports/detail/SavedReportSheet';
import { ReportDetailSkeleton } from '@/components/skeletons/ReportDetailSkeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';
import { colors } from '@/lib/design-tokens/colors';
import { getReportHeaderControlTitle } from '@/lib/reports/report-header-title';
import {
  getDeleteReportDialogCopy,
  getUnfinalizeReportDialogCopy,
} from '@/lib/dialogs/app-dialog-copy';
import {
  collectPlacedAttachmentIds,
  applyPhotoPlacement,
  groupPhotos,
  placementForNoteId,
  placementLabel,
  splitAttachments,
  type PhotoPlacement,
} from '@/lib/reports/photo-placements';
import type { GeneratedSiteReport } from '@harpa/report-core';
import type { UseReportPdfActionsReturn } from '@/lib/reports/use-report-pdf-actions';

export type SavedReportStatus = 'draft' | 'finalized';

export interface SavedReportProps {
  /** Normalized GeneratedSiteReport (or null when not yet resolved). */
  report: GeneratedSiteReport | null;
  /** Saved-report status — controls Notes/Review and read-only edit chrome. */
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

  /** Finalized-report review discussion. Routes own fetch/mutation I/O. */
  reviewComments?: ReportReviewPaneProps['comments'];
  reviewCommentsLoading?: boolean;
  reviewCommentsError?: Error | null;
  isAddingReviewComment?: boolean;
  onRetryReviewComments?: () => void;
  onAddReviewComment?: (body: string) => void | Promise<void>;

  /** Profile button slot — rendered in the report detail header. */
  actions?: ReactNode;

  /**
   * Invoked from the Actions menu's "View notes" entry on finalised
   * reports. When provided, the menu surfaces a "View notes" row;
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

  /**
   * Invoked when the user picks (or clears) a placement from the
   * `PhotoGroupPlacementSheet`. When omitted, the placement chip and
   * sheet are not rendered at all (legacy behaviour). The route file
   * wires this to the report attachment placement mutation.
   */
  onPlacePhotoGroup?: (input: {
    noteId: string;
    placement: PhotoPlacement | null;
  }) => void | Promise<void>;
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
    reviewComments = [],
    reviewCommentsLoading = false,
    reviewCommentsError = null,
    isAddingReviewComment = false,
    onRetryReviewComments,
    onAddReviewComment,
    actions,
    onViewNotes,
    showDeveloperSection,
    onOpenDebug,
    onPlacePhotoGroup,
  } = props;

  const [menuVisible, setMenuVisible] = useState(false);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    index: number;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmUnfinalizeOpen, setConfirmUnfinalizeOpen] = useState(false);
  const [actionError, setActionError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ReportDetailTab>(
    initialTab ?? 'report',
  );
  // `editing` drives the per-card full-screen edit modal. `null` when
  // closed; otherwise the slice descriptor for whichever pencil was
  // tapped. See
  // `docs/superpowers/specs/2026-06-03-report-edit-modal-redesign-design.md`.
  const [editing, setEditing] = useState<ReportEditTarget | null>(null);

  // Layout-shift probes — landmarks that should land at the same Y
  // when the loading branch swaps to the loaded `ReportDetailHeader`.
  // Only the loading side records frames today (see
  // `lib/layout-shift-probe.ts`); the ids match the equivalent
  // landmarks rendered by `ReportDetailHeader` + `<ReportView />`.
  const loadingHeaderProbe = useLayoutShiftProbe('report-detail:header');
  const loadingTitleProbe = useLayoutShiftProbe('report-detail:title-block');

  const isFinal = reportStatus === 'finalized';

  // Keep the active tab valid when report publication state changes.
  // Drafts offer Notes; finalized reports replace it with Review.
  useEffect(() => {
    if (isFinal && activeTab === 'notes') {
      setActiveTab('report');
    }
    if (!isFinal && activeTab === 'review') {
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

  const placePhotoGroup = (input: {
    noteId: string;
    placement: PhotoPlacement | null;
  }) => {
    if (isFinal) return;
    if (displayReport) {
      setLocalReport(
        applyPhotoPlacement(displayReport, input.noteId, input.placement),
      );
    }
    void onPlacePhotoGroup?.(input);
  };

  const placementsEnabled = !!onPlacePhotoGroup;
  const placementActionsEnabled = placementsEnabled && !isFinal;

  const photoGroups = useMemo(
    () => groupPhotos(noteRows ?? []),
    [noteRows],
  );

  const placements = useMemo(
    () => splitAttachments(photoGroups, displayReport),
    [photoGroups, displayReport],
  );

  const placedNoteIds = useMemo(
    () => collectPlacedAttachmentIds(displayReport),
    [displayReport],
  );

  const [placementSheetNoteId, setPlacementSheetNoteId] = useState<
    string | null
  >(null);
  const placementCurrent = useMemo(() => {
    return placementForNoteId(displayReport, placementSheetNoteId);
  }, [placementSheetNoteId, displayReport]);
  const [attachmentPickerTarget, setAttachmentPickerTarget] =
    useState<PhotoPlacement | null>(null);
  const attachmentPickerTargetLabel = useMemo(() => {
    return placementLabel(attachmentPickerTarget, displayReport) ?? 'this target';
  }, [attachmentPickerTarget, displayReport]);

  useEffect(() => {
    if (placementActionsEnabled) return;
    setPlacementSheetNoteId(null);
    setAttachmentPickerTarget(null);
  }, [placementActionsEnabled]);

  // Gallery of all photo-notes — drives the swipeable preview modal.
  // One entry per joined `note_files` row across every image note,
  // ordered newest-first to match the timeline. Both `ReportPhotos`
  // and `ReportNotesPane` tap-handlers resolve into this same list
  // by `fileId` via `findIndex`, so any iteration order works for
  // *finding* the index — we sort newest-first only so swiping
  // forward walks the same direction as reading the timeline.
  const photoGallery = useMemo(() => flattenPhotoGallery(noteRows), [noteRows]);

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

  // Pencil → modal. Editable only when the report is a draft. Finalised
  // reports hide the tab bar and don't render the editing UI.
  const handleOpenEdit = (target: ReportEditTarget) => {
    setEditing(target);
  };

  const handleEditModalChange = (next: GeneratedSiteReport) => {
    handleEditChange(next);
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
              stackedTitle
              controlTitle={getReportHeaderControlTitle(reportNumber)}
            />
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <View className="min-w-0 flex-1 flex-row rounded-lg border border-border bg-card p-1">
              <View className="min-h-touch flex-1 flex-row items-center justify-center gap-2 rounded-md">
                <Skeleton width={14} height={14} />
                <Skeleton width={44} height={14} />
              </View>
              <View className="min-h-touch flex-1 flex-row items-center justify-center gap-2 rounded-md">
                <Skeleton width={14} height={14} />
                <Skeleton width={48} height={14} />
              </View>
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
            Couldn't load report
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
          tabs={
            <ReportDetailTabBar
              activeTab={activeTab}
              onChange={setActiveTab}
              secondaryTab={isFinal ? 'review' : 'notes'}
              secondaryCount={isFinal ? reviewComments.length : notesCount}
            />
          }
          actions={actions}
          reportNumber={reportNumber}
        />

        {activeTab === 'report' ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            className="px-5"
            testID="saved-report-pane"
          >
            <ReportView
              report={displayReport}
              reportNumber={reportNumber ?? undefined}
              onEdit={!isFinal ? handleOpenEdit : undefined}
              placements={placementsEnabled ? placements : undefined}
              onOpenPhoto={handleOpenPhoto}
              onEditPlacement={
                placementActionsEnabled
                  ? (noteId) => setPlacementSheetNoteId(noteId)
                  : undefined
              }
              onAddAttachmentToTarget={
                placementActionsEnabled
                  ? (target) => setAttachmentPickerTarget(target)
                  : undefined
              }
            />
            <View className="mt-4">
              <ReportPhotos
                noteRows={noteRows}
                onOpenPhoto={handleOpenPhoto}
                onOpenPlacementSheet={
                  placementActionsEnabled
                    ? (noteId) => setPlacementSheetNoteId(noteId)
                    : undefined
                }
                filterPlacedPhotoGroups={placementsEnabled}
                placedNoteIds={placedNoteIds}
              />
            </View>
          </Animated.View>
        ) : activeTab === 'review' && isFinal ? (
          <Animated.View entering={FadeIn.duration(250)}>
            <ReportReviewPane
              comments={reviewComments}
              isLoading={reviewCommentsLoading}
              error={reviewCommentsError}
              isSubmitting={isAddingReviewComment}
              onRetry={onRetryReviewComments}
              onAddComment={onAddReviewComment}
            />
          </Animated.View>
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
            label: isDeleting ? 'Deleting…' : deleteCopy.confirmLabel,
            variant: deleteCopy.confirmVariant,
            onPress: async () => {
              try {
                await onConfirmDelete();
                setConfirmDeleteOpen(false);
              } catch {
                setConfirmDeleteOpen(false);
                setActionError({
                  title: "Couldn't delete report",
                  message: 'Try again.',
                });
              }
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
              ? 'Unfinalizing…'
              : unfinalizeCopy.confirmLabel,
            variant: unfinalizeCopy.confirmVariant,
            onPress: async () => {
              try {
                await onConfirmUnfinalize();
                setConfirmUnfinalizeOpen(false);
              } catch {
                setConfirmUnfinalizeOpen(false);
                setActionError({
                  title: "Couldn't unfinalize report",
                  message: 'Try again.',
                });
              }
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

      <AppDialogSheet
        visible={actionError !== null}
        title={actionError?.title ?? "Couldn't update report"}
        message={actionError?.message}
        noticeTone="danger"
        noticeTitle="Action failed"
        onClose={() => setActionError(null)}
        actions={[
          {
            label: 'Done',
            variant: 'secondary',
            onPress: () => setActionError(null),
            testID: 'btn-dismiss-report-action-error',
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

      {!isFinal && displayReport ? (
        <ReportEditModal
          target={editing}
          report={displayReport}
          onClose={() => setEditing(null)}
          onChange={handleEditModalChange}
        />
      ) : null}

      {placementActionsEnabled ? (
        <PhotoGroupPlacementSheet
          visible={placementSheetNoteId !== null}
          issues={displayReport?.report.issues ?? []}
          sections={displayReport?.report.sections ?? []}
          photoCount={
            placementSheetNoteId
              ? photoGroups.find((g) => g.noteId === placementSheetNoteId)
                  ?.photos.length ?? 0
              : 0
          }
          current={placementCurrent}
          onSelect={(next) => {
            const noteId = placementSheetNoteId;
            setPlacementSheetNoteId(null);
            if (!noteId) return;
            placePhotoGroup({ noteId, placement: next });
          }}
          onClose={() => setPlacementSheetNoteId(null)}
        />
      ) : null}

      {placementActionsEnabled ? (
        <PhotoAttachmentPickerSheet
          visible={attachmentPickerTarget !== null}
          targetLabel={attachmentPickerTargetLabel}
          groups={placements.unplaced}
          onSelect={(noteId) => {
            const target = attachmentPickerTarget;
            setAttachmentPickerTarget(null);
            if (!target) return;
            placePhotoGroup({ noteId, placement: target });
          }}
          onClose={() => setAttachmentPickerTarget(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
