/**
 * Project members — real route wiring members + invite/remove mutations.
 */
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ProjectMembers } from '@/screens/project-members';
import {
  useProjectQuery,
  useProjectMembersQuery,
  useAddProjectMemberMutation,
  useUpdateProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useMeQuery,
} from '@/lib/api/hooks';
import {
  projectInitialData,
  projectInitialDataUpdatedAt,
} from '@/lib/api/initial-data';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ProjectMembersRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';
  const qc = useQueryClient();

  const me = useMeQuery();
  const projectQuery = useProjectQuery(
    { params: { project: slug } },
    {
      enabled: slug.length > 0,
      initialData: projectInitialData(qc, slug),
      initialDataUpdatedAt: projectInitialDataUpdatedAt(qc),
    },
  );
  const members = useProjectMembersQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const [addSuccessNonce, setAddSuccessNonce] = useState(0);
  const add = useAddProjectMemberMutation({
    onSuccess: () => setAddSuccessNonce((n) => n + 1),
  });
  const [updateRoleSuccessNonce, setUpdateRoleSuccessNonce] = useState(0);
  const updateRole = useUpdateProjectMemberMutation({
    onSuccess: () => setUpdateRoleSuccessNonce((n) => n + 1),
  });
  const remove = useRemoveProjectMemberMutation();

  const { refreshing, onRefresh } = useRefresh([
    projectQuery.refetch,
    members.refetch,
  ]);

  const addError = add.error instanceof Error ? add.error.message : null;
  const updateRoleError =
    updateRole.error instanceof Error ? updateRole.error.message : null;

  return (
    <ProjectMembers
      members={members.data?.items ?? []}
      currentUserId={me.data?.user?.id ?? null}
      myRole={projectQuery.data?.myRole ?? 'viewer'}
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
      onUpdateMemberRole={(userId, role) =>
        updateRole.mutate({
          params: { project: slug, user: userId },
          body: { role },
        })
      }
      isUpdateRolePending={updateRole.isPending}
      updateRoleError={updateRoleError}
      updateRoleSuccessNonce={updateRoleSuccessNonce}
      onRemoveMember={(userId) =>
        remove.mutate({ params: { project: slug, user: userId } })
      }
      isRemovePending={remove.isPending}
      actions={<AppHeaderActions />}
    />
  );
}
