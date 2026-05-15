import { useRouter } from 'expo-router';
import { useCreateProjectMutation } from '@/lib/api/hooks';
import { ProjectNew } from '@/screens/project-new';
import { safeBack } from '@/lib/nav/safe-back';

export default function NewProjectRoute() {
  const router = useRouter();
  const mutation = useCreateProjectMutation();

  return (
    <ProjectNew
      isPending={mutation.isPending}
      errorMessage={
        mutation.error ? mutation.error.message || 'Failed to create project.' : null
      }
      onBack={() => safeBack(router, '/(app)/projects')}
      onSubmit={(values) => {
        mutation.mutate(
          {
            body: {
              name: values.name,
              ...(values.address ? { address: values.address } : {}),
              ...(values.clientName ? { clientName: values.clientName } : {}),
            },
          },
          {
            // replace (not push/dismissTo) so /projects/new leaves the stack
            // and back goes to the project list, not the creation form.
            onSuccess: (created) => {
              router.replace(`/(app)/projects/${created.slug}` as never);
            },
          },
        );
      }}
    />
  );
}
