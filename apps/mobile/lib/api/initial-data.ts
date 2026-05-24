/**
 * `initialData` helpers for detail screens.
 *
 * When a user arrives at a detail screen from a list, the row we
 * need to render is already in the list cache. Seeding the detail
 * query's `initialData` from that list entry makes the first render
 * paint immediately instead of showing a spinner while the (usually
 * redundant) detail GET completes.
 *
 * CRITICAL: callers MUST also pass `initialDataUpdatedAt` (read from
 * the list query's `dataUpdatedAt`) — without it, TanStack Query
 * treats `initialData` as freshly fetched and skips the background
 * revalidation we want. See:
 *   https://tanstack.com/query/v5/docs/framework/react/guides/initial-query-data#initial-data-from-cache
 *
 * Both helpers are pure reads; they never mutate the cache.
 *
 * List responses are paginated envelopes `{ items: [...], nextCursor }`
 * — we walk every cached variant of the list query and search across
 * pages, returning the first match.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { ResponseBody } from './client';

type Project = ResponseBody<'/projects/{project}', 'get'>;
type Report = ResponseBody<'/projects/{project}/reports/{number}', 'get'>;

type ListEnvelope<Row> = { items?: ReadonlyArray<Row> } | ReadonlyArray<Row>;

function rows<Row>(data: unknown): ReadonlyArray<Row> {
  if (Array.isArray(data)) return data as ReadonlyArray<Row>;
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { items?: unknown }).items)
  ) {
    return (data as { items: ReadonlyArray<Row> }).items;
  }
  return [];
}

/**
 * Find a project by slug (== `id` post-P3.1) in any cached
 * list-projects query.
 */
export function projectInitialData(
  qc: QueryClient,
  project: string,
): Project | undefined {
  if (!project) return undefined;
  const entries = qc.getQueriesData<ListEnvelope<Project>>({
    queryKey: ['projects'],
  });
  for (const [, data] of entries) {
    for (const row of rows<Project>(data)) {
      if (row && row.id === project) return row;
    }
  }
  return undefined;
}

/**
 * `dataUpdatedAt` of the most-recently-updated `['projects', …]`
 * cache entry. Pass to `useProjectQuery`'s `initialDataUpdatedAt`
 * option so background refetch still fires when the seed is stale.
 */
export function projectInitialDataUpdatedAt(qc: QueryClient): number | undefined {
  const entries = qc.getQueriesData<unknown>({ queryKey: ['projects'] });
  let max = 0;
  for (const [key] of entries) {
    const state = qc.getQueryState(key);
    if (state && state.dataUpdatedAt > max) max = state.dataUpdatedAt;
  }
  return max || undefined;
}

/**
 * Find a report by `(project, number)` in any cached
 * `['projectReports', { project }, …]` query.
 */
export function reportInitialData(
  qc: QueryClient,
  project: string,
  number: number,
): Report | undefined {
  if (!project || !Number.isFinite(number)) return undefined;
  const entries = qc.getQueriesData<ListEnvelope<Report>>({
    queryKey: ['projectReports', { project }],
  });
  for (const [, data] of entries) {
    for (const row of rows<Report>(data)) {
      if (row && row.number === number) return row;
    }
  }
  return undefined;
}

export function reportInitialDataUpdatedAt(
  qc: QueryClient,
  project: string,
): number | undefined {
  const entries = qc.getQueriesData<unknown>({
    queryKey: ['projectReports', { project }],
  });
  let max = 0;
  for (const [key] of entries) {
    const state = qc.getQueryState(key);
    if (state && state.dataUpdatedAt > max) max = state.dataUpdatedAt;
  }
  return max || undefined;
}
