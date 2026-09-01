/**
 * TanStack Query cache persistence.
 *
 * Goal: cold start renders the last-seen data instantly, then
 * revalidates in the background. The in-memory `QueryClient` is
 * snapshot-serialised to a user-scoped MMKV key on every cache
 * mutation (throttled), and restored only after auth resolves via
 * `SessionQueryProvider`.
 *
 * Storage choice: MMKV via `react-native-mmkv` — synchronous,
 * extremely fast, and already used by the upload-queue persistence
 * layer. We shim it into the `AsyncStorage`-shaped interface the
 * persister expects.
 *
 * What we persist (`shouldDehydrateQuery` allowlist):
 *   - `projects`, `project`, `projectMembers`, `projectReports`,
 *     `report`, `reportNotes`, `me`, `meLimits`.
 * What we deliberately skip:
 *   - `meUsage` — changes per-request, not worth persisting.
 *   - `reportDebug`, `health`, `resolveProjectSlug`, `resolveReportSlug`
 *     — derived / not user-facing list data.
 *   - `reportNotes` pages that still contain optimistic rows (ids
 *     prefixed `not_opt`). Those don't exist server-side yet and the
 *     in-flight mutation owns them; the next mount refetches.
 *
 * Cache namespace: authenticated user id. Each account has a separate
 * key, so a cold restore can never hydrate another account's data.
 *
 * Cache buster: app version. Bumping `app.config.ts` `version`
 * invalidates each persisted snapshot automatically (the persister
 * drops any cache whose `buster` differs).
 */
import Constants from 'expo-constants';
import { createMMKV } from 'react-native-mmkv';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';

/**
 * Minimal AsyncStorage shape the persister needs. We define it
 * locally because `@tanstack/query-async-storage-persister` does not
 * export the type (only consumes it structurally via its factory).
 */
interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<unknown> | unknown;
  removeItem: (key: string) => Promise<unknown> | unknown;
}

const STORAGE_ID = 'rq-cache';
const LEGACY_STORAGE_KEY = 'rq-cache-v1';
const STORAGE_KEY_PREFIX = 'rq-cache-v2';
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const THROTTLE_MS = 1_000;

const PERSISTED_KEY_HEADS = new Set<string>([
  'projects',
  'project',
  'projectMembers',
  'projectReports',
  'report',
  'reportNotes',
  'me',
  'meLimits',
]);

/**
 * Adapt MMKV (sync) to the `AsyncStorage` shape the persister wants.
 * Returning sync values is supported — the persister awaits the
 * (already-resolved) value either way.
 */
export function createMmkvAsyncStorage(): AsyncStorageLike {
  const storage = createMMKV({ id: STORAGE_ID });
  return {
    getItem(key) {
      return storage.getString(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
    removeItem(key) {
      storage.remove(key);
    },
  };
}

/**
 * Deep scan for an optimistic id prefix. Cheap: bails out at the first
 * hit, only walks objects/arrays, and capped by recursion depth so a
 * pathological cycle can't hang the persister.
 */
function containsOptimisticId(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null) return false;
  if (typeof value === 'string') return value.startsWith('not_opt');
  if (Array.isArray(value)) {
    for (const item of value) {
      if (containsOptimisticId(item, depth + 1)) return true;
    }
    return false;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (containsOptimisticId(v, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Per-query gate. Persist only successful queries whose queryKey head
 * is in the allowlist, and never persist a `reportNotes` page that
 * still has optimistic rows.
 */
export function shouldDehydrateQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const head = query.queryKey[0];
  if (typeof head !== 'string' || !PERSISTED_KEY_HEADS.has(head)) return false;
  if (head === 'reportNotes' && containsOptimisticId(query.state.data)) {
    return false;
  }
  return true;
}

export interface QueryPersister {
  persister: ReturnType<typeof createAsyncStoragePersister>;
  buster: string;
  maxAge: number;
}

/**
 * Build a persister for exactly one authenticated user. The legacy
 * unscoped key is discarded because its owner cannot be established
 * safely after an upgrade.
 */
export function createQueryPersister(userId: string): QueryPersister {
  if (userId.length === 0) {
    throw new Error('createQueryPersister requires a user id');
  }
  const storage = createMmkvAsyncStorage();
  void storage.removeItem(LEGACY_STORAGE_KEY);
  const persister = createAsyncStoragePersister({
    storage: storage as unknown as Parameters<
      typeof createAsyncStoragePersister
    >[0]['storage'],
    key: `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`,
    throttleTime: THROTTLE_MS,
  });
  // Read app version lazily so test environments without
  // `Constants.expoConfig` still load this module.
  const buster = Constants.expoConfig?.version ?? '0.0.0';
  return { persister, buster, maxAge: MAX_AGE_MS };
}

/**
 * Clear every user-scoped snapshot plus the unattributable legacy
 * snapshot. Used when auth resolves to no user, on explicit sign-out,
 * and after any API 401.
 */
export function clearPersistedQueryCaches(): void {
  createMMKV({ id: STORAGE_ID }).clearAll();
}
