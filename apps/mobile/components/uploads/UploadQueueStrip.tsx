/**
 * `UploadQueueStrip` — compact footer chip-row that surfaces the
 * report's in-flight + failed upload jobs. Mounts inside the report
 * screen; consumes `useFileUpload()` from the same `QueueProvider`
 * the rest of the timeline binds to.
 *
 * Hidden when both `activeJobs` and `failedJobs` are empty. Active
 * jobs render an inline summary ("Uploading 2 photos…" + aggregated
 * progress). Failed jobs render per-job retry / dismiss chips so the
 * user can clear them without scrolling to the corresponding
 * `PhotoNoteCard`.
 *
 * Test scope (Pitfall 13): unit tests pass a manually-constructed
 * queue via `<QueueProvider queue={…}>` so the strip exercises the
 * real `useFileUpload()` selector logic against deterministic jobs.
 */
import { Pressable, Text, View } from 'react-native';
import { RotateCw, X } from 'lucide-react-native';

import { useOptionalUploadQueueContext } from '@/lib/uploads/QueueProvider';
import { useFileUpload } from '@/lib/uploads/useFileUpload';
import { colors } from '@/lib/design-tokens/colors';
import type { UploadJob } from '@/lib/uploads/types';

export interface UploadQueueStripProps {
  /**
   * Optional filter — when set, only jobs whose
   * `input.reportId === reportId` are surfaced. Lets the strip live
   * on a single report screen without spilling unrelated jobs.
   */
  reportId?: string;
}

function aggregateProgress(jobs: ReadonlyArray<UploadJob>): number {
  if (jobs.length === 0) return 0;
  const total = jobs.reduce((acc, j) => acc + j.progress, 0);
  return total / jobs.length;
}

export function UploadQueueStrip({ reportId }: UploadQueueStripProps = {}) {
  // Render nothing when no `<QueueProvider>` is mounted. The strip is
  // safe to drop into shared layout surfaces (e.g. screens rendered by
  // snapshot tests that don't wire the upload provider tree).
  const hasQueue = useOptionalUploadQueueContext() !== null;
  if (!hasQueue) return null;
  return <UploadQueueStripBody reportId={reportId} />;
}

function UploadQueueStripBody({ reportId }: UploadQueueStripProps) {
  const { activeJobs, failedJobs, retry, remove } = useFileUpload();

  const filteredActive = reportId
    ? activeJobs.filter((j) => j.input.reportId === reportId)
    : activeJobs;
  const filteredFailed = reportId
    ? failedJobs.filter((j) => j.input.reportId === reportId)
    : failedJobs;

  if (filteredActive.length === 0 && filteredFailed.length === 0) return null;

  const activeProgressPct = Math.round(
    aggregateProgress(filteredActive) * 100,
  );

  return (
    <View
      className="border-t border-border bg-card px-3 py-2 gap-2"
      testID="upload-queue-strip"
    >
      {filteredActive.length > 0 ? (
        <View className="gap-1" testID="upload-queue-strip-active">
          <Text
            className="text-xs text-muted-foreground"
            testID="upload-queue-strip-active-summary"
          >
            Uploading {filteredActive.length}{' '}
            {filteredActive.length === 1 ? 'photo' : 'photos'}…
          </Text>
          <View
            className="h-1 overflow-hidden rounded-full bg-muted"
            accessibilityRole="progressbar"
            accessibilityValue={{
              now: activeProgressPct,
              min: 0,
              max: 100,
            }}
            testID="upload-queue-strip-progress"
          >
            <View
              className="h-1 bg-primary"
              style={{ width: `${activeProgressPct}%` }}
            />
          </View>
        </View>
      ) : null}

      {filteredFailed.length > 0 ? (
        <View className="gap-1" testID="upload-queue-strip-failed">
          <Text className="text-xs text-danger-foreground">
            {filteredFailed.length} upload
            {filteredFailed.length === 1 ? '' : 's'} failed
          </Text>
          <View className="flex-row flex-wrap gap-1">
            {filteredFailed.map((job, idx) => (
              <View
                key={job.id}
                className="flex-row items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
                testID={`upload-queue-strip-failed-chip-${idx}`}
              >
                <Text
                  className="max-w-[140px] text-xs text-foreground"
                  numberOfLines={1}
                >
                  {job.input.filename}
                </Text>
                <Pressable
                  onPress={() => {
                    void retry(job.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Retry upload ${job.input.filename}`}
                  testID={`btn-upload-queue-strip-retry-${idx}`}
                  className="rounded-full p-1"
                >
                  <RotateCw size={12} color={colors.muted.foreground} />
                </Pressable>
                <Pressable
                  onPress={() => remove(job.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss failed upload ${job.input.filename}`}
                  testID={`btn-upload-queue-strip-dismiss-${idx}`}
                  className="rounded-full p-1"
                >
                  <X size={12} color={colors.muted.foreground} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
