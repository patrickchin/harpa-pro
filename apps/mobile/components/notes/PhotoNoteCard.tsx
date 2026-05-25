/**
 * PhotoNoteCard — one photo note row in the Generate-screen timeline.
 *
 * Renders chronologically in the mixed text/voice/photo timeline as
 * a compact card. The card handles the entire pending → saved
 * lifecycle for image notes:
 *
 *   - Pending (single file): local thumbnail + progress overlay
 *     next to a status label + Retry/Cancel affordances.
 *   - Pending (batch): tiles rendered through `PhotoBatchGrid` with
 *     per-tile progress overlays; status footer below.
 *   - Saved (single file): server thumbnail next to the caption body.
 *   - Saved (batch): grid of server thumbnails.
 *   - Mixed (server files already saved + new pending appended): both
 *     surfaced via `PhotoBatchGrid`.
 *
 * Keeping every state in one component means the timeline can hold a
 * stable React key across the pending → saved transition — no
 * unmount/remount, no flicker, no content shift (matches the voice
 * pipeline pattern).
 *
 * Header carries the shared ⋯ kebab (same trailing slot used by text +
 * voice rows) which delegates to the parent's `onOpenOptions` callback
 * → shared `NoteOptionsSheet` (metadata + Delete) for consistent UX
 * across every note kind.
 */
import { Pressable, Text, View } from 'react-native';
import { RotateCw, X } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/notes/note-entry';

type PendingFile = NonNullable<NoteEntry['pendingFiles']>[number];
type UploadStatus = PendingFile['status'];

export interface PhotoNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Opens the fullscreen swipeable gallery focussed on this photo. */
  onOpen?: (fileId: string, sourceIndex: number) => void;
  /** Opens the shared `NoteOptionsSheet` (delete, metadata). */
  onOpenOptions?: (sourceIndex: number) => void;
  /** Retry a failed upload job (matches `pendingFiles[].jobId`). */
  onRetryUpload?: (jobId: string) => void;
  /** Cancel/dismiss an in-flight or failed upload job. */
  onCancelUpload?: (jobId: string) => void;
}

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case 'pending':
      return 'Queued…';
    case 'presigning':
      return 'Preparing…';
    case 'uploading':
      return 'Uploading…';
    case 'registering':
      return 'Saving…';
    case 'creating_note':
      return 'Adding to timeline…';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Upload failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

interface AggregateStatus {
  /** Worst-case pending status across all pending files. */
  status: UploadStatus;
  /** First failed pending entry (drives error label + retry target). */
  failed: PendingFile | null;
  /** First in-flight pending entry (drives the cancel button target). */
  inFlight: PendingFile | null;
  /** Combined error message when at least one tile failed. */
  errorMessage: string | null;
}

function aggregateStatus(pending: readonly PendingFile[]): AggregateStatus {
  let failed: PendingFile | null = null;
  let inFlight: PendingFile | null = null;
  let status: UploadStatus = pending[0]?.status ?? 'pending';
  let errorMessage: string | null = null;
  // Order of severity (worst-first): failed > uploading-ish > pending > completed.
  const rank: Record<UploadStatus, number> = {
    failed: 5,
    creating_note: 4,
    registering: 4,
    uploading: 4,
    presigning: 4,
    pending: 3,
    cancelled: 2,
    completed: 1,
  };
  for (const p of pending) {
    if (!failed && p.status === 'failed') {
      failed = p;
      errorMessage = p.error ?? null;
    }
    if (!inFlight && p.status !== 'failed' && p.status !== 'completed') {
      inFlight = p;
    }
    if ((rank[p.status] ?? 0) > (rank[status] ?? 0)) status = p.status;
  }
  return { status, failed, inFlight, errorMessage };
}

interface PendingFooterProps {
  pending: readonly PendingFile[];
  sourceIndex: number;
  onRetryUpload?: (jobId: string) => void;
  onCancelUpload?: (jobId: string) => void;
}

