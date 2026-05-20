/**
 * Saved Report route — slug-native scheme (P3.1).
 *
 * Reads `project` + per-project `number` from path params, fetches
 * the saved report via `useReportQuery`, and renders the props-driven
 * `SavedReport` screen body.
 *
 * In fixture mode we seed `SAMPLE_GENERATED_REPORT` so the screen
 * renders end-to-end; otherwise we pass the report body through and
 * fall through to the empty/error state if the API hasn't finished
 * the body → `GeneratedSiteReport` translation yet.
 *
 * Delete + Unfinalize mutations and source-note fetching aren't ported
 * yet (TODO(P4) markers). They surface as no-op confirm flows so the
 * dialog wiring is exercised end-to-end in tests + dev mirrors.
 */
import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SavedReport } from '@/screens/saved-report';
import {
  useProjectQuery,
  useProjectMembersQuery,
  useReportQuery,
  useReportNotesQuery,
  useDeleteReportMutation,
  useUnfinalizeReportMutation,
} from '@/lib/api/hooks';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';
import { useRefresh } from '@/lib/use-refresh';
import { useReportPdfActions } from '@/lib/use-report-pdf-actions';
import { env } from '@/lib/env';
import { safeBack } from '@/lib/nav/safe-back';
import { dismissOrReplaceTo } from '@/lib/nav/dismiss-or-replace';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import { reportBodyToGeneratedReport } from '@/lib/report-body-adapter';
import { reports as reportSchemas } from '@harpa/api-contract';
import type { GeneratedSiteReport } from '@harpa/report-core';
import type { AppDialogCopy } from '@/lib/app-dialog-copy';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function SavedReportRoute() {
  const router = useRouter();
  const { project, number } = useLocalSearchParams<{
    project: string;
    number: string;
  }>();
  const slug = project ?? '';
  const parsedNumber = Number.parseInt(number ?? '', 10);
  const reportNumber = Number.isFinite(parsedNumber) ? parsedNumber : null;
  const hasValidRouteParams = slug.length > 0 && reportNumber !== null;

  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const reportQuery = useReportQuery(
    {
      params: {
        project: slug,
        number: reportNumber ?? 0,
      },
    },
    { enabled: hasValidRouteParams },
  );

  const reportRow = reportQuery.data as
    | {
        id?: string;
        status?: 'draft' | 'finalized';
        body?: reportSchemas.ReportBody | null;
        visitDate?: string | null;
      }
    | undefined;
  const reportStatus = reportRow?.status ?? null;
  const reportId = reportRow?.id ?? null;

  // Translate the persisted flat `ReportBody` shape into the wrapped
  // `GeneratedSiteReport` that the saved-report UI consumes. Fixture
  // mode short-circuits to the sample. The adapter lives in
  // `lib/report-body-adapter.ts` and is the same one used by the
  // generate route.
  const displayReport: GeneratedSiteReport | null = env.EXPO_PUBLIC_USE_FIXTURES
    ? SAMPLE_GENERATED_REPORT
    : reportRow?.body
      ? reportBodyToGeneratedReport(reportRow.body)
      : null;

  // Source-notes timeline for the saved report. Same query used by the
  // generate route — the API returns text + voice + image + document
  // rows; the detail pane currently renders text-bodied entries only.
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
      | { items?: ReadonlyArray<{ userId: string; displayName: string | null; phone?: string }> }
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
            createdAt: string;
          }>;
        }
      | undefined)?.items;
    if (!items) return [];
    return items.map((n) => ({
      id: n.id,
      body: n.body ?? n.transcript ?? null,
      kind: n.kind === 'image' ? 'photo' : n.kind,
      createdAt: n.createdAt ?? null,
      authorName: n.authorId ? memberNames.get(n.authorId) ?? null : null,
      fileId: n.fileId ?? null,
      transcript: n.transcript ?? null,
      title: n.title ?? null,
      summary: n.summary ?? null,
      durationSec: n.durationSec ?? null,
    }));
  }, [notesQuery.data, memberNames]);

  // TODO(P4): wire to `useReportAutoSave` once the autosave hook
  // ports. For now the Edit tab updates local state only.
  const [, setLocalReport] = useState<GeneratedSiteReport | null>(null);

  const handleExportError = useCallback(
    (_copy: AppDialogCopy & { kind: 'error' }) => {
      // TODO(P4): route export errors to the AppDialogSheet stack
      // alongside delete / unfinalize errors.
    },
    [],
  );

  const pdfActions = useReportPdfActions({
    displayReport,
    siteName: projectQuery.data?.name ?? null,
    onExportError: handleExportError,
  });

  const deleteMutation = useDeleteReportMutation();

  const handleConfirmDelete = useCallback(async () => {
    if (!slug || reportNumber === null) return;
    try {
      await deleteMutation.mutateAsync({
        params: { project: slug, number: reportNumber },
      });
      // After delete, fall back to the reports list. Pop to the existing
      // frame instead of replacing the top so we don't leave two adjacent
      // reports-list frames. See docs/v4/arch-mobile-navigation.md §4.
      dismissOrReplaceTo(router, `/(app)/projects/${slug}/reports` as never);
    } catch {
      // Error surface: the mutation hook keeps the dialog open via the
      // `isDeleting` flag; the AppDialogSheet stays mounted. A dedicated
      // error dialog lands with P4 alongside `useReportNotesMutations`
      // error routing — for now `deleteMutation.error` is unread.
    }
  }, [slug, reportNumber, deleteMutation, router]);

  const unfinalizeMutation = useUnfinalizeReportMutation();

  const handleConfirmUnfinalize = useCallback(async () => {
    if (!slug || reportNumber === null) return;
    try {
      await unfinalizeMutation.mutateAsync({
        params: { project: slug, number: reportNumber },
      });
    } catch {
      // Error surface mirrors delete — the screen body keeps the
      // confirm dialog open via `isUnfinalizing`. A dedicated error
      // dialog lands alongside the action-error router (P4).
    }
  }, [slug, reportNumber, unfinalizeMutation]);

  const myRole = projectQuery.data?.myRole;
  const canUnfinalize = myRole === 'owner' || myRole === 'editor';
  const canDelete = myRole === 'owner' || myRole === 'editor';

  return (
    <SavedReport
      report={displayReport}
      reportStatus={reportStatus}
      projectName={projectQuery.data?.name ?? null}
      noteRows={noteRows}
      isLoading={reportQuery.isLoading}
      loadError={reportQuery.error ?? null}
      hasValidRouteParams={hasValidRouteParams}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, `/(app)/projects/${slug}/reports`)}
      onRetry={() => {
        void reportQuery.refetch();
      }}
      onBackToProjects={() => dismissOrReplaceTo(router, '/(app)/projects')}
      onChangeReport={setLocalReport}
      isAutoSaving={false}
      lastSavedAt={null}
      canUnfinalize={canUnfinalize}
      canDelete={canDelete}
      onConfirmDelete={handleConfirmDelete}
      onConfirmUnfinalize={handleConfirmUnfinalize}
      isDeleting={deleteMutation.isPending}
      isUnfinalizing={unfinalizeMutation.isPending}
      pdfActions={pdfActions}
      actions={<AppHeaderActions />}
    />
  );
}
