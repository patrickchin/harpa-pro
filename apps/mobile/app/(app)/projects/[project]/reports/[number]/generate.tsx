/**
 * Generate Report route — slug-native scheme (P3.1).
 *
 * Reads `project` (prj_…) + `number` from path params, fetches the report
 * draft via `useReportQuery`, and renders the props-driven
 * `GenerateNotes` screen body.
 *
 * Notes still live in route-local state — `useReportNotesQuery` /
 * `useReportNotesMutations` aren't ported yet (lands with the notes
 * mutation hooks). Generated report is wired from a fixture sample
 * in fixture-mode so the Report tab renders; the real
 * `useReportGeneration` hook lands once the API generate endpoint is
 * ported.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GenerateNotes } from '@/screens/generate-notes';
import { useProjectQuery, useReportQuery } from '@/lib/api/hooks';
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

  // TODO(P3.x): replace with `useReportNotesQuery` + the mutation
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

  // TODO(P3.x): replace with `useReportGeneration` mutation once the
  // API `/projects/:slug/reports/:n/generate` endpoint is ported. In
  // fixture mode we seed a sample report so the Report tab is
  // visually exercised; otherwise the tab shows the empty state.
  const [generatedReport, setGeneratedReport] =
    useState<GeneratedSiteReport | null>(
      env.EXPO_PUBLIC_USE_FIXTURES ? SAMPLE_GENERATED_REPORT : null,
    );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Honest UX path: flip the spinner, then re-seat the fixture so the
  // user sees the Report tab refresh. Real network call lands later.
  const handleRegenerate = useCallback(() => {
    setGenerationError(null);
    setIsGeneratingReport(true);
  }, []);

  useEffect(() => {
    if (!isGeneratingReport) return;
    const id = setTimeout(() => {
      setGeneratedReport(SAMPLE_GENERATED_REPORT);
      setIsGeneratingReport(false);
    }, 600);
    return () => clearTimeout(id);
  }, [isGeneratingReport]);

  const canWrite =
    projectQuery.data?.myRole === 'owner' || projectQuery.data?.myRole === 'editor';

  const reportTitleField = (
    report.data as { report?: { meta?: { title?: string | null } } } | undefined
  )?.report?.meta?.title;

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
      report={generatedReport}
      isGeneratingReport={isGeneratingReport}
      generationError={generationError}
      onRegenerate={handleRegenerate}
    />
  );
}
