/**
 * Project edit — real route wiring useProjectQuery /
 * useUpdateProjectMutation / useDeleteProjectMutation.
 */
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { ProjectEdit } from '@/screens/project-edit';
import {
  useProjectQuery,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} from '@/lib/api/hooks';
import { safeBack } from '@/lib/nav/safe-back';
import { dismissOrReplaceTo } from '@/lib/nav/dismiss-or-replace';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ProjectEditRoute() {
  const router = useRouter();
  const { project } = useLocalSearchParams<{ project: string }>();
  const slug = project ?? '';

  const projectQ = useProjectQuery(
    { params: { project: slug } },
    { enabled: slug.length > 0 },
  );
  const update = useUpdateProjectMutation();
  const remove = useDeleteProjectMutation();

  const initial = projectQ.data
    ? {
        name: projectQ.data.name,
        clientName: projectQ.data.clientName,
        address: projectQ.data.address,
      }
    : null;

  const updateError = update.error instanceof Error ? update.error.message : null;
  const deleteError = remove.error instanceof Error ? remove.error.message : null;

  return (
    <ProjectEdit
      initial={initial}
      isLoading={projectQ.isLoading}
      isUpdating={update.isPending}
      isDeleting={remove.isPending}
      updateError={updateError}
      deleteError={deleteError}
      onBack={() => safeBack(router, `/(app)/projects/${slug}`)}
      onSubmit={(values) => {
        update.mutate(
          {
            params: { project: slug },
            body: {
              name: values.name,
              ...(values.address !== null ? { address: values.address } : {}),
              ...(values.clientName !== null
                ? { clientName: values.clientName }
                : {}),
            },
          },
          {
            onSuccess: () => safeBack(router, `/(app)/projects/${slug}`),
          },
        );
      }}
      onDelete={() => {
        remove.mutate(
          { params: { project: slug } },
          {
            onSuccess: () => {
              // Pop to the projects list already on the stack instead of
              // replacing the top — otherwise back lands on the deleted
              // project. See docs/v4/arch-mobile-navigation.md §4.
              dismissOrReplaceTo(router, '/(app)/projects' as Href);
            },
          },
        );
      }}
      actions={<AppHeaderActions />}
    />
  );
}
