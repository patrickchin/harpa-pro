/**
 * Generate Report route — slug-native scheme (P3.1).
 *
 * Reads `project` (prj_…) + `number` from path params, fetches the report
 * draft via `useReportQuery`, and renders the props-driven
 * `GenerateNotes` screen body.
 *
 * Notes still live in route-local state — `useReportNotesQuery` /
 * `useReportNotesMutations` aren't ported yet (lands with the notes
 * mutation hooks).
 *
 * Generate / Regenerate / Finalize are now wired to the real API
 * mutations (`useGenerateReportMutation`, `useRegenerateReportMutation`,
 * `useFinalizeReportMutation`); the report body is read straight off
 * `useReportQuery().data.body`. Fixture mode still falls back to the
 * sample report so dev mirrors stay populated when the API isn't
 * reachable.
 */
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GenerateNotes } from '@/screens/generate-notes';
import {
  useProjectQuery,
  useReportQuery,
  useGenerateReportMutation,
  useRegenerateReportMutation,
  useFinalizeReportMutation,
} from '@/lib/api/hooks';
import type { NoteEntry } from '@/lib/note-entry';
import { uuid } from '@/lib/uuid';
import { env } from '@/lib/env';
import type { GeneratedSiteReport } from '@harpa/report-core';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import { safeBack } from '@/lib/nav/safe-back';

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

  // TODO(P4): replace with `useReportNotesQuery` + the mutation
  // pipeline once `useLocalReportNotes` is ported. Notes live in
  // route-local state so the screen stays functional end-to-end.
  const [localNotes, setLocalNotes] = useState<NoteEntry[]>([]);
  const handleAddTextNote = useCallback((body: string) => {
    setLocalNotes((prev) => [
      ...prev,
      {
        id: uuid(),
        text: body,
        addedAt: Date.now(),
        isPending: true,
        source: 'text',
      },
    ]);
  }, []);

  const reportRow = report.data as
    | {
        body?: GeneratedSiteReport | null;
        status?: 'draft' | 'finalized';
        notesSinceLastGeneration?: number;
        meta?: { title?: string | null };
      }
    | undefined;
  const serverBody = (reportRow?.body ?? null) as GeneratedSiteReport | null;

  // In fixture mode we fall back to the canonical sample so dev mirrors
  // + Maestro flows have something to render when no real generation
  // has happened yet. Real builds show whatever the API returned.
  const fallbackReport: GeneratedSiteReport | null = env.EXPO_PUBLIC_USE_FIXTURES
    ? SAMPLE_GENERATED_REPORT
    : null;

  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(
    null,
  );
  const currentReport = localReport ?? serverBody ?? fallbackReport;

  const [generationError, setGenerationError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const generateMutation = useGenerateReportMutation();
  const regenerateMutation = useRegenerateReportMutation();
  const finalizeMutation = useFinalizeReportMutation();

  const handleRegenerate = useCallback(() => {
    if (!slug || reportNumber === null) return;
    setGenerationError(null);
    // First-time generation hits POST /generate; subsequent runs hit
    // /regenerate. The wire shape is identical (Pitfall 7 — empty body
    // is valid; fixtureName is test-only).
    const mutation = currentReport ? regenerateMutation : generateMutation;
    mutation.mutate(
      { params: { project: slug, number: reportNumber }, body: {} },
      {
        onSuccess: (data) => {
          const next = (data as { report?: { body?: GeneratedSiteReport | null } } | undefined)
            ?.report?.body ?? null;
          if (next) setLocalReport(next);
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
          // Navigate to the saved-report view once finalize succeeds —
          // the draft route no longer makes sense for a finalized
          // report. The query cache is already invalidated by the
          // mutation hook's onSuccess (see `lib/api/invalidation.ts`).
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

  const isGenerating =
    generateMutation.isPending || regenerateMutation.isPending;

  const canWrite =
    projectQuery.data?.myRole === 'owner' || projectQuery.data?.myRole === 'editor';

  const reportTitleField = reportRow?.meta?.title;

  return (
    <GenerateNotes
      project={slug}
      reportNumber={reportNumber}
      notes={localNotes}
      notesLoading={report.isLoading}
      onAddTextNote={handleAddTextNote}
      reportTitle={reportTitleField ?? null}
      canWrite={canWrite}
      onBack={() => safeBack(router, `/(app)/projects/${slug}/reports`)}
      report={currentReport}
      onSetReport={setLocalReport}
      isGeneratingReport={isGenerating}
      generationError={generationError}
      onRegenerate={handleRegenerate}
      notesSinceLastGeneration={reportRow?.notesSinceLastGeneration ?? 0}
      isFinalizing={finalizeMutation.isPending}
      finalizeError={finalizeError}
      onFinalize={handleFinalize}
    />
  );
}
