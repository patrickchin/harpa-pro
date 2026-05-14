/**
 * Project home — real route wiring useProjectQuery against the
 * slug-based URL scheme introduced in P3.0.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProjectHome } from '@/screens/project-home';
import { useProjectQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { useCopyToClipboard } from '@/lib/use-clipboard';

export default function ProjectHomeRoute() {
  const router = useRouter();
  const { projectSlug } = useLocalSearchParams<{ projectSlug: string }>();
  const slug = projectSlug ?? '';

  const result = useProjectQuery(
    { params: { projectSlug: slug } },
    { enabled: slug.length > 0 },
  );
  const { refreshing, onRefresh } = useRefresh([result.refetch]);
  const { copiedKey, copy } = useCopyToClipboard();

  const project = result.data
    ? {
        name: result.data.name,
        clientName: result.data.clientName,
        address: result.data.address,
        myRole: result.data.myRole,
        stats: {
          totalReports: result.data.stats?.totalReports ?? 0,
          drafts: result.data.stats?.drafts ?? 0,
          lastReportAt: result.data.stats?.lastReportAt ?? null,
        },
      }
    : null;

  return (
    <ProjectHome
      project={project}
      isLoading={result.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => router.back()}
      onPressEdit={() => router.push(`/projects/${slug}/edit` as never)}
      onPressReports={() => router.push(`/projects/${slug}/reports` as never)}
      onPressMembers={() => router.push(`/projects/${slug}/members` as never)}
      copiedKey={copiedKey}
      onCopy={(value, key) => {
        void copy(value, {
          key,
          toast: key === 'client' ? 'Client copied' : 'Address copied',
        });
      }}
    />
  );
}
