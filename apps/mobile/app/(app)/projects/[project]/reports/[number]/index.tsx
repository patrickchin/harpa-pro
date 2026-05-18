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
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SavedReport } from '@/screens/saved-report';
import {
  useProjectQuery,
  useReportQuery,
  useDeleteReportMutation,
} from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { useReportPdfActions } from '@/lib/use-report-pdf-actions';
import { env } from '@/lib/env';
import { safeBack } from '@/lib/nav/safe-back';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { GeneratedSiteReport } from '@harpa/report-core';
import type { AppDialogCopy } from '@/lib/app-dialog-copy';

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

  const reportData = reportQuery.data as
    | { status?: 'draft' | 'finalized' }
    | undefined;
  const reportStatus = reportData?.status ?? null;

  // TODO(P4): translate v4 `Report.body` (ReportBody shape) into a
  // `GeneratedSiteReport` for the saved-report screen. Fixture mode
  // seeds the sample so the read path is exercised end-to-end.
  const displayReport: GeneratedSiteReport | null = env.EXPO_PUBLIC_USE_FIXTURES
    ? SAMPLE_GENERATED_REPORT
    : null;

  const { refreshing, onRefresh } = useRefresh([
    () => reportQuery.refetch(),
  ]);

  // TODO(P4): swap for `useReportNotesQuery` once `useLocalReportNotes`
  // ports. Empty array means the Notes tab renders the EmptyState.
  const noteRows = [] as const;

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
      // After delete, fall back to the reports list. Use replace so the
      // saved-report route is not in history (it would 404 on swipe-back).
      router.replace(`/(app)/projects/${slug}/reports` as never);
    } catch {
      // Error surface: the mutation hook keeps the dialog open via the
      // `isDeleting` flag; the AppDialogSheet stays mounted. A dedicated
      // error dialog lands with P4 alongside `useReportNotesMutations`
      // error routing — for now `deleteMutation.error` is unread.
    }
  }, [slug, reportNumber, deleteMutation, router]);

  // Unfinalize is not implemented server-side (only finalize exists in
  // packages/api/src/routes/reports.ts as of P3). The dialog confirm
  // is a no-op until a `POST /unfinalize` endpoint lands in P4.
  const handleConfirmUnfinalize = useCallback(() => undefined, []);

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
      onBackToProjects={() => router.replace('/(app)/projects')}
      onChangeReport={setLocalReport}
      isAutoSaving={false}
      lastSavedAt={null}
      canUnfinalize={canUnfinalize}
      canDelete={canDelete}
      onConfirmDelete={handleConfirmDelete}
      onConfirmUnfinalize={handleConfirmUnfinalize}
      isDeleting={deleteMutation.isPending}
      isUnfinalizing={false}
      pdfActions={pdfActions}
    />
  );
}
