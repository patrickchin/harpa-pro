/**
 * better-auth client singleton for the mobile app.
 *
 * Must be a module-level singleton — never instantiated inside a hook
 * or component (Pitfall 13). The expoClient plugin handles cookie
 * persistence in MMKV (synchronous, survives process restarts) and
 * attaches the cookie header on every better-auth request.
 *
 * Base URL: uses env.EXPO_PUBLIC_API_URL synchronously because
 * createAuthClient runs at module load time. The async
 * getApiBaseUrl() override (dev QA redirect) applies only to the
 * typed API client (lib/api/client.ts), not to the auth client.
 */
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createMMKV } from 'react-native-mmkv';
import { env } from '../config/env';

/** Dedicated MMKV instance for better-auth cookie / session cache. */
const authStorage = createMMKV({ id: 'harpa-auth' });

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_API_URL + '/api/auth',
  plugins: [
    expoClient({
      scheme: 'harpa',
      storagePrefix: 'harpa-auth',
      storage: {
        getItem: (key: string) => authStorage.getString(key) ?? null,
        setItem: (key: string, value: string) => authStorage.set(key, value),
      },
    }),
    emailOTPClient(),
  ],
});

export type { Session, User } from 'better-auth/types';
