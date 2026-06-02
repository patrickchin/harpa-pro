/**
 * better-auth client for the mobile app.
 *
 * The `expoClient` plugin owns SecureStore-backed cookie/token storage
 * and automatically injects the bearer header on every API request.
 * We deliberately do NOT add the `bearer` plugin on top — `expoClient`
 * handles that internally, and stacking both leads to duplicate header
 * mangling.
 *
 * Base URL is the API root + `/api/auth` (better-auth's default mount
 * path inside our Hono app — see `packages/api/src/auth/handler.ts`).
 */
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { env } from '@/lib/config/env';

// On unsigned simulator builds (local dev/E2E without a signing certificate)
// the iOS Keychain rejects all SecureStore operations with errSecMissingEntitlement.
// We fall back to an in-memory Map so the auth session stays alive within a
// single app process (fine for E2E since each run does clearState + clearKeychain).
// @better-auth/expo's storage interface only requires getItem + setItem.
const memCache = new Map<string, string>();

const safeSecureStore = {
  ...SecureStore,
  getItem: (key: string, options?: SecureStore.SecureStoreOptions): string | null => {
    try {
      return SecureStore.getItem(key, options);
    } catch {
      return memCache.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string, options?: SecureStore.SecureStoreOptions): void => {
    try {
      SecureStore.setItem(key, value, options);
    } catch {
      memCache.set(key, value);
    }
  },
};

export const authClient = createAuthClient({
  baseURL: `${env.EXPO_PUBLIC_API_URL}/api/auth`,
  plugins: [
    expoClient({
      scheme: 'harpa',
      storagePrefix: 'harpa',
      storage: safeSecureStore,
    }),
    emailOTPClient(),
  ],
});

/**
 * The shape of the user object as returned by `useSession()` and
 * derived from `auth.ts`'s `additionalFields`. Exported here so the
 * rest of the app can import a single source-of-truth type without
 * pulling in the entire better-auth namespace.
 */
export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image?: string | null;
  displayName: string | null;
  companyName: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
}
