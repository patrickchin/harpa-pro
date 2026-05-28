/**
 * Optimistic React Query wrappers for the note-CRUD endpoints.
 *
 * The generated mutation hooks in `hooks.ts` are intentionally dumb —
 * they call `request()`, then run the central invalidation rule on
 * success. That's correct for the default "server-confirmed" policy
 * the data-layer doc describes; this file is where we opt specific
 * mutations into optimistic UI on top of that base.
 *
 * Pattern (per `arch-data-layer.md` §Optimistic updates):
 *   onMutate:   cancel inflight `reportNotes` queries, snapshot every
 *               cached page, write the optimistic patch, return
 *               snapshot as `context`.
 *   onError:    restore each snapshot from `context` (rollback).
 *   onSettled:  invalidate `reportNotes` (the generated hook also
 *               invalidates on success — we re-fire on settle so
 *               error paths still reconcile with the server).
 *
 * Optimistic rows carry a temp `id` ("not_opt_<uuid>") so the cache
 * dedup knows which row to swap when the create response lands. The
 * temp id intentionally matches the same `not_` prefix shape so any
 * downstream code that key-tests on the prefix doesn't break.
 *
 * Why a separate file (not embedded in the generated hook):
 *  - Keeps `hooks.ts` machine-generated and small.
 *  - Optimism is a UX policy; only some screens want it. Mounting it
 *    as the default would mean every consumer pays the cancel/snapshot
 *    cost even when they don't care.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { request, type RequestBody, type ResponseBody } from './client';
import type { ApiError } from './errors';
import { runInvalidations } from './invalidation';
import { useAuthSession } from '@/lib/auth';
import { isOptimisticReportId as isOptimisticReportIdPure } from '@/lib/projects/project-reports-list';
import { uuid } from '@/lib/util/uuid';

type NotesPage = ResponseBody<'/reports/{report}/notes', 'get'>;
type Note = NotesPage['items'][number];

type CreateNoteBody = RequestBody<'/reports/{report}/notes', 'post'>;
type UpdateNoteBody = RequestBody<'/notes/{note}', 'patch'>;
type CreateNoteResponse = ResponseBody<'/reports/{report}/notes', 'post'>;
type UpdateNoteResponse = ResponseBody<'/notes/{note}', 'patch'>;
type DeleteNoteResponse = ResponseBody<'/notes/{note}', 'delete'>;

type ReportsPage = ResponseBody<'/projects/{project}/reports', 'get'>;
type Report = ReportsPage['items'][number];
type CreateReportBody = RequestBody<'/projects/{project}/reports', 'post'>;
type CreateReportResponse = ResponseBody<'/projects/{project}/reports', 'post'>;

/** Snapshot of every `reportNotes` query page captured in `onMutate`. */
type NotesSnapshot = ReadonlyArray<[QueryKey, NotesPage | undefined]>;

const REPORT_NOTES_KEY = ['reportNotes'] as const;

/**
 * `not_` prefix matches the server id shape so prefix-based code (slug
 * routing, fixtures) treats optimistic rows the same as real ones.
 * The body is a uuid so it's unique per mutation.
 */
