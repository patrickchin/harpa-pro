/**
 * Projects index — real route wiring useListProjectsQuery.
 *
 * Replaces the placeholder from P2.6. Body component at
 * `screens/projects-list.tsx`, dev mirror at `(dev)/projects-list.tsx`.
 *
 * The (app) auth gate (P2.6) guarantees an authenticated session, so
 * this screen assumes a valid user context.
 */
import { useRouter } from 'expo-router';
import { useListProjectsQuery } from '@/lib/api/hooks';
import { ProjectsList, type ProjectRow } from '@/screens/projects-list';

export default function ProjectsIndex() {
  const router = useRouter();
  const result = useListProjectsQuery();

  const projects: ProjectRow[] =
    result.data?.items.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      role: p.myRole,
      address: p.address,
      updatedAt: p.updatedAt,
    })) ?? [];

  return (
    <ProjectsList
      projects={projects}
      isLoading={result.isLoading}
      refreshing={result.isRefetching}
      onRefresh={() => result.refetch()}
      onPressProject={(slug) => {
        router.push(`/projects/${slug}` as never);
      }}
      onPressNewProject={() => {
        router.push('/projects/new' as never);
      }}
    />
  );
}
