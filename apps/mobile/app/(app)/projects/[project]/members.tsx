/**
 * Project members — real route wiring members + invite/remove mutations.
 */
import { useState } from 'react';
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
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ProjectMembersRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';

  const me = useMeQuery();
  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const members = useProjectMembersQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const [addSuccessNonce, setAddSuccessNonce] = useState(0);
  const add = useAddProjectMemberMutation({
    onSuccess: () => setAddSuccessNonce((n) => n + 1),
  });
  const remove = useRemoveProjectMemberMutation();

  const { refreshing, onRefresh } = useRefresh([
    projectQuery.refetch,
    members.refetch,
  ]);

  const addError = add.error instanceof Error ? add.error.message : null;

  return (
    <ProjectMembers
      members={members.data?.items ?? []}
      currentUserId={me.data?.user?.id ?? null}
      myRole={projectQuery.data?.myRole ?? 'viewer'}
      ownerId={projectQuery.data?.ownerId ?? ''}
      isLoading={projectQuery.isLoading || members.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, `/(app)/projects/${slug}`)}
      onAddMember={(input) =>
        add.mutate({
          params: { project: slug },
          body: input,
        })
      }
      isAddPending={add.isPending}
      addError={addError}
      addSuccessNonce={addSuccessNonce}
      onRemoveMember={(userId) =>
        remove.mutate({ params: { project: slug, user: userId } })
      }
      isRemovePending={remove.isPending}
      actions={<AppHeaderActions />}
    />
  );
}
