/**
 * Reports list — real route wiring useProjectReportsQuery +
 * useCreateReportMutation. On successful create, navigate to the
 * draft's generate view.
 */
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ReportsList } from '@/screens/reports-list';
import {
  useProjectQuery,
  useProjectReportsQuery,
} from '@/lib/api/hooks';
import { useOptimisticCreateReport, isOptimisticReportId } from '@/lib/api/optimistic';
import { usePrefetchReport } from '@/lib/api/prefetch';
import {
  projectInitialData,
  projectInitialDataUpdatedAt,
} from '@/lib/api/initial-data';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ReportsListRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';
  const qc = useQueryClient();

  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    {
      enabled: slug.length > 0,
      initialData: projectInitialData(qc, slug),
      initialDataUpdatedAt: projectInitialDataUpdatedAt(qc),
    },
  );
  const list = useProjectReportsQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const create = useOptimisticCreateReport();
  const { refreshing, onRefresh } = useRefresh([list.refetch]);
  const prefetchReport = usePrefetchReport();

  const canCreate =
    projectQuery.data?.myRole === 'owner' || projectQuery.data?.myRole === 'editor';

  return (
    <ReportsList
      reports={list.data?.items ?? []}
      projectName={projectQuery.data?.name ?? null}
      canCreate={canCreate}
      isLoading={list.isLoading}
      refreshing={refreshing}
      isCreating={create.isPending}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, `/(app)/projects/${slug}`)}
      onCreate={() => {
        create.mutate(
          { params: { project: slug }, body: {} },
          {
            onSuccess: (resp) => {
              const created = (resp as { report?: { number: number } }).report;
              const num = created?.number;
              if (typeof num === 'number') {
                router.push(`/projects/${slug}/reports/${num}/generate` as Href);
              }
            },
          },
        );
      }}
      onOpenReport={(item) => {
        // Optimistic rows have no server-assigned `number` yet —
        // navigating would land on a 404. The row reverts to a real
        // id once the create response arrives.
        if (isOptimisticReportId(item.id)) return;
        if (item.status === 'draft') {
          router.push(`/projects/${slug}/reports/${item.number}/generate` as Href);
        } else {
          router.push(`/projects/${slug}/reports/${item.number}` as Href);
        }
      }}
      onPressInReport={(item) => {
        if (isOptimisticReportId(item.id)) return;
        // Pre-warm the report row in cache before the saved-report
        // screen mounts. Drafts route to a different (generate) UI
        // that builds its own state, so we only prefetch for
        // finalized reports.
        if (item.status !== 'draft') {
          prefetchReport(slug, item.number);
        }
      }}
      actions={<AppHeaderActions />}
    />
  );
}
