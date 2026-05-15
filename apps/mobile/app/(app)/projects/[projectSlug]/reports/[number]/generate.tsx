/**
 * Generate Report route — slug + number scheme (P3.0 commit 3).
 *
 * Reads `projectSlug` + `number` from path params, fetches the report
 * draft via `useReportQuery`, and renders the props-driven
 * `GenerateNotes` screen body.
 *
 * P3.6 ships local-only note state — `useReportNotesQuery` /
 * `useReportNotesMutations` aren't ported yet. Notes added in this
 * session live in route-local React state with a TODO marker so the
 * Notes tab is functional end-to-end (smoke testable). Persistence
 * lands in P3.7.
 */
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GenerateNotes } from '@/screens/generate-notes';
import { useProjectQuery, useReportQuery } from '@/lib/api/hooks';
import type { NoteEntry } from '@/lib/note-entry';
import { uuid } from '@/lib/uuid';

export default function GenerateReportRoute() {
  const router = useRouter();
  const { projectSlug, number } = useLocalSearchParams<{
    projectSlug: string;
    number: string;
  }>();
  const slug = projectSlug ?? '';
  const parsedNumber = Number.parseInt(number ?? '', 10);
  const reportNumber = Number.isFinite(parsedNumber) ? parsedNumber : null;

  const project = useProjectQuery(
    { params: { projectSlug: slug } },
    { enabled: slug.length > 0 },
  );
  const report = useReportQuery(
    {
      params: {
        projectSlug: slug,
        number: reportNumber ?? 0,
      },
    },
    { enabled: slug.length > 0 && reportNumber !== null },
  );

  // TODO(P3.7): replace with `useReportNotesQuery` + the mutation
  // pipeline once `useLocalReportNotes` is ported. P3.6 keeps notes
  // in route-local state so the screen is functional end-to-end.
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

  const canWrite =
    project.data?.myRole === 'owner' || project.data?.myRole === 'editor';

  const reportTitleField = (
    report.data as { report?: { meta?: { title?: string | null } } } | undefined
  )?.report?.meta?.title;

  return (
    <GenerateNotes
      projectSlug={slug}
      reportNumber={reportNumber}
      notes={localNotes}
      notesLoading={report.isLoading}
      onAddTextNote={handleAddTextNote}
      reportTitle={reportTitleField ?? null}
      canWrite={canWrite}
      onBack={() => router.back()}
    />
  );
}
