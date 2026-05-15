/**
 * New project — real route wiring useCreateProjectMutation.
 *
 * Body component at `screens/project-new.tsx`, dev mirror at
 * `(dev)/project-new.tsx`. On success the user is taken to the canonical
 * project detail URL via router.dismissTo, which pops the creation form
 * from the stack so back never returns to it.
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
              // dismissTo pops /projects/new from the stack before navigating
              // to the new project, so back never returns to the creation form.
              router.dismissTo(`/projects/${created.slug}` as never);
            },
          },
        );
      }}
    />
  );
}
