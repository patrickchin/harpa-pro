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
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { expoClient, type ExpoClientStorage } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { env } from '@/lib/config/env';

// On unsigned simulator builds (local dev/E2E without a signing certificate)
// the iOS Keychain rejects all SecureStore operations with
// errSecMissingEntitlement. We fall back to an in-memory Map so the auth
// session stays alive within a single app process.
//
// Gated on __DEV__ on purpose: in production we want SecureStore failures to
// surface (e.g. to Sentry / via the auth client's own error handling) rather
// than silently dropping users into an in-memory session that vanishes on
// every app restart. Sync and async operations share the same fallback cache.
const memCache = new Map<string, string>();

export function createAuthStorage(isDevelopment: boolean): ExpoClientStorage {
  if (!isDevelopment) return SecureStore;

  return {
    getItem: (key: string, options?: SecureStore.SecureStoreOptions): string | null => {
      try {
        const value = SecureStore.getItem(key, options);
        if (value === null) memCache.delete(key);
        else memCache.set(key, value);
        return value;
      } catch (err) {
        console.warn('[auth] SecureStore.getItem failed, using in-memory fallback', err);
        return memCache.get(key) ?? null;
      }
    },
    getItemAsync: async (
      key: string,
      options?: SecureStore.SecureStoreOptions,
    ): Promise<string | null> => {
      try {
        const value = await SecureStore.getItemAsync(key, options);
        if (value === null) memCache.delete(key);
        else memCache.set(key, value);
        return value;
      } catch (err) {
        console.warn('[auth] SecureStore.getItemAsync failed, using in-memory fallback', err);
        return memCache.get(key) ?? null;
      }
    },
    setItem: (key: string, value: string, options?: SecureStore.SecureStoreOptions): void => {
      try {
        SecureStore.setItem(key, value, options);
      } catch (err) {
        console.warn('[auth] SecureStore.setItem failed, using in-memory fallback', err);
      } finally {
        memCache.set(key, value);
      }
    },
    setItemAsync: async (
      key: string,
      value: string,
      options?: SecureStore.SecureStoreOptions,
    ): Promise<void> => {
      try {
        await SecureStore.setItemAsync(key, value, options);
      } catch (err) {
        console.warn('[auth] SecureStore.setItemAsync failed, using in-memory fallback', err);
      } finally {
        memCache.set(key, value);
      }
    },
  };
}

const storage = createAuthStorage(__DEV__);

const expoPluginBase = expoClient({
  scheme: 'harpa',
  storagePrefix: 'harpa',
  storage: storage,
});

type ClientPluginActions = NonNullable<BetterAuthClientPlugin['getActions']>;

// The Expo package's generated declaration narrows BetterFetch's generic
// parameters, so strictFunctionTypes rejects it even though both sides use the
// same @better-fetch/fetch runtime. Re-expose that one method through Better
// Auth's public plugin signature while preserving Expo's getCookie return type.
const expoPlugin = {
  ...expoPluginBase,
  getActions: (
    $fetch: Parameters<ClientPluginActions>[0],
    $store: Parameters<ClientPluginActions>[1],
  ) =>
    expoPluginBase.getActions(
      $fetch as unknown as Parameters<typeof expoPluginBase.getActions>[0],
      $store,
    ),
} satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
  baseURL: `${env.EXPO_PUBLIC_API_URL}/api/auth`,
  plugins: [expoPlugin, emailOTPClient()],
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
