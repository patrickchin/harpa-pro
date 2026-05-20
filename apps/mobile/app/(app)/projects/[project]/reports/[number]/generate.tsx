/**
 * Generate Report route — slug-native scheme (P3.1).
 *
 * Reads `project` (prj_…) + `number` from path params, fetches the
 * report draft via `useReportQuery`, and renders the props-driven
 * `GenerateNotes` screen body.
 *
 * Generate / Regenerate / Finalize are wired to the real API
 * mutations. Text notes round-trip through `useCreateNoteMutation` +
 * `useReportNotesQuery`; the local list is optimistic and gets
 * replaced when the server responds. The camera button pushes the
 * capture modal via the session-registry handoff; on return, captured
 * URIs are enqueued through the upload pipeline (presign → R2 PUT →
 * registerFile → createNote) and the notes query is invalidated so
 * image notes appear in the timeline immediately.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { GenerateNotes } from '@/screens/generate-notes';
import {
  useProjectQuery,
  useProjectMembersQuery,
  useReportQuery,
  useReportNotesQuery,
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useUpdateNoteMutation,
  useGenerateReportMutation,
  useRegenerateReportMutation,
  useFinalizeReportMutation,
  useDeleteReportMutation,
} from '@/lib/api/hooks';
import { useReportBodyAutosave } from '@/lib/use-report-body-autosave';
import type { NoteEntry } from '@/lib/note-entry';
import { uuid } from '@/lib/uuid';
import { env } from '@/lib/env';
import type { GeneratedSiteReport } from '@harpa/report-core';
import { reports } from '@harpa/api-contract';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import { reportBodyToGeneratedReport } from '@/lib/report-body-adapter';
import { safeBack } from '@/lib/nav/safe-back';
import { dismissOrReplaceTo } from '@/lib/nav/dismiss-or-replace';
import {
  consumeCameraSession,
  createCameraSession,
  findCommittedSessionsForReport,
} from '@/lib/camera-session-registry';
import { useCameraUploads } from '@/lib/camera/use-camera-uploads';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

interface ApiNote {
  id: string;
  authorId: string;
  kind: 'text' | 'voice' | 'image' | 'document';
  body: string | null;
  transcript: string | null;
  createdAt: string;
}

function noteToEntry(n: ApiNote): NoteEntry {
  const isImage = n.kind === 'image';
  const text = isImage
    ? (n.body ?? '📷 Photo')
    : (n.body ?? n.transcript ?? '');
  return {
    id: n.id,
    authorId: n.authorId,
    text,
    addedAt: Date.parse(n.createdAt) || Date.now(),
    source: n.kind === 'voice' ? 'voice' : n.kind === 'image' ? 'image' : 'text',
  };
}

export default function GenerateReportRoute() {
  const router = useRouter();
  const { project, number } = useLocalSearchParams<{
    project: string;
    number: string;
  }>();
  const slug = project ?? '';
  const parsedNumber = Number.parseInt(number ?? '', 10);
  const reportNumber = Number.isFinite(parsedNumber) ? parsedNumber : null;

  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const report = useReportQuery(
    {
      params: {
        project: slug,
        number: reportNumber ?? 0,
      },
    },
    { enabled: slug.length > 0 && reportNumber !== null },
  );

  const reportRow = report.data as
    | {
        id?: string;
        body?: reports.ReportBody | null;
        status?: 'draft' | 'finalized';
        notesSinceLastGeneration?: number;
        meta?: { title?: string | null };
      }
    | undefined;
  const reportId = reportRow?.id ?? null;

  const membersQuery = useProjectMembersQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const memberNames = useMemo<ReadonlyMap<string, string>>(() => {
    const items = (membersQuery.data as
      | { items?: ReadonlyArray<{ userId: string; displayName: string | null; phone?: string }> }
      | undefined)?.items;
    const map = new Map<string, string>();
    if (!items) return map;
    for (const m of items) {
      const name = m.displayName?.trim() || m.phone || 'Unknown';
      map.set(m.userId, name);
    }
    return map;
  }, [membersQuery.data]);

  // Server-backed notes timeline. Optimistic local additions are kept
  // alongside until the query refetches so the UI stays responsive
  // without waiting for the round-trip.
  const notesQuery = useReportNotesQuery(
    { params: { report: reportId ?? '' } },
    { enabled: reportId !== null },
  );
  const createNote = useCreateNoteMutation();
  const deleteNote = useDeleteNoteMutation();
  const updateNote = useUpdateNoteMutation();
  const [pendingNotes, setPendingNotes] = useState<NoteEntry[]>([]);

  const serverNotes = useMemo<NoteEntry[]>(() => {
    const items = (notesQuery.data as { items?: ApiNote[] } | undefined)?.items;
    if (!items) return [];
    return items.map(noteToEntry);
  }, [notesQuery.data]);

  // Drop pending entries that the server has now confirmed (by id).
  const serverIds = useMemo(
    () => new Set(serverNotes.map((n) => n.id).filter(Boolean)),
    [serverNotes],
  );
  const visibleNotes = useMemo<NoteEntry[]>(() => {
    const liveOptimistic = pendingNotes.filter(
      (n) => !n.id || !serverIds.has(n.id),
    );
    return [...serverNotes, ...liveOptimistic].sort(
      (a, b) => a.addedAt - b.addedAt,
    );
  }, [serverNotes, pendingNotes, serverIds]);

  const handleDeleteNote = useCallback(
    (note: NoteEntry, _sourceIndex: number) => {
      const noteIdValue = note.id;
      if (!noteIdValue) {
        // optimistic-only entry — just drop it locally
        setPendingNotes((prev) => prev.filter((n) => n !== note));
        return;
      }
      // Optimistic local removal — the note row vanishes immediately,
      // and refetch (invalidation) will reconcile.
      setPendingNotes((prev) => prev.filter((n) => n.id !== noteIdValue));
      deleteNote.mutate(
        { params: { note: noteIdValue } },
        {
          onError: () => {
            setUploadError('Could not delete the note. Please try again.');
          },
        },
      );
    },
    [deleteNote],
  );

  const handleUpdateNote = useCallback(
    (note: NoteEntry, _sourceIndex: number, nextBody: string) => {
      const noteIdValue = note.id;
      if (!noteIdValue) return;
      // Optimistic local patch on any pending mirror.
      setPendingNotes((prev) =>
        prev.map((n) => (n.id === noteIdValue ? { ...n, text: nextBody } : n)),
      );
      updateNote.mutate(
        { params: { note: noteIdValue }, body: { body: nextBody } },
        {
          onError: () => {
            setUploadError('Could not update the note. Please try again.');
          },
        },
      );
    },
    [updateNote],
  );

  const handleAddTextNote = useCallback(
    (body: string) => {
      if (!reportId) return;
      const optimistic: NoteEntry = {
        id: uuid(),
        text: body,
        addedAt: Date.now(),
        isPending: true,
        source: 'text',
      };
      setPendingNotes((prev) => [...prev, optimistic]);
      createNote.mutate(
        {
          params: { report: reportId },
          body: { kind: 'text', body },
        },
        {
          onSuccess: (created) => {
            const realId = (created as { id?: string } | undefined)?.id;
            // Stamp the server id onto the optimistic entry so the
            // dedup pass above evicts it once the query refetches.
            setPendingNotes((prev) =>
              prev.map((n) =>
                n === optimistic ? { ...n, id: realId ?? n.id, isPending: false } : n,
              ),
            );
          },
          onError: () => {
            setPendingNotes((prev) => prev.filter((n) => n !== optimistic));
          },
        },
      );
    },
    [reportId, createNote],
  );

  const serverBody: GeneratedSiteReport | null = reportRow?.body
    ? reportBodyToGeneratedReport(reportRow.body, reportRow.meta ?? undefined)
    : null;

  const fallbackReport: GeneratedSiteReport | null = env.EXPO_PUBLIC_USE_FIXTURES
    ? SAMPLE_GENERATED_REPORT
    : null;

  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(
    null,
  );
  // `userDirty` flips true only when the user edits a field in the
  // Edit tab — see `handleEditReport` below. Programmatic
  // setLocalReport calls (e.g. seeding from a regenerate response) do
  // NOT flip it true. The autosave hook listens to this flag instead
  // of trying to JSON-diff the local report against the server body
  // (the inverse adapter is lossy, so the diff was always non-zero
  // and produced a stuck "Saving…" label + a PATCH-spam loop).
  const [userDirty, setUserDirty] = useState(false);
  const currentReport = localReport ?? serverBody ?? fallbackReport;

  const handleEditReport = useCallback((next: GeneratedSiteReport) => {
    setLocalReport(next);
    setUserDirty(true);
  }, []);

  const handleAutoSaved = useCallback(() => {
    setUserDirty(false);
  }, []);

  const [generationError, setGenerationError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastGeneration, setLastGeneration] = useState<
    import('@/components/reports/generate/GenerateReportProvider').GenerationDebug | null
  >(null);

  const generateMutation = useGenerateReportMutation();
  const regenerateMutation = useRegenerateReportMutation();
  const finalizeMutation = useFinalizeReportMutation();

  // Stable JSON view of the server-side body was removed — the
  // autosave hook is now driven by `userDirty`, set by
  // `handleEditReport` only when the user types in the Edit tab. The
  // hook no longer needs (and never had a way to reliably compute) a
  // server-shape baseline; the inverse adapter is lossy.

  // Pause autosave while a generate/regenerate is in flight. That
  // endpoint writes `body` server-side; a concurrent PATCH would race
  // and could either clobber the AI output or get clobbered itself
  // depending on timing. React Query already queues mutations sharing
  // a key, but generate/regenerate are different hooks so we gate
  // explicitly.
  const isGenerating =
    generateMutation.isPending || regenerateMutation.isPending;

  const autosave = useReportBodyAutosave({
    slug,
    number: reportNumber,
    report: localReport,
    dirty: userDirty,
    onSaved: handleAutoSaved,
    paused: isGenerating || finalizeMutation.isPending,
  });

  const handleRegenerate = useCallback(() => {
    if (!slug || reportNumber === null) return;
    setGenerationError(null);
    const mutation = currentReport ? regenerateMutation : generateMutation;
    mutation.mutate(
      { params: { project: slug, number: reportNumber }, body: {} },
      {
        onSuccess: (data) => {
          const payload = data as
            | {
                report?: { body?: reports.ReportBody | null };
                debug?: {
                  systemPrompt?: string;
                  userPrompt?: string;
                  rawText?: string;
                  model?: string;
                  vendor?: string;
                };
              }
            | undefined;
          const nextBody = payload?.report?.body ?? null;
          if (nextBody) {
            setLocalReport(reportBodyToGeneratedReport(nextBody));
          }
          if (payload?.debug) {
            setLastGeneration({
              systemPrompt: payload.debug.systemPrompt ?? '',
              userPrompt: payload.debug.userPrompt ?? '',
              rawText: payload.debug.rawText ?? '',
              model: payload.debug.model ?? '',
              vendor: payload.debug.vendor ?? '',
            });
          }
        },
        onError: (err) => {
          setGenerationError(err.message ?? 'Generation failed.');
        },
      },
    );
  }, [slug, reportNumber, currentReport, generateMutation, regenerateMutation]);

  const handleFinalize = useCallback(() => {
    if (!slug || reportNumber === null) return;
    setFinalizeError(null);
    finalizeMutation.mutate(
      { params: { project: slug, number: reportNumber } },
      {
        onSuccess: () => {
          router.replace(
            `/(app)/projects/${slug}/reports/${reportNumber}` as never,
          );
        },
        onError: (err) => {
          setFinalizeError(err.message ?? 'Finalize failed.');
        },
      },
    );
  }, [slug, reportNumber, finalizeMutation, router]);

  // Delete-draft handler. Routes back to the reports list on success so
  // the deleted draft isn't in nav history (would 404 on swipe-back).
  // Error path keeps the dialog open via `isDeletingDraft` staying true
  // until the mutation settles; a dedicated error dialog ports in P4.
  const deleteReportMutation = useDeleteReportMutation();
  const handleDeleteDraft = useCallback(() => {
    if (!slug || reportNumber === null) return;
    deleteReportMutation.mutate(
      { params: { project: slug, number: reportNumber } },
      {
        onSuccess: () => {
          // Reports list is already on the stack — pop to it instead of
          // replacing the top, which would leave two adjacent reports-list
          // frames. See docs/v4/arch-mobile-navigation.md §4.
          dismissOrReplaceTo(router, `/(app)/projects/${slug}/reports` as never);
        },
      },
    );
  }, [slug, reportNumber, deleteReportMutation, router]);

  // Camera handoff. Push the capture modal with a session id; on focus
  // return, find any committed sessions for THIS report (the registry
  // is module-level so it survives the (app) tree remounting — root
  // uses <Slot/>, so navigating into (camera) unmounts the app tree
  // and loses local React state). Then enqueue captured URIs through
  // the upload pipeline (presign → R2 PUT → registerFile → createNote)
  // and invalidate the notes query so image notes appear in the
  // timeline immediately.
  const { enqueueCameraUris } = useCameraUploads();
  const qc = useQueryClient();
  const handleCameraCapture = useCallback(() => {
    if (!slug || reportNumber === null || !reportId) return;
    const sessionId = createCameraSession({
      returnTo: `/(app)/projects/${slug}/reports/${reportNumber}/generate`,
      context: { reportId, projectSlug: slug, reportNumber },
    });
    router.push({
      pathname: '/(camera)/capture',
      params: { sessionId },
    } as never);
  }, [slug, reportNumber, reportId, router]);

  const handlePickAttachment = useCallback(
    (_category: 'image' | 'document') => {
      setUploadError(
        'File uploads are coming soon. Add a text note for now.',
      );
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!reportId) return;
      const sessionIds = findCommittedSessionsForReport(reportId);
      if (sessionIds.length === 0) return;
      const allUris: string[] = [];
      for (const sid of sessionIds) {
        const uris = consumeCameraSession(sid);
        if (uris && uris.length > 0) allUris.push(...uris);
      }
      if (allUris.length === 0) return;
      void enqueueCameraUris(allUris, { reportId }).then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          setUploadError(
            `${failed} of ${allUris.length} photo${allUris.length === 1 ? '' : 's'} failed to upload. Open the report queue to retry.`,
          );
        }
        // Invalidate the notes query so uploaded image notes appear in
        // the timeline immediately after the pipeline completes.
        void qc.invalidateQueries({ queryKey: ['reportNotes'] });
      });
    }, [reportId, enqueueCameraUris, qc]),
  );

  const canWrite =
    projectQuery.data?.myRole === 'owner' || projectQuery.data?.myRole === 'editor';

  const reportTitleField = reportRow?.meta?.title;

  // Combine autosave + generation errors into the existing surface so
  // both bubble through `generationError`. Generation errors trump
  // autosave (the user just tried to regenerate; show them that).
  const combinedError =
    generationError ?? autosave.error ?? uploadError;

  // Surface upload-pipeline errors via the existing dialog. Wired
  // through the screen's `fileUploadError` UI surface — we mirror it
  // into the provider on render by passing the setter via the route's
  // attachment handler above and clearing it from inside the dialog
  // (AppDialogSheet handles dismissal).
  return (
    <GenerateNotes
      project={slug}
      reportNumber={reportNumber}
      reportId={reportId}
      notes={visibleNotes}
      memberNames={memberNames}
      notesLoading={report.isLoading || notesQuery.isLoading}
      onAddTextNote={handleAddTextNote}
      onDeleteNote={handleDeleteNote}
      onUpdateNote={handleUpdateNote}
      reportTitle={reportTitleField ?? null}
      canWrite={canWrite}
      onBack={() => safeBack(router, `/(app)/projects/${slug}/reports`)}
      report={currentReport}
      onSetReport={handleEditReport}
      isGeneratingReport={isGenerating}
      generationError={combinedError}
      lastGeneration={lastGeneration}
      onRegenerate={handleRegenerate}
      notesSinceLastGeneration={reportRow?.notesSinceLastGeneration ?? 0}
      isAutoSaving={autosave.isAutoSaving || userDirty}
      lastSavedAt={autosave.lastSavedAt}
      isFinalizing={finalizeMutation.isPending}
      finalizeError={finalizeError}
      onFinalize={handleFinalize}
      onCameraCapture={handleCameraCapture}
      onPickAttachment={handlePickAttachment}
      onDeleteDraft={
        reportRow?.status === 'finalized' ? undefined : handleDeleteDraft
      }
      isDeletingDraft={deleteReportMutation.isPending}
      actions={<AppHeaderActions />}
    />
  );
}
