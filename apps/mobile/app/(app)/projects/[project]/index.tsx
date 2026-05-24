/**
 * Project home — real route wiring useProjectQuery against the
 * slug-based URL scheme introduced in P3.0.
 */
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { ProjectHome } from '@/screens/project-home';
import { useProjectQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { useCopyToClipboard } from '@/lib/use-clipboard';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';
import { env } from '@/lib/env';

export default function ProjectHomeRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';

  const result = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const { refreshing, onRefresh } = useRefresh([result.refetch]);
  const { copiedKey, copy } = useCopyToClipboard();

  const projectInfo = result.data
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
      project={projectInfo}
      isLoading={result.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/projects')}
      onPressEdit={() => router.push(`/projects/${slug}/edit` as Href)}
      onPressReports={() => router.push(`/projects/${slug}/reports` as Href)}
      onPressMembers={() => router.push(`/projects/${slug}/members` as Href)}
      copiedKey={copiedKey}
      onCopy={(value, key) => {
        void copy(value, {
          key,
          toast: key === 'client' ? 'Client copied' : 'Address copied',
        });
      }}
      actions={<AppHeaderActions />}
      showDeveloperSection={env.EXPO_PUBLIC_USE_FIXTURES || __DEV__}
      projectSlug={slug}
    />
  );
}
