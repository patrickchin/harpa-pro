/**
 * Prefetch helpers for list → detail navigation.
 *
 * Fire these from `onPressIn` on list rows so the detail GET is in
 * flight before the new route mounts. By the time the destination
 * screen's hook runs, TanStack Query already has (or is about to
 * have) a cache entry under the matching key, and `useQuery` returns
 * the cached row immediately.
 *
 * CRITICAL: every prefetch here must mirror the EXACT `queryKey`
 * shape used by the corresponding generated hook in `hooks.ts`
 * (`[head, input.params, input.query]`). A key mismatch silently
 * populates a different cache entry and the destination screen still
 * shows a spinner. See `prefetch.test.tsx` for the contract.
 *
 * Best-effort: prefetches never throw to the caller. A failed
 * prefetch just means the destination hook fetches normally.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { request } from './client';

const PREFETCH_STALE_MS = 30_000;

/**
 * Prefetch a single project by slug.
 *
 * Mirrors `useProjectQuery({ params: { project } })`.
 */
export function usePrefetchProject(): (project: string) => void {
  const qc = useQueryClient();
  return useCallback(
    (project: string) => {
      if (!project) return;
      void qc.prefetchQuery({
        queryKey: ['project', { project }, undefined],
        queryFn: ({ signal }) =>
          request('/projects/{project}', 'get', {
            params: { project },
            signal,
          }),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    [qc],
  );
}

/**
 * Prefetch the report list for a project.
 *
 * Mirrors `useProjectReportsQuery({ params: { project } })`.
 */
export function usePrefetchProjectReports(): (project: string) => void {
  const qc = useQueryClient();
  return useCallback(
    (project: string) => {
      if (!project) return;
      void qc.prefetchQuery({
        queryKey: ['projectReports', { project }, undefined],
        queryFn: ({ signal }) =>
          request('/projects/{project}/reports', 'get', {
            params: { project },
            signal,
          }),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    [qc],
  );
}

/**
 * Prefetch a single report by `(project, number)`.
 *
 * Mirrors `useReportQuery({ params: { project, number } })`.
 *
 * Note: `useReportNotesQuery` keys off the resolved report id, which
 * we don't have until the report row itself is fetched — so report
 * notes aren't prefetchable from the list. The first render of the
 * detail screen still kicks them off; the report itself being warm
 * is the bigger win.
 */
export function usePrefetchReport(): (
  project: string,
  number: number,
) => void {
  const qc = useQueryClient();
  return useCallback(
    (project: string, number: number) => {
      if (!project || !Number.isFinite(number)) return;
      void qc.prefetchQuery({
        queryKey: ['report', { project, number }, undefined],
        queryFn: ({ signal }) =>
          request('/projects/{project}/reports/{number}', 'get', {
            params: { project, number },
            signal,
          }),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    [qc],
  );
}

/**
 * Prefetch project members.
 *
 * Mirrors `useProjectMembersQuery({ params: { project } })`.
 */
export function usePrefetchProjectMembers(): (project: string) => void {
  const qc = useQueryClient();
  return useCallback(
    (project: string) => {
      if (!project) return;
      void qc.prefetchQuery({
        queryKey: ['projectMembers', { project }, undefined],
        queryFn: ({ signal }) =>
          request('/projects/{project}/members', 'get', {
            params: { project },
            signal,
          }),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    [qc],
  );
}
