/**
 * `PendingPhotoCard` — optimistic timeline row for an image upload
 * that has not yet completed (no server note exists yet).
 *
 * Renders the local source URI as a thumbnail (no signed-URL fetch,
 * the bytes never leave the device until R2 PUT) and overlays a
 * progress bar driven by `job.progress` plus a status label derived
 * from `job.status`. Failed jobs surface a retry + cancel pair; in-
 * flight jobs surface cancel only.
 *
 * Reconciliation: once the queue completes the job, `useFileUpload()`
 * stops listing it as active and the real `ImageNoteCard` row takes
 * over (driven by `reportNotes` invalidation). The parent timeline
 * places `PendingPhotoCard` rows above committed notes; ordering by
 * job createdAt is the caller's responsibility.
 */
import { Pressable, Text, View } from 'react-native';
import { RotateCw, X } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { colors } from '@/lib/design-tokens/colors';
import type { UploadJob } from '@/lib/uploads/types';

export interface PendingPhotoCardProps {
  job: UploadJob;
  sourceIndex: number;
  authorName?: string;
  /** Retry the job (only meaningful for `failed`). */
  onRetry?: (jobId: string) => void;
  /** Cancel the job — removes it from the queue snapshot. */
  onCancel?: (jobId: string) => void;
}

function statusLabel(status: UploadJob['status']): string {
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
  }
}

export function PendingPhotoCard({
  job,
  sourceIndex,
  authorName,
  onRetry,
  onCancel,
}: PendingPhotoCardProps) {
  const isFailed = job.status === 'failed';
  const progressPct = Math.max(0, Math.min(1, job.progress)) * 100;

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`pending-photo-card-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={Date.now()}
        testIDSuffix={`pending-${sourceIndex}`}
      />
      <View className="relative overflow-hidden rounded-md">
        <CachedImage
          source={{ uri: job.input.sourceUri }}
          cacheKey={job.id}
          style={{ width: '100%', height: 200 }}
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
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className={
            isFailed
              ? 'flex-1 text-xs text-danger-foreground'
              : 'flex-1 text-xs text-muted-foreground'
          }
          numberOfLines={2}
          testID={`pending-photo-status-${sourceIndex}`}
        >
          {isFailed && job.error ? job.error : statusLabel(job.status)}
        </Text>
        <View className="flex-row gap-1">
          {isFailed && onRetry ? (
            <Pressable
              onPress={() => onRetry(job.id)}
              accessibilityRole="button"
              accessibilityLabel="Retry upload"
              testID={`btn-pending-photo-retry-${sourceIndex}`}
              className="flex-row items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
            >
              <RotateCw size={14} color={colors.muted.foreground} />
              <Text className="text-xs text-foreground">Retry</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable
              onPress={() => onCancel(job.id)}
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
    </View>
  );
}
