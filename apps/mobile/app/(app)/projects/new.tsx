/**
 * New project — real route wiring useCreateProjectMutation.
 *
 * Body component at `screens/project-new.tsx`, dev mirror at
 * `(dev)/project-new.tsx`. On success the user is taken to the canonical
 * project detail URL via router.replace, which replaces the creation form
 * in the stack so back never returns to it.
 *
 * Note: router.dismissTo was tried but only works for modal presentations.
 * In a Tabs+Stack setup, pushes are regular stack screens, so dismissTo
 * pushes on top (leaving new in the stack) instead of replacing it.
 * router.replace correctly swaps the screen in place.
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
            onSuccess: (created) => {
              // replace swaps /projects/new with the new project screen in the
              // stack. Back then goes to the tab root (projects list), not the form.
              // Use the (app)-group-qualified path so the nested navigator resolves it.
              router.replace(`/(app)/projects/${created.slug}` as never);
            },
          },
        );
      }}
    />
  );
}
