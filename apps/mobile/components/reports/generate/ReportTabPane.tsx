/**
 * ReportTabPane — read-only Report tab. Pulls report state from
 * `useGenerateReport()` and renders `ReportView` once a report exists.
 * Empty / generating / error states each render their own surface so
 * the user always sees a coherent screen, never a blank pane.
 *
 * When the route wires `placement.onPlacePhotoGroup`, photo groups
 * gain a placement chip and split into:
 *   - per-issue / per-section strips inlined under each card via
 *     `ReportView`'s `placements` prop, and
 *   - an "Unplaced photos" grid at the bottom (the legacy
 *     `ReportPhotosFromGallery` block, now placement-aware).
 * Mirrors the saved-report screen's split logic so behaviour stays
 * consistent before/after finalize.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RotateCcw } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { CompletenessCard } from '@/components/reports/CompletenessCard';
import { ReportView } from '@/components/reports/ReportView';
import { ReportPhotosFromGallery } from '@/components/reports/generate/ReportPhotosFromGallery';
import { PhotoAttachmentPickerSheet } from '@/components/reports/detail/PhotoAttachmentPickerSheet';
import { PhotoGroupPlacementSheet } from '@/components/reports/detail/PhotoGroupPlacementSheet';
import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';
import { createEmptyReport } from '@/lib/reports/report-edit-helpers';
import {
  collectPlacedAttachmentIds,
  placementForNoteId,
  placementLabel,
  splitAttachments,
  type PhotoGroup,
  type PhotoPlacement,
} from '@/lib/reports/photo-placements';

interface ReportTabPaneProps {
  width: number;
  onEdit?: (target: import('@/components/reports/edit/types').ReportEditTarget) => void;
  editActionsDisabled?: boolean;
}

export function ReportTabPane({
  width,
  onEdit,
  editActionsDisabled = false,
}: ReportTabPaneProps) {
  const {
    generation,
    draft,
    reportNumber,
    preview,
    placement,
  } = useGenerateReport();

  // Skeleton shown on the "no report yet" empty state. Memoized once
  // per mount — `createEmptyReport` calls `new Date()`, which would
  // otherwise change identity every render and force CompletenessCard
  // to re-render.
  const emptyReportSkeleton = useMemo(() => createEmptyReport(), []);

  const placementsEnabled = !!placement.onPlacePhotoGroup;
  const placementActionsEnabled =
    placementsEnabled && placement.canPlacePhotoGroup && !generation.isUpdating;

  // Build photo groups directly from the gallery (one entry per
  // `noteId` with N tiles). Mirrors `groupPhotos(noteRows, …)` in the
  // saved-report flow but keyed off the provider-built gallery so we
  // never reach back into `notes`/`timelineItems` here.
  const photoGroups = useMemo<PhotoGroup[]>(() => {
    if (!placementsEnabled) return [];
    const map = new Map<string, PhotoGroup>();
    for (const p of preview.photoGallery) {
      const existing = map.get(p.noteId);
      const tile = {
        id: p.fileId,
        fileId: p.fileId,
        thumbnailFileId: p.thumbnailFileId,
      };
      if (existing) {
        (existing.photos as Array<typeof tile>).push(tile);
      } else {
        map.set(p.noteId, {
          noteId: p.noteId,
          title: p.title,
          photos: [tile],
        });
      }
    }
    return Array.from(map.values());
  }, [preview.photoGallery, placementsEnabled]);

  const placements = useMemo(
    () => splitAttachments(photoGroups, generation.report ?? null),
    [photoGroups, generation.report],
  );

  const [placementSheetNoteId, setPlacementSheetNoteId] = useState<
    string | null
  >(null);
  const placementCurrent = useMemo(() => {
    return placementForNoteId(generation.report ?? null, placementSheetNoteId);
  }, [placementSheetNoteId, generation.report]);

  const handleOpenPlacementSheet = useCallback(
    (noteId: string) => {
      if (!placementActionsEnabled) return;
      setPlacementSheetNoteId(noteId);
    },
    [placementActionsEnabled],
  );
  const [attachmentPickerTarget, setAttachmentPickerTarget] =
    useState<PhotoPlacement | null>(null);
  const attachmentPickerTargetLabel = useMemo(() => {
    return (
      placementLabel(attachmentPickerTarget, generation.report ?? null) ??
      'this target'
    );
  }, [attachmentPickerTarget, generation.report]);

  const handleOpenAttachmentPicker = useCallback(
    (target: PhotoPlacement) => {
      if (!placementActionsEnabled) return;
      setAttachmentPickerTarget(target);
    },
    [placementActionsEnabled],
  );

  useEffect(() => {
    if (placementActionsEnabled) return;
    setPlacementSheetNoteId(null);
    setAttachmentPickerTarget(null);
  }, [placementActionsEnabled]);

  const handleOpenPhoto = useCallback(
    (input: { fileId: string; title?: string }) => {
      preview.openPhoto(input.fileId);
    },
    [preview],
  );

  // Photos visible in the "Unplaced photos" bottom grid. When
  // placement is off we show everything (legacy behaviour); when on we
  // only show photos belonging to unplaced groups so each photo is
  // anchored in exactly one place on the screen.
  const unplacedPhotos = useMemo(() => {
    if (!placementsEnabled) return preview.photoGallery;
    const placedNoteIds = collectPlacedAttachmentIds(generation.report ?? null);
    return preview.photoGallery.filter((p) => !placedNoteIds.has(p.noteId));
  }, [
    placementsEnabled,
    preview.photoGallery,
    generation.report,
  ]);

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
                onPress={generation.errorAction}
                testID="btn-report-tab-retry"
              >
                <View className="flex-row items-center gap-1.5">
                  <RotateCcw size={14} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    {generation.errorActionLabel}
                  </Text>
                </View>
              </Button>
            </View>
          </Animated.View>
        ) : null}

        {!generation.report && !generation.isUpdating ? (
          <View className="gap-3">
            <CompletenessCard report={emptyReportSkeleton} />
          </View>
        ) : null}

        {generation.isUpdating && !generation.report ? (
          <View className="gap-3" testID="report-tab-generating">
            <InlineNotice tone="info">
              Generating your report from the notes collected so far…
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
              <Animated.View
                entering={FadeIn}
                testID="report-tab-updating-notice"
              >
                <InlineNotice tone="info">
                  Updating the draft with your newest notes…
                </InlineNotice>
              </Animated.View>
            ) : null}

            <CompletenessCard report={generation.report} />

            <ReportView
              report={generation.report}
              reportNumber={reportNumber ?? undefined}
              {...(onEdit ? { onEdit } : {})}
              editActionsDisabled={editActionsDisabled}
              placements={placementsEnabled ? placements : undefined}
              onOpenPhoto={placementsEnabled ? handleOpenPhoto : undefined}
              onEditPlacement={
                placementsEnabled ? handleOpenPlacementSheet : undefined
              }
              placementActionsDisabled={!placementActionsEnabled}
              onAddAttachmentToTarget={
                placementsEnabled ? handleOpenAttachmentPicker : undefined
              }
            />

            <ReportPhotosFromGallery
              photos={unplacedPhotos}
              onOpen={preview.openPhoto}
              onOpenPlacementSheet={
                placementsEnabled ? handleOpenPlacementSheet : undefined
              }
              placementActionsDisabled={!placementActionsEnabled}
              report={generation.report}
            />

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

      {placementActionsEnabled ? (
        <PhotoGroupPlacementSheet
          visible={placementSheetNoteId !== null}
          issues={generation.report?.report.issues ?? []}
          sections={generation.report?.report.sections ?? []}
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
            const onPlace = placement.onPlacePhotoGroup;
            if (!noteId || !onPlace || !placementActionsEnabled) return;
            onPlace({ noteId, placement: next });
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
            const onPlace = placement.onPlacePhotoGroup;
            if (!target || !onPlace || !placementActionsEnabled) return;
            onPlace({ noteId, placement: target });
          }}
          onClose={() => setAttachmentPickerTarget(null)}
        />
      ) : null}
    </View>
  );
}
