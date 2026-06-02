/**
 * Centralised React Query invalidation rules.
 *
 * Every mutation hook generated into `hooks.ts` MUST have an entry here so
 * we never forget to refresh the relevant lists/details after a write.
 * `invalidation.test.ts` walks the generated hooks and asserts coverage —
 * it fails CI if a new mutation lands without a rule.
 *
 * Convention:
 *  - Each value is a list of query-key prefixes to invalidate (matched
 *    against the head of the keys via `queryKey: [head, ...rest]`).
 *  - Use `INVALIDATIONS_NONE` for the rare mutation that legitimately
 *    invalidates nothing (e.g. fire-and-forget logout that's followed by
 *    a full session reset). Explicit > silent omission.
 */

import type { QueryClient } from '@tanstack/react-query';

export const INVALIDATIONS_NONE = Symbol('no invalidation');
export type InvalidationRule = readonly string[] | typeof INVALIDATIONS_NONE;

export const INVALIDATIONS: Record<string, InvalidationRule> = {
  useUpdateMeMutation: ['me'],

  // projects
  useCreateProjectMutation: ['projects'],
  useUpdateProjectMutation: ['projects', 'project'],
  useDeleteProjectMutation: ['projects', 'project'],
  useAddProjectMemberMutation: ['projectMembers', 'project'],
  useRemoveProjectMemberMutation: ['projectMembers', 'project'],
  useUpdateProjectMemberMutation: ['projectMembers', 'project'],

  // reports
  useCreateReportMutation: ['projectReports', 'project'],
  useUpdateReportMutation: ['report', 'projectReports'],
  useDeleteReportMutation: ['report', 'projectReports'],
  useGenerateReportMutation: ['report', 'reportDebug'],
  useRegenerateReportMutation: ['report', 'reportDebug'],
  useFinalizeReportMutation: ['report', 'projectReports'],
  useUnfinalizeReportMutation: ['report', 'projectReports'],
  useReportPdfMutation: ['report'],

  // notes
  useCreateNoteMutation: ['reportNotes', 'report'],
  useUpdateNoteMutation: ['reportNotes', 'report'],
  useDeleteNoteMutation: ['reportNotes', 'report'],
  useAppendFilesMutation: ['reportNotes'],

  // files
  usePresignFileMutation: INVALIDATIONS_NONE,
  useCreateFileMutation: INVALIDATIONS_NONE,

  // voice (read-only style mutations against AI; no caches to bust)
  useTranscribeVoiceMutation: INVALIDATIONS_NONE,
  useSummarizeVoiceMutation: INVALIDATIONS_NONE,
  // voice aggregator: creates a note row (busts note caches) and
  // bumps `notesSinceLastGeneration` on the report (bust report cache).
  useCreateVoiceNoteMutation: ['reportNotes', 'report'],

  // settings
  useUpdateAiSettingsMutation: ['aiSettings'],
};

/**
 * Look up an invalidation rule. Returns `null` if the hook isn't
 * registered — the test treats `null` as a failure.
 */
export function invalidationsFor(hookName: string): InvalidationRule | null {
  return Object.prototype.hasOwnProperty.call(INVALIDATIONS, hookName)
    ? INVALIDATIONS[hookName]!
    : null;
}

/**
 * Run the invalidation rule for `hookName` against `qc`. Mirrors the
 * loop embedded in every generated mutation hook in `hooks.ts`, so
 * non-React callers (the voice pipeline, the upload queue worker)
 * can fire the same cache-bust without forking the rule list.
 *
 * Throws if `hookName` has no entry — same contract as
 * `invalidation.test.ts` enforces for generated hooks.
 */
export function runInvalidations(qc: QueryClient, hookName: string): void {
  const rule = invalidationsFor(hookName);
  if (rule === null) {
    throw new Error(
      `runInvalidations: no rule registered for "${hookName}". ` +
        `Add it to INVALIDATIONS or use INVALIDATIONS_NONE.`,
    );
  }
  if (rule === INVALIDATIONS_NONE) return;
  for (const head of rule) {
    qc.invalidateQueries({ queryKey: [head] });
  }
}

/**
 * Cache-bust helper for the upload-queue side door. Photo / document
 * uploads land via `presign → R2 PUT → POST /files → POST /notes`
 * imperatively (not through a React Query mutation), so the central
 * `INVALIDATIONS` loop never fires. Call this when a queued upload
 * finishes so the timeline picks up the new image-note rows.
 *
 * Kept next to `INVALIDATIONS` on purpose — same source of truth.
 */
export function invalidateAfterFileUpload(
  qc: QueryClient,
  _opts: { reportId: string },
): void {
  // Matches the `useCreateNoteMutation` rule head — the queue worker
  // ultimately calls `POST /reports/{report}/notes`, so we mirror its
  // declared invalidations.
  for (const head of ['reportNotes', 'report'] as const) {
    qc.invalidateQueries({ queryKey: [head] });
  }
}
