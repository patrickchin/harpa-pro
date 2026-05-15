/**
 * Project edit — real route wiring useProjectQuery /
 * useUpdateProjectMutation / useDeleteProjectMutation.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProjectEdit } from '@/screens/project-edit';
import {
  useProjectQuery,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} from '@/lib/api/hooks';
import { safeBack } from '@/lib/nav/safe-back';

export default function ProjectEditRoute() {
  const router = useRouter();
  const { projectSlug } = useLocalSearchParams<{ projectSlug: string }>();
  const slug = projectSlug ?? '';

  const projectQ = useProjectQuery(
    { params: { projectSlug: slug } },
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
            params: { projectSlug: slug },
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
          { params: { projectSlug: slug } },
          {
            onSuccess: () => {
              router.replace('/(app)/projects' as never);
            },
          },
        );
      }}
    />
  );
}
