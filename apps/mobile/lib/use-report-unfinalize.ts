/**
 * `useReportUnfinalize` — TanStack mutation hook that flips a finalized
 * saved report back to draft via
 * `POST /projects/{project}/reports/{number}/unfinalize`.
 *
 * The route is shipped on a parallel branch in P3.15.3; the
 * `@harpa/api-contract` types may not yet describe it. We call the API
 * via the same low-level `request()` used by the generated hooks
 * (so auth + base-URL + error mapping are identical), and apply the
 * same invalidation rule the finalize mutation uses (`["report",
 * "projectReports"]`) so the saved-report query refetches once the
 * server flips status.
 *
 * Lives outside `lib/api/hooks.ts` because that file is auto-generated
 * by `gen-hooks.ts` from the OpenAPI spec and tested for full
 * invalidation coverage (`invalidation.test.ts`); putting an
 * un-generated hook in there would break the spec-drift gate. Once the
 * api-contract regenerates with the new route this hook can move into
 * the generated file verbatim — see TODO below.
 */
// TODO(P3.15.3-contract): swap the local `unknown` cast for the
// generated `paths['/projects/{project}/reports/{number}/unfinalize']`
// type once `pnpm gen:api` produces it; remove this file and replace
// usages with the generated `useUnfinalizeReportMutation`.
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { request } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

export interface UnfinalizeReportParams {
  /** Project slug. */
  project: string;
  /** Per-project report number. */
  number: number;
}

export type UnfinalizeReportResult = void;

export function useReportUnfinalize(
  options?: UseMutationOptions<
    UnfinalizeReportResult,
    ApiError,
    { params: UnfinalizeReportParams }
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    UnfinalizeReportResult,
    ApiError,
    { params: UnfinalizeReportParams }
  >({
    mutationFn: async (vars) => {
      // Cast the path through `unknown` so the call type-checks even
      // when api-contract `paths` hasn't been regenerated to include
      // the new route yet (see TODO(P3.15.3-contract) above).
      await request(
        '/projects/{project}/reports/{number}/unfinalize' as unknown as never,
        'post' as never,
        { params: vars.params as unknown as never },
      );
    },
    ...options,
    onSuccess: (...args) => {
      // Mirror `useFinalizeReportMutation`'s invalidation rule so the
      // detail view + list views both refetch.
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['projectReports'] });
      return options?.onSuccess?.(...args);
    },
  });
}
