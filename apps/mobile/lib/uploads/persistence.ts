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
 *   - `id`, `input`, `status`, `attempt`, `progress`, `error`, `fileId`.
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
  'id' | 'input' | 'status' | 'attempt' | 'progress' | 'error' | 'fileId' | 'thumbnailFileId'
>;

export interface QueuePersistence {
  load(): PersistedJob[];
  save(jobs: PersistedJob[]): void;
  clear(): void;
}

const STORAGE_KEY = 'v1';

/**
 * MMKV-backed persistence. Constructed lazily by `QueueProvider` at
 * mount; in test environments `react-native-mmkv` is replaced with an
 * in-memory `Map` stub (see `vitest.setup.ts`).
 */
export function createMmkvPersistence(): QueuePersistence {
  const storage = createMMKV({ id: 'upload-queue' });

  return {
    load(): PersistedJob[] {
      const raw = storage.getString(STORAGE_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed as PersistedJob[];
      } catch {
        // Corrupt blob — drop it rather than crash on launch.
        storage.remove(STORAGE_KEY);
        return [];
      }
    },
    save(jobs: PersistedJob[]): void {
      if (jobs.length === 0) {
        storage.remove(STORAGE_KEY);
        return;
      }
      storage.set(STORAGE_KEY, JSON.stringify(jobs));
    },
    clear(): void {
      storage.remove(STORAGE_KEY);
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
