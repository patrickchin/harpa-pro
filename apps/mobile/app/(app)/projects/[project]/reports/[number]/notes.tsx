/**
 * Report Notes route — dedicated source-notes screen for a saved
 * report. Finalised reports hide the inline Notes tab and route
 * users here via the Actions menu's "View Notes" entry.
 *
 * Mirrors the report-fetching shape of the saved-report route so
 * the screen has access to report id (needed for optimistic note
 * deletes) and source-note rows.
 */
import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { ReportNotes } from '@/screens/report-notes';
import {
  useProjectMembersQuery,
  useReportQuery,
  useReportNotesQuery,
} from '@/lib/api/hooks';
import {
  reportInitialData,
  reportInitialDataUpdatedAt,
} from '@/lib/api/initial-data';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';
import { toReportNoteRows } from '@/lib/api/to-report-note-row';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { dismissOrReplaceTo } from '@/lib/nav/dismiss-or-replace';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ReportNotesRoute() {
  const router = useRouter();
  const { project, number } = useLocalSearchParams<{
    project: string;
    number: string;
  }>();
  const slug = project ?? '';
  const parsedNumber = Number.parseInt(number ?? '', 10);
  const reportNumber = Number.isFinite(parsedNumber) ? parsedNumber : null;
  const hasValidRouteParams = slug.length > 0 && reportNumber !== null;
  const qc = useQueryClient();

  const reportQuery = useReportQuery(
    {
      params: {
        project: slug,
        number: reportNumber ?? 0,
      },
    },
    {
      enabled: hasValidRouteParams,
      initialData:
        reportNumber !== null
          ? reportInitialData(qc, slug, reportNumber)
          : undefined,
      initialDataUpdatedAt: reportInitialDataUpdatedAt(qc, slug),
    },
  );

  const reportRow = reportQuery.data as { id?: string } | undefined;
  const reportId = reportRow?.id ?? null;

  const notesQuery = useReportNotesQuery(
    { params: { report: reportId ?? '' } },
    { enabled: reportId !== null },
  );

  const membersQuery = useProjectMembersQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const memberNames = useMemo(() => {
    const items = (membersQuery.data as
      | {
          items?: ReadonlyArray<{
            userId: string;
            displayName: string | null;
            phone?: string;
          }>;
        }
      | undefined)?.items;
    const map = new Map<string, string>();
    if (!items) return map;
    for (const m of items) {
      map.set(m.userId, m.displayName?.trim() || m.phone || 'Unknown');
    }
    return map;
  }, [membersQuery.data]);

  const { refreshing, onRefresh } = useRefresh([
    () => reportQuery.refetch(),
    () => notesQuery.refetch(),
  ]);

  const noteRows = useMemo<ReadonlyArray<ReportNoteRow>>(() => {
    const items = (notesQuery.data as
      | {
          items?: ReadonlyArray<{
            id: string;
            authorId?: string;
            kind: 'text' | 'voice' | 'image' | 'document';
            body: string | null;
            transcript: string | null;
            title?: string | null;
            summary?: string | null;
            durationSec?: number | null;
            fileId: string | null;
            thumbnailFileId?: string | null;
            files?: ReadonlyArray<{
              id: string;
              fileId: string;
              thumbnailFileId: string | null;
              position: number;
              caption: string | null;
            }>;
            createdAt: string;
          }>;
        }
      | undefined)?.items;
    return toReportNoteRows(items, memberNames);
  }, [notesQuery.data, memberNames]);

  return (
    <ReportNotes
      reportNumber={reportNumber}
      reportId={reportId}
      noteRows={noteRows}
      isLoading={notesQuery.isLoading}
      loadError={(reportQuery.error ?? notesQuery.error) ?? null}
      hasValidRouteParams={hasValidRouteParams}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() =>
        safeBack(
          router,
          `/(app)/projects/${slug}/reports/${reportNumber ?? ''}`,
        )
      }
      onRetry={() => {
        void reportQuery.refetch();
        void notesQuery.refetch();
      }}
      onBackToProjects={() => dismissOrReplaceTo(router, '/(app)/projects')}
      actions={<AppHeaderActions />}
    />
  );
}
