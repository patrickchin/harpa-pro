/**
 * useReportBodyAutosave — debounced PATCH of the Edit-tab's local
 * `GeneratedSiteReport` back to the server via
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
 * `<ReportEditForm>` invokes when the user types. The hook fires a
 * debounced PATCH and, on success, calls `onSaved` so the caller can
 * clear its own dirty flag.
 *
 * `notesSinceLastGeneration` is INTENTIONALLY not reset by manual
 * edits (the API service makes the same guarantee — see
 * `services/reports.ts` updateReport). Manual edits and AI loops are
 * independent.
 */
import { useEffect, useState } from 'react';

import { useUpdateReportMutation } from '@/lib/api/hooks';
import { generatedReportToReportBody } from '@/lib/report-body-adapter';
import type { GeneratedSiteReport } from '@harpa/report-core';

export interface UseReportBodyAutosaveInput {
  /** Project slug from the URL. Autosave disabled when empty. */
  slug: string;
  /** Per-project report number from the URL. Autosave disabled when null. */
  number: number | null;
  /**
   * The current in-memory report. When null we treat the user as not
   * having opened the Edit tab yet and skip autosave entirely.
   */
  report: GeneratedSiteReport | null;
  /**
   * True iff the local report has been edited by the user since the
   * last successful save. The hook only PATCHes while this is true.
   * The caller is expected to flip it true on edit and clear it via
   * the `onSaved` callback below.
   */
  dirty: boolean;
  /**
   * Called after a successful PATCH so the caller can clear its
   * `dirty` flag.
   */
  onSaved?: () => void;
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
}

const DEFAULT_DEBOUNCE_MS = 800;

export function useReportBodyAutosave({
  slug,
  number,
  report,
  dirty,
  onSaved,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  paused = false,
}: UseReportBodyAutosaveInput): UseReportBodyAutosaveResult {
  const mutation = useUpdateReportMutation();

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paused) return;
    if (!dirty) return;
    if (!slug || number === null) return;
    if (!report) return;

    const handle = setTimeout(() => {
      const body = generatedReportToReportBody(report);
      setError(null);
      mutation.mutate(
        { params: { project: slug, number }, body: { body } },
        {
          onSuccess: () => {
            setLastSavedAt(Date.now());
            onSaved?.();
          },
          onError: (err) => {
            setError(err.message ?? 'Autosave failed.');
          },
        },
      );
    }, debounceMs);

    return () => clearTimeout(handle);
    // mutation is stable across renders (TanStack Query memoizes the
    // returned object). We omit it from deps to avoid re-creating the
    // timer on unrelated re-renders. `onSaved` is caller-owned; we
    // intentionally don't depend on it so a re-bound callback doesn't
    // restart the debounce.
  }, [dirty, paused, slug, number, report, debounceMs]);

  return {
    isAutoSaving: mutation.isPending,
    lastSavedAt,
    error,
  };
}
