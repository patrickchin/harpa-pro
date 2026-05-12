/**
 * Persistence for the auth session.
 *
 * Two storage backends, deliberately split by sensitivity:
 *
 *  - **Session blob** (`{ token, user }`) → `expo-secure-store`. On iOS
 *    this is Keychain (`kSecAttrAccessibleAfterFirstUnlock`-ish via
 *    Expo's default `WHEN_UNLOCKED`); on Android it's
 *    `EncryptedSharedPreferences` (AES-256-GCM under the device key
 *    store). The 7-day JWT is the credential — it MUST live here, not
 *    in AsyncStorage.
 *
 *  - **Last phone number** (UX hint, not a credential) → `AsyncStorage`.
 *    Stored when the user starts an OTP so the verify screen / next
 *    sign-in attempt can pre-fill it. SecureStore would be overkill.
 *
 * Size note: a 7-day HS256 JWT is ~600 bytes; the user object is
 * ~150–300 bytes. We stay well under the iOS 4 KB Keychain item soft
 * limit. If we ever start packing larger metadata into the user object
 * we should switch to a "store the token in SecureStore + cache the
 * user JSON in AsyncStorage" split.
 *
 * Pure module — no React. Tested against in-memory mocks of both
 * native modules. The session provider (`session.tsx`) calls these.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** SecureStore key for the session blob. Versioned so we can bump on
 * schema change without colliding with old installs. */
const SESSION_KEY = 'harpa.session.v1';

/** AsyncStorage key for the UX phone hint. Versioned for the same
 * reason; never holds a credential. */
const LAST_PHONE_KEY = 'harpa.lastPhone.v1';

/**
 * Type of the user object cached alongside the JWT. Sourced from the
 * `/me` GET response in the OpenAPI contract so this stays in lock-step
 * with the server. Defined here (not in `session.tsx`) so storage can
 * round-trip it without importing React.
 */
export interface SessionUser {
  id: string;
  phone: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export interface PersistedSession {
  /** JWT issued by `POST /auth/otp/verify`. */
  token: string;
  /** User snapshot at sign-in time. Refreshed by the next `/me` call. */
  user: SessionUser;
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== 'string' || v.token.length === 0) return false;
  const u = v.user as Record<string, unknown> | null | undefined;
  if (!u || typeof u !== 'object') return false;
  return (
    typeof u.id === 'string' &&
    typeof u.phone === 'string' &&
    (u.displayName === null || typeof u.displayName === 'string') &&
    (u.companyName === null || typeof u.companyName === 'string') &&
    typeof u.createdAt === 'string'
  );
}

/**
 * Read the persisted session, if any. Returns `null` when:
 *  - nothing is stored,
 *  - the stored blob is malformed (we delete it and return null — better
 *    to force a re-login than to render with corrupt state).
 */
export async function readSession(): Promise<PersistedSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedSession(parsed)) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    // Reconstruct with ONLY the known fields so a tampered SecureStore
    // entry can't smuggle extra properties (e.g. `isAdmin: true`) into
    // the session object that downstream code might trust by mistake.
    return {
      token: parsed.token,
      user: {
        id: parsed.user.id,
        phone: parsed.user.phone,
        displayName: parsed.user.displayName,
        companyName: parsed.user.companyName,
        createdAt: parsed.user.createdAt,
      },
    };
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export async function writeSession(session: PersistedSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/** UX hint only — never cleared on sign-out (so the next sign-in can
 * pre-fill the same number). */
export async function readLastPhone(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_PHONE_KEY);
}

export async function writeLastPhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(LAST_PHONE_KEY, phone);
}

/** Test helper. Not used in production. */
export async function clearLastPhone(): Promise<void> {
  await AsyncStorage.removeItem(LAST_PHONE_KEY);
}

export const __keys = {
  SESSION_KEY,
  LAST_PHONE_KEY,
} as const;
