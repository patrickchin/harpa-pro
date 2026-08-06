/**
 * Upload queue persistence.
 *
 * The in-memory queue (`createUploadQueue`) survives screen navigation
 * because `QueueProvider` is mounted at the root, but not app
 * restarts. To honour the "kill the app mid-upload, relaunch, resume
 * automatically" contract from
 * `docs/v4/plan-camera-upload-pipeline.md`, we serialise the
 * persistable slice of each job to **MMKV** (synchronous, no async
 * boundary in the hot path) on every state transition and rehydrate
 * at provider mount.
 *
 * What we persist:
 *   - `id`, `input`, `status`, `attempt`, `progress`, `error`, `fileId`,
 *     and `noteId` (the completion observer needs the canonical linkage after
 *     restart before it can release report-generation readiness).
 *
 * What we drop on rehydrate:
 *   - Promise resolve/reject callbacks (no caller is awaiting after
 *     restart — fire-and-forget).
 *   - In-flight states (`presigning|uploading|registering|creating_note`)
 *     are coerced to `pending` so the driver resumes from the top of
 *     the pipeline. Presign + R2 PUT are idempotent for our usage
 *     (each retry mints a fresh key), so re-running is safe.
 *   - Jobs whose `sourceUri` no longer resolves to a readable file
 *     (e.g. the OS swept the temp capture). Caller passes a
 *     `sourceExists` predicate so the persistence layer stays
 *     filesystem-agnostic.
 *
 * Test seam: pass a `QueuePersistence` other than `createMmkvPersistence()`
 * to construct an in-memory persistence instance. The default
 * `QueueProvider` wiring still uses MMKV (Pitfall 13: the default
 * gets the real collaborator).
 */
import { createMMKV } from 'react-native-mmkv';

import type { UploadJob } from './types';

/** Subset of `UploadJob` that we serialise. Promise handles are dropped. */
export type PersistedJob = Pick<
  UploadJob,
  | 'id'
  | 'input'
  | 'status'
  | 'attempt'
  | 'progress'
  | 'error'
  | 'fileId'
  | 'thumbnailFileId'
  | 'noteId'
>;

export interface QueuePersistence {
  load(): PersistedJob[];
  save(jobs: PersistedJob[]): void;
  clear(): void;
}

const LEGACY_STORAGE_KEY = 'v1';

function storageKeyForUser(userId?: string): string {
  return userId ? `v2.${userId}` : LEGACY_STORAGE_KEY;
}

/**
 * MMKV-backed persistence. Constructed lazily by `QueueProvider` at
 * mount; in test environments `react-native-mmkv` is replaced with an
 * in-memory `Map` stub (see `vitest.setup.ts`).
 */
export function createMmkvPersistence(userId?: string): QueuePersistence {
  const storage = createMMKV({ id: 'upload-queue' });
  const storageKey = storageKeyForUser(userId);

  // The pre-session-scoping blob cannot be attributed safely after an
  // account change, so discard it instead of migrating it to whichever
  // user happens to sign in first after the upgrade.
  if (userId) {
    storage.remove(LEGACY_STORAGE_KEY);
  }

  return {
    load(): PersistedJob[] {
      const raw = storage.getString(storageKey);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed as PersistedJob[];
      } catch {
        // Corrupt blob — drop it rather than crash on launch.
        storage.remove(storageKey);
        return [];
      }
    },
    save(jobs: PersistedJob[]): void {
      if (jobs.length === 0) {
        storage.remove(storageKey);
        return;
      }
      storage.set(storageKey, JSON.stringify(jobs));
    },
    clear(): void {
      storage.remove(storageKey);
    },
  };
}

/** In-memory persistence — for tests that need to inspect the blob. */
export function createInMemoryPersistence(
  initial: PersistedJob[] = [],
): QueuePersistence & { snapshot(): PersistedJob[] } {
  let state: PersistedJob[] = [...initial];
  return {
    load: () => [...state],
    save: (jobs) => {
      state = jobs.map((j) => ({ ...j }));
    },
    clear: () => {
      state = [];
    },
    snapshot: () => [...state],
  };
}

/**
 * Coerce a persisted job back into a runnable shape. In-flight states
 * become `pending` (the driver re-runs the whole pipeline) and
 * `attempt` is preserved so the retry budget remains honest.
 */
export function rehydrateJob(persisted: PersistedJob): PersistedJob {
  const status = persisted.status;
  const inFlight =
    status === 'presigning' ||
    status === 'uploading' ||
    status === 'registering' ||
    status === 'creating_note';
  return {
    ...persisted,
    status: inFlight ? 'pending' : status,
    progress: inFlight ? 0 : persisted.progress,
  };
}
