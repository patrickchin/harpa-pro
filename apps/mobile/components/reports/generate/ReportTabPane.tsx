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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RotateCcw } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { CompletenessCard } from '@/components/reports/CompletenessCard';
import { ReportView } from '@/components/reports/ReportView';
import { ReportPhotosFromGallery } from '@/components/reports/generate/ReportPhotosFromGallery';
import { PhotoGroupPlacementSheet } from '@/components/reports/detail/PhotoGroupPlacementSheet';
import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';
import { createEmptyReport } from '@/lib/reports/report-edit-helpers';
import {
  splitPlacements,
  type PhotoGroup,
  type PhotoPlacement,
} from '@/lib/reports/photo-placements';

interface ReportTabPaneProps {
  width: number;
  onEdit?: (target: import('@/components/reports/edit/types').ReportEditTarget) => void;
}

export function ReportTabPane({ width, onEdit }: ReportTabPaneProps) {
  const {
    generation,
    draft,
    handleRegenerate,
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
          placement: p.placement ?? null,
        });
      }
    }
    return Array.from(map.values());
  }, [preview.photoGallery, placementsEnabled]);

  const placementsByNoteId = useMemo(() => {
    const m = new Map<string, PhotoPlacement | null>();
    for (const g of photoGroups) m.set(g.noteId, g.placement);
    return m;
  }, [photoGroups]);

  const placements = useMemo(
    () => splitPlacements(photoGroups, generation.report ?? null),
    [photoGroups, generation.report],
  );

  // Self-heal orphaned placements (target index out of range — usually
  // caused by an issue/section being deleted on the report). Fire-and-
  // forget PATCH placement=null per orphan group, debounced via a Set
  // so we don't spam mutations across renders.
  const orphanHealedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onPlace = placement.onPlacePhotoGroup;
    if (!placementsEnabled || !onPlace) return;
    if (placements.orphans.length === 0) return;
    for (const g of placements.orphans) {
      if (orphanHealedRef.current.has(g.noteId)) continue;
      orphanHealedRef.current.add(g.noteId);
      onPlace({ noteId: g.noteId, placement: null });
    }
  }, [placements.orphans, placementsEnabled, placement.onPlacePhotoGroup]);

  const [placementSheetNoteId, setPlacementSheetNoteId] = useState<
    string | null
  >(null);
  const placementCurrent = useMemo(() => {
    if (!placementSheetNoteId) return null;
    return placementsByNoteId.get(placementSheetNoteId) ?? null;
  }, [placementSheetNoteId, placementsByNoteId]);

  const handleOpenPlacementSheet = useCallback(
    (noteId: string) => setPlacementSheetNoteId(noteId),
    [],
  );

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
    const unplacedNoteIds = new Set(placements.unplaced.map((g) => g.noteId));
    // Orphans surface as unplaced until self-heal lands.
    for (const g of placements.orphans) unplacedNoteIds.add(g.noteId);
    return preview.photoGallery.filter((p) => unplacedNoteIds.has(p.noteId));
  }, [
    placementsEnabled,
    preview.photoGallery,
    placements.unplaced,
    placements.orphans,
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

            <ReportView
              report={generation.report}
              reportNumber={reportNumber ?? undefined}
              {...(onEdit ? { onEdit } : {})}
              placements={placementsEnabled ? placements : undefined}
              onOpenPhoto={placementsEnabled ? handleOpenPhoto : undefined}
              onEditPlacement={
                placementsEnabled ? handleOpenPlacementSheet : undefined
              }
            />

            <ReportPhotosFromGallery
              photos={unplacedPhotos}
              onOpen={preview.openPhoto}
              onOpenPlacementSheet={
                placementsEnabled ? handleOpenPlacementSheet : undefined
              }
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

      {placementsEnabled ? (
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
            if (!noteId || !onPlace) return;
            onPlace({ noteId, placement: next });
          }}
          onClose={() => setPlacementSheetNoteId(null)}
        />
      ) : null}
    </View>
  );
}
