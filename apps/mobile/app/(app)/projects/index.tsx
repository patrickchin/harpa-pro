/**
 * Projects index — real route wiring useListProjectsQuery.
 *
 * Body component at `screens/projects-list.tsx`.
 *
 * The (app) auth gate (P2.6) guarantees an authenticated session, so
 * this screen assumes a valid user context.
 *
 * Slug↔id boundary: `Project.id` from the API IS the slug
 * (`prj_…`, slug-only IDs — P3.1). We assert the shape at this
 * adapter so any contract drift (e.g. UUID regression) surfaces
 * here rather than as a 404 from the deep-link route.
 */
import { useRouter, type Href } from 'expo-router';
import { useListProjectsQuery } from '@/lib/api/hooks';
import {
  usePrefetchProject,
  usePrefetchProjectReports,
} from '@/lib/api/prefetch';
import { ProjectsList, type ProjectRow } from '@/screens/projects-list';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

const PROJECT_SLUG_RE = /^prj_[0-9a-hjkmnp-tv-z]{8,16}$/i;

export default function ProjectsIndex() {
  const router = useRouter();
  const result = useListProjectsQuery();
  const prefetchProject = usePrefetchProject();
  const prefetchProjectReports = usePrefetchProjectReports();

  const projects: ProjectRow[] =
    result.data?.items
      .filter((p) => {
        if (PROJECT_SLUG_RE.test(p.id)) return true;
        // Drop malformed rows rather than crash the list. Slug-only-IDs
        // (P3.1) means a UUID-shaped `p.id` is contract drift — the
        // route at /projects/[project] would 404 anyway.
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('Dropping project with non-slug id:', p.id);
        }
        return false;
      })
      .map((p) => ({
        slug: p.id,
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
        router.push(`/projects/${slug}` as Href);
      }}
      onPressInProject={(slug) => {
        // Best-effort: pre-warm both the project detail and its
        // reports list so the destination screen renders without a
        // spinner. Helpers no-op on empty slug.
        prefetchProject(slug);
        prefetchProjectReports(slug);
      }}
      onPressNewProject={() => {
        router.push('/projects/new' as Href);
      }}
      actions={<AppHeaderActions />}
    />
  );
}
