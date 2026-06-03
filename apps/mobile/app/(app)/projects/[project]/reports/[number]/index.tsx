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
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { SavedReport } from '@/screens/saved-report';
import {
  useProjectQuery,
  useProjectMembersQuery,
  useReportQuery,
  useReportNotesQuery,
  useDeleteReportMutation,
  useUnfinalizeReportMutation,
} from '@/lib/api/hooks';
import { useOptimisticPlacePhotoGroup } from '@/lib/api/optimistic';
import {
  projectInitialData,
  projectInitialDataUpdatedAt,
  reportInitialData,
  reportInitialDataUpdatedAt,
} from '@/lib/api/initial-data';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';
import { toReportNoteRows } from '@/lib/api/to-report-note-row';
import { useRefresh } from '@/lib/util/use-refresh';
import { useReportPdfActions } from '@/lib/reports/use-report-pdf-actions';
import { env } from '@/lib/config/env';
import { safeBack } from '@/lib/nav/safe-back';
import { dismissOrReplaceTo } from '@/lib/nav/dismiss-or-replace';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import { reportBodyToGeneratedReport } from '@/lib/reports/report-body-adapter';
import { reports as reportSchemas } from '@harpa/api-contract';
import type { GeneratedSiteReport } from '@harpa/report-core';
import type { AppDialogCopy } from '@/lib/dialogs/app-dialog-copy';
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
  const qc = useQueryClient();

  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    {
      enabled: slug.length > 0,
      initialData: projectInitialData(qc, slug),
      initialDataUpdatedAt: projectInitialDataUpdatedAt(qc),
    },
  );
  const reportQuery = useReportQuery(
    {
      params: {
        project: slug,
        number: reportNumber ?? 0,
      },
    },
    {
      enabled: hasValidRouteParams,
      // Seed from the cached reports list so the screen renders the
      // row immediately when navigated from `/projects/{slug}/reports`.
      // Background refetch still fires because `initialDataUpdatedAt`
      // reflects how stale the list snapshot is.
      initialData:
        reportNumber !== null
          ? reportInitialData(qc, slug, reportNumber)
          : undefined,
      initialDataUpdatedAt: reportInitialDataUpdatedAt(qc, slug),
    },
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
  // `lib/reports/report-body-adapter.ts` and is the same one used by the
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
            thumbnailFileId?: string | null;
            files?: ReadonlyArray<{
              id: string;
              fileId: string;
              thumbnailFileId: string | null;
              position: number;
              caption: string | null;
            }>;
            placement?: { kind: 'issue' | 'section'; index: number } | null;
            createdAt: string;
          }>;
        }
      | undefined)?.items;
    return toReportNoteRows(items, memberNames);
  }, [notesQuery.data, memberNames]);

  // Saved (finalized) reports are read-only here — the SavedReport
  // body still wires an onChangeReport prop so the Edit tab renders,
  // but persistence is intentionally a no-op. To actually mutate a
  // finalized report the user unfinalizes first, which routes them
  // back through the generate stack. Autosave wiring for *draft*
  // reports lives in `generate.tsx`, not on this route.
  const [, setLocalReport] = useState<GeneratedSiteReport | null>(null);

  const handleExportError = useCallback(
    (_copy: AppDialogCopy & { kind: 'error' }) => {
      // Export errors currently no-op on the SavedReport route — the
      // `useReportPdfActions` hook surfaces success/failure inline in
      // the PDF action sheet. The shared AppDialogSheet error router
      // (delete / unfinalize / export) lands with the action-error
      // surface tracked in plan-p4-hardening.md P4.3.
    },
    [],
  );

  const pdfActions = useReportPdfActions({
    displayReport,
    siteName: projectQuery.data?.name ?? null,
    onExportError: handleExportError,
  });

  const deleteMutation = useDeleteReportMutation();
  const placePhotoGroupMutation = useOptimisticPlacePhotoGroup();

  const handlePlacePhotoGroup = useCallback(
    async (input: {
      noteId: string;
      placement: { kind: 'issue' | 'section'; index: number } | null;
    }) => {
      if (reportId === null) return;
      try {
        await placePhotoGroupMutation.mutateAsync({
          params: { note: input.noteId },
          body: { placement: input.placement },
          reportId,
        });
      } catch {
        // optimistic helper already rolls back on error.
      }
    },
    [placePhotoGroupMutation, reportId],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!slug || reportNumber === null) return;
    try {
      await deleteMutation.mutateAsync({
        params: { project: slug, number: reportNumber },
      });
      // After delete, fall back to the reports list. Pop to the existing
      // frame instead of replacing the top so we don't leave two adjacent
      // reports-list frames. See docs/v4/arch-mobile-navigation.md §4.
      dismissOrReplaceTo(router, `/(app)/projects/${slug}/reports` as Href);
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
      reportId={reportId}
      reportNumber={reportNumber}
      projectName={projectQuery.data?.name ?? null}
      noteRows={noteRows}
      isLoading={reportQuery.isLoading}
      notesLoading={notesQuery.isLoading}
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
      onViewNotes={
        hasValidRouteParams && reportStatus === 'finalized'
          ? () =>
              router.push(
                `/(app)/projects/${slug}/reports/${reportNumber}/notes` as Href,
              )
          : undefined
      }
      showDeveloperSection={env.EXPO_PUBLIC_USE_FIXTURES || __DEV__}
      onOpenDebug={
        hasValidRouteParams
          ? () =>
              router.push(
                `/(app)/projects/${slug}/reports/${reportNumber}/debug` as Href,
              )
          : undefined
      }
      onPlacePhotoGroup={
        reportId !== null ? handlePlacePhotoGroup : undefined
      }
    />
  );
}
