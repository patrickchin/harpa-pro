/**
 * New project — real route wiring useCreateProjectMutation.
 *
 * Body component at `screens/project-new.tsx`, dev mirror at
 * `(dev)/project-new.tsx`. On success the user is replaced into the
 * canonical project detail URL using the slug from the API response.
 */
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
      onBack={() => safeBack(router, '/projects')}
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
            onSuccess: (created) => {
              router.replace(`/projects/${created.slug}` as never);
            },
          },
        );
      }}
    />
  );
}
