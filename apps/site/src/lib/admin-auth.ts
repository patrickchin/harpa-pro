import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientOptions } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { getPublicEnv } from './env';

const adminAuthOptions: BetterAuthClientOptions & {
  plugins: [ReturnType<typeof emailOTPClient>];
} = {
  baseURL: getPublicEnv().apiBaseUrl,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [emailOTPClient()],
};

export const adminAuthClient: ReturnType<typeof createAuthClient<typeof adminAuthOptions>> =
  createAuthClient(adminAuthOptions);
