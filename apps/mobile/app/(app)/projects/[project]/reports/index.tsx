/**
 * Reports list — real route wiring useProjectReportsQuery +
 * useCreateReportMutation. On successful create, navigate to the
 * draft's generate view.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ReportsList } from '@/screens/reports-list';
import {
  useProjectQuery,
  useProjectReportsQuery,
  useCreateReportMutation,
} from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ReportsListRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';

  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const list = useProjectReportsQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const create = useCreateReportMutation();
  const { refreshing, onRefresh } = useRefresh([list.refetch]);

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
                router.push(`/projects/${slug}/reports/${num}/generate` as never);
              }
            },
          },
        );
      }}
      onOpenReport={(item) => {
        if (item.status === 'draft') {
          router.push(`/projects/${slug}/reports/${item.number}/generate` as never);
        } else {
          router.push(`/projects/${slug}/reports/${item.number}` as never);
        }
      }}
      actions={<AppHeaderActions />}
    />
  );
}