export function optimisticNoteId(): string {
  return `not_opt${uuid().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * True iff `id` was produced by `optimisticNoteId` — i.e. the row
 * exists only in the local cache and has no server backing yet.
 */
export function isOptimisticNoteId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('not_opt');
}

function snapshotNotesQueries(qc: ReturnType<typeof useQueryClient>): NotesSnapshot {
  return qc.getQueriesData<NotesPage>({ queryKey: REPORT_NOTES_KEY }) as NotesSnapshot;
}

function restoreNotesQueries(
  qc: ReturnType<typeof useQueryClient>,
  snapshot: NotesSnapshot,
): void {
  for (const [key, data] of snapshot) {
    qc.setQueryData<NotesPage>(key, data);
  }
}

function updateAllNotesQueries(
  qc: ReturnType<typeof useQueryClient>,
  reportId: string,
  mutator: (page: NotesPage) => NotesPage,
): void {
  qc.setQueriesData<NotesPage>({ queryKey: REPORT_NOTES_KEY }, (page) => {
    if (!page) return page;
    // Each `reportNotes` query is keyed on a specific reportId, so we
    // only mutate pages whose first item (or empty list with the same
    // params) belongs to this report. Cheap heuristic: if items have
    // a `reportId` field, match on that; otherwise touch all pages.
    const items = page.items;
    if (items.length > 0 && items[0]!.reportId !== reportId) return page;
    return mutator(page);
  });
}

// ─── useOptimisticCreateNote ─────────────────────────────────

export interface OptimisticCreateNoteVars {
  params: { report: string };
  body: CreateNoteBody;
}

/**
 * Optimistic `POST /reports/{report}/notes`. Inserts a temp row into
 * every cached `reportNotes` page immediately; rolls back on error;
 * runs the standard invalidation on settle so the real row replaces
 * the temp one.
 */
export function useOptimisticCreateNote() {
  const qc = useQueryClient();
  const { user } = useAuthSession();
  return useMutation<
    CreateNoteResponse,
    ApiError,
    OptimisticCreateNoteVars,
    { snapshot: NotesSnapshot; tempId: string }
  >({
    mutationFn: (vars) =>
      request('/reports/{report}/notes', 'post', {
        params: vars.params,
        body: vars.body,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: REPORT_NOTES_KEY });
      const snapshot = snapshotNotesQueries(qc);
      const tempId = optimisticNoteId();
      const now = new Date().toISOString();
      const optimisticNote: Note = {
        id: tempId,
        reportId: vars.params.report,
        authorId: user?.id ?? 'usr_optimistic',
        kind: vars.body.kind,
        body: vars.body.kind === 'text' ? (vars.body.body ?? null) : null,
        fileId: null,
        thumbnailFileId: null,
        files: [],
        transcript: null,
        // Generic + voice-only fields are nullable on the wire and the
        // server returns the keys with `null` for unset values. We
        // mirror that so the local optimistic row is shape-identical
        // to what the server will return on success.
        title: null,
        summary: null,
        durationSec: null,
        language: null,
        transcribeProvider: null,
        transcribedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      updateAllNotesQueries(qc, vars.params.report, (page) => ({
        ...page,
        items: [...page.items, optimisticNote],
      }));
      return { snapshot, tempId };
    },
    onError: (_err, _vars, context) => {
      if (context) restoreNotesQueries(qc, context.snapshot);
    },
    onSuccess: (created, vars, context) => {
      // Swap the temp row for the server response in-place. Even though
      // `onSettled` will refetch, doing this synchronously means the
      // UI updates before the network round-trip and avoids a flicker.
      updateAllNotesQueries(qc, vars.params.report, (page) => ({
        ...page,
        items: page.items.map((n) =>
          n.id === context?.tempId ? (created as Note) : n,
        ),
      }));
    },
    onSettled: () => {
      runInvalidations(qc, 'useCreateNoteMutation');
    },
  });
}

// ─── useOptimisticUpdateNote ─────────────────────────────────

export interface OptimisticUpdateNoteVars {
  params: { note: string };
  body: UpdateNoteBody;
  /** Required so we can target the right `reportNotes` page. */
  reportId: string;
}

export function useOptimisticUpdateNote() {
  const qc = useQueryClient();
  return useMutation<
    UpdateNoteResponse,
    ApiError,
    OptimisticUpdateNoteVars,
    { snapshot: NotesSnapshot }
  >({
    mutationFn: (vars) =>
      request('/notes/{note}', 'patch', {
        params: vars.params,
        body: vars.body,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: REPORT_NOTES_KEY });
      const snapshot = snapshotNotesQueries(qc);
      updateAllNotesQueries(qc, vars.reportId, (page) => ({
        ...page,
        items: page.items.map((n) =>
          n.id === vars.params.note
            ? {
                ...n,
                ...('body' in vars.body && vars.body.body !== undefined
                  ? { body: vars.body.body }
                  : {}),
                updatedAt: new Date().toISOString(),
              }
            : n,
        ),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context) restoreNotesQueries(qc, context.snapshot);
    },
    onSettled: () => {
      runInvalidations(qc, 'useUpdateNoteMutation');
    },
  });
}

// ─── useOptimisticDeleteNote ─────────────────────────────────

export interface OptimisticDeleteNoteVars {
  params: { note: string };
  /** Required so we can target the right `reportNotes` page. */
  reportId: string;
}

export function useOptimisticDeleteNote() {
  const qc = useQueryClient();
  return useMutation<
    DeleteNoteResponse,
    ApiError,
    OptimisticDeleteNoteVars,
    { snapshot: NotesSnapshot }
  >({
    mutationFn: (vars) =>
      request('/notes/{note}', 'delete', { params: vars.params }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: REPORT_NOTES_KEY });
      const snapshot = snapshotNotesQueries(qc);
      updateAllNotesQueries(qc, vars.reportId, (page) => ({
        ...page,
        items: page.items.filter((n) => n.id !== vars.params.note),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context) restoreNotesQueries(qc, context.snapshot);
    },
    onSettled: () => {
      runInvalidations(qc, 'useDeleteNoteMutation');
    },
  });
}

// ─── useOptimisticCreateReport ───────────────────────────────

type ReportsSnapshot = ReadonlyArray<[QueryKey, ReportsPage | undefined]>;

const PROJECT_REPORTS_KEY = ['projectReports'] as const;

/**
 * `rep_opt` prefix mirrors the server `rep_` id shape but stays
 * easy to detect locally so the list can render an in-flight state
 * (no nav, no swipe actions) until the real id arrives.
 */
export function optimisticReportId(): string {
  return `rep_opt${uuid().replace(/-/g, '').slice(0, 12)}`;
}

export function isOptimisticReportId(id: string | undefined | null): boolean {
  return isOptimisticReportIdPure(id);
}

function snapshotReportsQueries(qc: ReturnType<typeof useQueryClient>): ReportsSnapshot {
  return qc.getQueriesData<ReportsPage>({ queryKey: PROJECT_REPORTS_KEY }) as ReportsSnapshot;
}

function restoreReportsQueries(
  qc: ReturnType<typeof useQueryClient>,
  snapshot: ReportsSnapshot,
): void {
  for (const [key, data] of snapshot) {
    qc.setQueryData<ReportsPage>(key, data);
  }
}

function updateProjectReportsQueries(
  qc: ReturnType<typeof useQueryClient>,
  project: string,
  mutator: (page: ReportsPage) => ReportsPage,
): void {
  // RQ v5 `setQueriesData` updaters don't receive the query key, so we
  // resolve matching queries first and then narrow by params.project
  // before calling `setQueryData` per-key. This keeps optimistic
  // writes scoped to the project the user is creating a report for —
  // a different cached project list MUST not be touched.
  const matches = qc.getQueriesData<ReportsPage>({ queryKey: PROJECT_REPORTS_KEY });
  for (const [key, page] of matches) {
    if (!page) continue;
    const params = Array.isArray(key) ? (key[1] as { project?: string } | undefined) : undefined;
    if (params?.project && params.project !== project) continue;
    qc.setQueryData<ReportsPage>(key, mutator(page));
  }
}

export interface OptimisticCreateReportVars {
  params: { project: string };
  body: CreateReportBody;
}

/**
 * Optimistic `POST /projects/{project}/reports`. Inserts a temp draft
 * row into every cached `projectReports` page immediately so the
 * "New report" tap shows a draft card before the network round-trip
 * completes. Rolls back on error; swaps the temp row for the server
 * response on success; invalidates on settle to reconcile.
 */
export function useOptimisticCreateReport() {
  const qc = useQueryClient();
  return useMutation<
    CreateReportResponse,
    ApiError,
    OptimisticCreateReportVars,
    { snapshot: ReportsSnapshot; tempId: string }
  >({
    mutationFn: (vars) =>
      request('/projects/{project}/reports', 'post', {
        params: vars.params,
        body: vars.body,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: PROJECT_REPORTS_KEY });
      const snapshot = snapshotReportsQueries(qc);
      const tempId = optimisticReportId();
      const now = new Date().toISOString();
      // `number` is server-assigned. We use a sentinel high value so
      // the optimistic row sorts to the top of the drafts section
      // (`buildReportsSections` sorts by `createdAt` desc, so `now`
      // already wins — `number` is only shown in the row title).
      const optimisticReport: Report = {
        id: tempId,
        number: 0,
        projectId: '',
        status: 'draft',
        visitDate: vars.body?.visitDate ?? null,
        body: null,
        notesSinceLastGeneration: 0,
        notesChangedAt: null,
        needsRegeneration: false,
        generatedAt: null,
        finalizedAt: null,
        pdfUrl: null,
        createdAt: now,
        updatedAt: now,
      };
      updateProjectReportsQueries(qc, vars.params.project, (page) => ({
        ...page,
        items: [optimisticReport, ...page.items],
      }));
      return { snapshot, tempId };
    },
    onError: (_err, _vars, context) => {
      if (context) restoreReportsQueries(qc, context.snapshot);
    },
    onSuccess: (created, vars, context) => {
      updateProjectReportsQueries(qc, vars.params.project, (page) => ({
        ...page,
        items: page.items.map((r) =>
          r.id === context?.tempId ? (created as Report) : r,
        ),
      }));
    },
    onSettled: () => {
      runInvalidations(qc, 'useCreateReportMutation');
    },
  });
}
