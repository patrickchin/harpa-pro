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

export const INVALIDATIONS_NONE = Symbol('no invalidation');
export type InvalidationRule = readonly string[] | typeof INVALIDATIONS_NONE;

export const INVALIDATIONS: Record<string, InvalidationRule> = {
  // auth
  useStartOtpMutation: INVALIDATIONS_NONE,
  useVerifyOtpMutation: ['me'],
  useLogoutMutation: INVALIDATIONS_NONE,
  useUpdateMeMutation: ['me'],

  // projects
  useCreateProjectMutation: ['projects'],
  useUpdateProjectMutation: ['projects', 'project'],
  useDeleteProjectMutation: ['projects', 'project'],
  useAddProjectMemberMutation: ['projectMembers', 'project'],
  useRemoveProjectMemberMutation: ['projectMembers', 'project'],

  // reports
  useCreateReportMutation: ['projectReports', 'project'],
  useUpdateReportMutation: ['report', 'projectReports'],
  useDeleteReportMutation: ['report', 'projectReports'],
  useGenerateReportMutation: ['report'],
  useRegenerateReportMutation: ['report'],
  useFinalizeReportMutation: ['report', 'projectReports'],
  useReportPdfMutation: ['report'],

  // notes
  useCreateNoteMutation: ['reportNotes', 'report'],
  useUpdateNoteMutation: ['reportNotes', 'report'],
  useDeleteNoteMutation: ['reportNotes', 'report'],

  // files
  usePresignFileMutation: INVALIDATIONS_NONE,
  useCreateFileMutation: INVALIDATIONS_NONE,

  // voice (read-only style mutations against AI; no caches to bust)
  useTranscribeVoiceMutation: INVALIDATIONS_NONE,
  useSummarizeVoiceMutation: INVALIDATIONS_NONE,

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