function PendingFooter({
  pending,
  sourceIndex,
  onRetryUpload,
  onCancelUpload,
}: PendingFooterProps) {
  if (pending.length === 0) return null;
  const { status, failed, inFlight, errorMessage } = aggregateStatus(pending);
  const isFailed = failed !== null;
  const target = failed ?? inFlight ?? pending[0]!;
  return (
    <View className="flex-row items-center gap-2">
      <Text
        className={
          isFailed
            ? 'flex-1 text-xs text-danger-foreground'
            : 'flex-1 text-xs text-muted-foreground'
        }
        numberOfLines={3}
        testID={`pending-photo-status-${sourceIndex}`}
      >
        {isFailed && errorMessage ? errorMessage : statusLabel(status)}
      </Text>
      <View className="flex-row gap-1">
        {isFailed && onRetryUpload ? (
          <Pressable
            onPress={() => onRetryUpload(target.jobId)}
            accessibilityRole="button"
            accessibilityLabel="Retry upload"
            testID={`btn-pending-photo-retry-${sourceIndex}`}
            className="flex-row items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
          >
            <RotateCw size={14} color={colors.muted.foreground} />
            <Text className="text-xs text-foreground">Retry</Text>
          </Pressable>
        ) : null}
        {onCancelUpload ? (
          <Pressable
            onPress={() => onCancelUpload(target.jobId)}
            accessibilityRole="button"
            accessibilityLabel="Cancel upload"
            testID={`btn-pending-photo-cancel-${sourceIndex}`}
            className="flex-row items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
          >
            <X size={14} color={colors.muted.foreground} />
            <Text className="text-xs text-foreground">
              {isFailed ? 'Dismiss' : 'Cancel'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function PhotoNoteCard({
  entry,
  sourceIndex,
  authorName,
  onOpen,
  onOpenOptions,
  onRetryUpload,
  onCancelUpload,
}: PhotoNoteCardProps) {
  const fileId = entry.fileId ?? null;
  const body = entry.text?.trim() ?? '';
  const pendingFiles = entry.pendingFiles ?? [];
  const hasPending = pendingFiles.length > 0;
  const resolvedCount = entry.files?.length ?? 0;
  // Treat anything with >1 file (pending or resolved) OR a mix as a
  // batch — the grid is the only layout that can express both lanes.
  const hasBatch =
    resolvedCount > 1 ||
    pendingFiles.length > 1 ||
    (resolvedCount > 0 && pendingFiles.length > 0);

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
        trailing={
          onOpenOptions && !hasPending ? (
            <NoteOptionsKebab
              noteId={sourceIndex}
              onPress={() => onOpenOptions(sourceIndex)}
            />
          ) : null
        }
      />

      {hasBatch ? (
        <PhotoBatchGrid
          entry={entry}
          onOpenFile={onOpen ? (fileId, idx) => onOpen(fileId, sourceIndex) : undefined}
        />
      ) : hasPending ? (
        <SoloPendingTile
          pending={pendingFiles[0]!}
          body={body}
          sourceIndex={sourceIndex}
        />
      ) : (
        <View className="flex-row items-start gap-3">
          <PhotoGridTile
            fileId={fileId}
            thumbnailFileId={entry.thumbnailFileId ?? null}
            size={110}
            onPress={fileId && onOpen ? () => onOpen(fileId, sourceIndex) : undefined}
            accessibilityLabel="Open photo"
            testID={`btn-open-photo-${sourceIndex}`}
          />
          {body ? (
            <Text className="flex-1 text-sm leading-5 text-foreground" selectable>
              {body}
            </Text>
          ) : null}
        </View>
      )}

      {hasPending ? (
        <PendingFooter
          pending={pendingFiles}
          sourceIndex={sourceIndex}
          onRetryUpload={onRetryUpload}
          onCancelUpload={onCancelUpload}
        />
      ) : null}
    </View>
  );
}

interface SoloPendingTileProps {
  pending: PendingFile;
  body: string;
  sourceIndex: number;
}

function SoloPendingTile({ pending, body, sourceIndex }: SoloPendingTileProps) {
  const isFailed = pending.status === 'failed';
  const progressPct = Math.max(0, Math.min(1, pending.progress)) * 100;
  return (
    <View className="flex-row items-start gap-3">
      <View
        className="relative overflow-hidden rounded-md bg-muted"
        style={{ width: 110, height: 110 }}
      >
        <CachedImage
          source={{ uri: pending.sourceUri }}
          cacheKey={pending.jobId}
          style={{ width: 110, height: 110 }}
          contentFit="cover"
          testID={`pending-photo-thumb-${sourceIndex}`}
          accessibilityLabel="Pending photo"
        />
        {!isFailed ? (
          <View
            className="absolute inset-x-0 bottom-0 h-1 bg-black/30"
            accessibilityRole="progressbar"
            accessibilityValue={{ now: Math.round(progressPct), min: 0, max: 100 }}
            testID={`pending-photo-progress-${sourceIndex}`}
          >
            <View
              className="h-1 bg-primary"
              style={{ width: `${progressPct}%` }}
            />
          </View>
        ) : null}
      </View>
      {body ? (
        <Text className="flex-1 text-sm leading-5 text-foreground" selectable>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
