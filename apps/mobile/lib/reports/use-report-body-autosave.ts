/**
 * useReportBodyAutosave — debounced PATCH of the per-card editor's local
 * canonical `reports.ReportBody` back to the server via
 * `useUpdateReportMutation`.
 *
 * See docs/v4/design-p3x-generate-update-finalize.md §3.6.
 *
 * **Dirty tracking is caller-owned** (intentionally). Earlier
 * iterations diffed `JSON.stringify(generatedReportToReportBody(local))`
 * against a baseline derived from the server body, but the inverse
 * adapter is lossy: the two strings were never byte-identical, so a
 * report that "looked the same" would still PATCH. Worse, every
 * post-PATCH refetch reset the baseline back to the lossy round-trip,
 * flipping dirty→clean→dirty in an infinite loop and producing a
 * PATCH-spam scenario plus a stuck "Saving…" label on the Finalize
 * button.
 *
 * Instead, the caller signals `dirty=true` from the same callback
 * `ReportEditModal` invokes when the user types. The hook serializes
 * debounced PATCHes and acknowledges the captured edit revision. The caller
 * clears dirtiness only if that revision is still its latest edit.
 *
 * `needsRegeneration` (and the legacy `notesSinceLastGeneration`) is
 * INTENTIONALLY not reset by manual edits (the API service makes the
 * same guarantee — see `services/reports.ts` updateReport). Manual
 * edits and AI generation loops are independent; only note CRUD flips
 * the dirty flag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reports } from '@harpa/api-contract';

import { useUpdateReportMutation } from '@/lib/api/hooks';

export interface UseReportBodyAutosaveInput {
  /** Project slug from the URL. Autosave disabled when empty. */
  slug: string;
  /** Per-project report number from the URL. Autosave disabled when null. */
  number: number | null;
  /**
   * The current in-memory report. When null there is nothing to autosave.
   */
  report: reports.ReportBody | null;
  /**
   * Server version the local edit was based on. Autosave remains paused
   * until the report query has supplied this concurrency precondition.
   */
  expectedUpdatedAt: string | null;
  /**
   * True iff the local report has been edited by the user since the
   * last successful save. The hook only PATCHes while this is true.
   * The caller is expected to flip it true on edit and clear it via
   * the `onSaved` callback below.
   */
  dirty: boolean;
  /** Monotonic user-edit revision, scoped to this report editor. */
  revision?: number;
  /**
   * Called after a successful PATCH so the caller can clear its
   * `dirty` flag.
   */
  onSaved?: (updatedAt: string, revision: number) => void;
  /** Debounce window in ms. Defaults to 800. */
  debounceMs?: number;
  /**
   * When true, autosave is paused even if `report` changes. Used by
   * the route to suspend persistence while a generate/regenerate
   * mutation is in flight — that endpoint already writes `body` on
   * the server, and a stale PATCH racing with it would clobber the
   * fresh AI output.
   */
  paused?: boolean;
}

export interface UseReportBodyAutosaveResult {
  /** True while a PATCH is in flight. */
  isAutoSaving: boolean;
  /** Epoch ms of the most recent successful save. */
  lastSavedAt: number | null;
  /** Most recent autosave error message, or null. */
  error: string | null;
  status: 'idle' | 'saving' | 'failed';
  retry: () => void;
}

const DEFAULT_DEBOUNCE_MS = 800;

export function useReportBodyAutosave({
  slug,
  number,
  report,
  expectedUpdatedAt,
  dirty,
  revision = 0,
  onSaved,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  paused = false,
}: UseReportBodyAutosaveInput): UseReportBodyAutosaveResult {
  const mutation = useUpdateReportMutation();
  const owner = useMemo(
    () => ({
      active: false,
      alive: true,
      version: null as string | null,
      acknowledged: null as { revision: number; body: reports.ReportBody } | null,
    }),
    [slug, number],
  );
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  type SaveState = { owner: typeof owner; lastSavedAt: number | null } & (
    | { status: 'idle'; error: null }
    | { status: 'saving'; error: null; revision: number }
    | { status: 'failed'; error: string; revision: number }
  );
  const [state, setState] = useState<SaveState>({
    owner,
    status: 'idle',
    error: null,
    lastSavedAt: null,
  });
  const current =
    state.owner === owner
      ? state
      : { owner, status: 'idle' as const, error: null, lastSavedAt: null };

  if (owner.version === null || (!dirty && !owner.active)) {
    owner.version = expectedUpdatedAt;
  }

  useEffect(() => {
    owner.alive = true;
    return () => {
      owner.alive = false;
    };
  }, [owner]);

  const retry = useCallback(() => {
    if (owner.active) return;
    setState((previous) => ({
      owner,
      status: 'idle',
      error: null,
      lastSavedAt: previous.owner === owner ? previous.lastSavedAt : null,
    }));
  }, [owner]);

  useEffect(() => {
    if (paused || !dirty || !slug || number === null || !report || !owner.version) return;
    if (owner.active || current.status === 'saving') return;
    if (current.status === 'failed' && current.revision === revision) return;
    if (owner.acknowledged?.revision === revision && owner.acknowledged.body === report) return;

    const handle = setTimeout(() => {
      if (!owner.alive || owner.active || currentOwner.current !== owner) return;
      owner.active = true;
      const lastSavedAt = current.lastSavedAt;
      setState({ owner, status: 'saving', revision, error: null, lastSavedAt });
      mutation.mutate(
        {
          params: { project: slug, number },
          body: { body: report, expectedUpdatedAt: owner.version! },
        },
        {
          onSuccess: (saved) => {
            owner.active = false;
            if (!owner.alive || currentOwner.current !== owner) return;
            owner.version = saved.updatedAt;
            owner.acknowledged = { revision, body: report };
            onSavedRef.current?.(saved.updatedAt, revision);
            setState({ owner, status: 'idle', error: null, lastSavedAt: Date.now() });
          },
          onError: (err) => {
            owner.active = false;
            if (!owner.alive || currentOwner.current !== owner) return;
            setState({
              owner,
              status: 'failed',
              revision,
              error: err.message ?? 'Autosave failed.',
              lastSavedAt,
            });
          },
        },
      );
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [
    dirty,
    paused,
    slug,
    number,
    report,
    revision,
    expectedUpdatedAt,
    debounceMs,
    owner,
    current.status,
  ]);

  return {
    isAutoSaving: current.status === 'saving',
    lastSavedAt: current.lastSavedAt,
    error: current.error,
    status: current.status,
    retry,
  };
}
