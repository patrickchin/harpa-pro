/**
 * Project members — real route wiring members + invite/remove mutations.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProjectMembers } from '@/screens/project-members';
import {
  useProjectQuery,
  useProjectMembersQuery,
  useAddProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useMeQuery,
} from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

export default function ProjectMembersRoute() {
  const router = useRouter();
  const { projectSlug } = useLocalSearchParams<{ projectSlug: string }>();
  const slug = projectSlug ?? '';

  const me = useMeQuery();
  const project = useProjectQuery(
    { params: { projectSlug: slug } },
    { enabled: slug.length > 0 },
  );
  const members = useProjectMembersQuery(
    { params: { projectSlug: slug } },
    { enabled: slug.length > 0 },
  );
  const add = useAddProjectMemberMutation();
  const remove = useRemoveProjectMemberMutation();

  const { refreshing, onRefresh } = useRefresh([
    project.refetch,
    members.refetch,
  ]);

  const addError = add.error instanceof Error ? add.error.message : null;

  return (
    <ProjectMembers
      members={members.data?.items ?? []}
      currentUserId={me.data?.user?.id ?? null}
      myRole={project.data?.myRole ?? 'viewer'}
      ownerId={project.data?.ownerId ?? ''}
      isLoading={project.isLoading || members.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, `/(app)/projects/${slug}`)}
      onAddMember={(input) =>
        add.mutate({
          params: { projectSlug: slug },
          body: input,
        })
      }
      isAddPending={add.isPending}
      addError={addError}
      onRemoveMember={(userId) =>
        remove.mutate({ params: { projectSlug: slug, userId } })
      }
      isRemovePending={remove.isPending}
    />
  );
}
