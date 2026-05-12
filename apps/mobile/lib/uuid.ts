/**
 * RFC 4122 v4 UUIDs via expo-crypto. Hermes release builds on iOS do
 * not always expose `globalThis.crypto`, so we cannot rely on it.
 *
 * **Never** invent a fallback shape like `<time>-<rand>` — PostgREST / PG
 * `uuid` columns reject anything that's not a real UUID, and the failure
 * is silent until production. (See /memories/supabase-postgrest.md.)
 */
import * as Crypto from 'expo-crypto';

export function uuid(): string {
  return Crypto.randomUUID();
}
