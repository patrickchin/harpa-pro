import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AuthSessionProvider } from '@/features/auth';
import { queryClient } from '@/lib/query-client';

export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>{children}</AuthSessionProvider>
    </QueryClientProvider>
  );
}
