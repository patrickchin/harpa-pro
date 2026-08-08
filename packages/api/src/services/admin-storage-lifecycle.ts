import {
  operations,
  type StorageLifecycleObservation,
  type StorageLifecycleReason,
} from '@harpa/api-contract';
import { z } from 'zod';
import { getPool } from '../db/client.js';

const OBSERVATION_TIMEOUT_MS = 5_000;
const EMPTY_QUERY_VALUES: readonly unknown[] = [];
const TIMED_OUT = Symbol('storage-lifecycle-observation-timed-out');

const OBSERVATION_SQL = `WITH observation_clock AS MATERIALIZED (
  SELECT now() AS observed_at
),
rollout AS (
  SELECT
    rollout.armed_at,
    rollout.enforce_after,
    rollout.account_delete_enabled,
    app.file_upload_leases_enforced() AS lease_enforcement_active,
    rollout.updated_at
  FROM app.storage_lifecycle_rollout AS rollout
  WHERE rollout.singleton = true
),
jobs AS (
  SELECT
    COUNT(*)::int AS total_jobs,
    COUNT(*) FILTER (
      WHERE job.job_kind = 'account_delete_initial'
    )::int AS initial_jobs,
    COUNT(*) FILTER (
      WHERE job.job_kind = 'account_delete_final'
    )::int AS final_jobs,
    COUNT(*) FILTER (
      WHERE job.run_after <= clock.observed_at
    )::int AS due_now_jobs,
    COUNT(*) FILTER (
      WHERE job.run_after > clock.observed_at
    )::int AS scheduled_jobs,
    COUNT(*) FILTER (
      WHERE job.run_after <= clock.observed_at
        AND job.locked_at IS NOT NULL
        AND job.locked_at >= clock.observed_at - INTERVAL '5 minutes'
    )::int AS active_claims,
    COUNT(*) FILTER (
      WHERE job.run_after <= clock.observed_at
        AND job.locked_at IS NOT NULL
        AND job.locked_at < clock.observed_at - INTERVAL '5 minutes'
    )::int AS stale_claims,
    COUNT(*) FILTER (
      WHERE job.last_error IS NOT NULL
    )::int AS retrying_jobs,
    COALESCE(MAX(attempt_count), 0)::int AS max_attempt_count,
    MIN(job.run_after) FILTER (
      WHERE job.run_after <= clock.observed_at
    ) AS oldest_due_at,
    MIN(job.run_after) FILTER (
      WHERE job.run_after > clock.observed_at
    ) AS next_run_after
  FROM app.storage_delete_jobs AS job
  CROSS JOIN observation_clock AS clock
)
SELECT
  clock.observed_at,
  rollout.armed_at,
  rollout.enforce_after,
  rollout.account_delete_enabled,
  rollout.lease_enforcement_active,
  rollout.updated_at,
  jobs.total_jobs,
  jobs.initial_jobs,
  jobs.final_jobs,
  jobs.due_now_jobs,
  jobs.scheduled_jobs,
  jobs.active_claims,
  jobs.stale_claims,
  jobs.retrying_jobs,
  jobs.max_attempt_count,
  jobs.oldest_due_at,
  jobs.next_run_after
FROM observation_clock AS clock
CROSS JOIN rollout
CROSS JOIN jobs`;

const databaseTimestamp = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)).toISOString());
const nullableDatabaseTimestamp = databaseTimestamp.nullable();
const databaseCount = z.number().int().nonnegative().safe();

const databaseRow = z
  .object({
    observed_at: databaseTimestamp,
    armed_at: nullableDatabaseTimestamp,
    enforce_after: nullableDatabaseTimestamp,
    account_delete_enabled: z.boolean(),
    lease_enforcement_active: z.boolean(),
    updated_at: databaseTimestamp,
    total_jobs: databaseCount,
    initial_jobs: databaseCount,
    final_jobs: databaseCount,
    due_now_jobs: databaseCount,
    scheduled_jobs: databaseCount,
    active_claims: databaseCount,
    stale_claims: databaseCount,
    retrying_jobs: databaseCount,
    max_attempt_count: databaseCount,
    oldest_due_at: nullableDatabaseTimestamp,
    next_run_after: nullableDatabaseTimestamp,
  })
  .strict();

type DatabaseRow = Record<string, unknown>;
type QueryResult = { rows: readonly DatabaseRow[] };
type QueryApplicationDatabase = (
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
) => Promise<QueryResult>;

export interface ObserveAdminStorageLifecycleOptions {
  query?: QueryApplicationDatabase;
  now?: () => Date;
}

/**
 * Read one bounded, aggregate-only storage lifecycle snapshot for the
 * dedicated browser-admin surface. The observer has no retry, write, cache,
 * polling, provider, or row-level inspection path.
 */
export async function observeAdminStorageLifecycle(
  options: ObserveAdminStorageLifecycleOptions = {},
): Promise<StorageLifecycleObservation> {
  const fallbackObservedAt = (options.now ?? (() => new Date()))().toISOString();
  const query = options.query ?? queryApplicationDatabase;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), OBSERVATION_TIMEOUT_MS);
  deadline.unref?.();

  let queryResult: QueryResult | typeof TIMED_OUT;
  try {
    const pending = Promise.resolve().then(() =>
      query(OBSERVATION_SQL, EMPTY_QUERY_VALUES, controller.signal),
    );
    queryResult = await raceWithAbort(pending, controller.signal);
  } catch (error) {
    return unknownObservation(
      fallbackObservedAt,
      isTimeout(error, controller.signal) ? 'timeout' : 'database_unavailable',
    );
  } finally {
    clearTimeout(deadline);
  }

  if (queryResult === TIMED_OUT) {
    return unknownObservation(fallbackObservedAt, 'timeout');
  }

  let rows: readonly DatabaseRow[];
  try {
    if (!queryResult || !Array.isArray(queryResult.rows)) {
      return unknownObservation(fallbackObservedAt, 'invalid_response');
    }
    rows = queryResult.rows;
  } catch {
    return unknownObservation(fallbackObservedAt, 'invalid_response');
  }

  if (rows.length === 0) {
    return unknownObservation(fallbackObservedAt, 'rollout_state_missing');
  }
  if (rows.length !== 1) {
    return unknownObservation(fallbackObservedAt, 'invalid_response');
  }

  let parsedRow: z.infer<typeof databaseRow>;
  try {
    const parsed = databaseRow.safeParse(rows[0]);
    if (!parsed.success) {
      return unknownObservation(fallbackObservedAt, 'invalid_response');
    }
    parsedRow = parsed.data;
  } catch {
    return unknownObservation(fallbackObservedAt, 'invalid_response');
  }

  const candidate = {
    observedAt: parsedRow.observed_at,
    status: 'available' as const,
    rollout: {
      armedAt: parsedRow.armed_at,
      enforceAfter: parsedRow.enforce_after,
      accountDeleteEnabled: parsedRow.account_delete_enabled,
      leaseEnforcementActive: parsedRow.lease_enforcement_active,
      accountDeletionAvailable:
        parsedRow.lease_enforcement_active && parsedRow.account_delete_enabled,
      updatedAt: parsedRow.updated_at,
    },
    jobs: {
      total: parsedRow.total_jobs,
      initial: parsedRow.initial_jobs,
      final: parsedRow.final_jobs,
      dueNow: parsedRow.due_now_jobs,
      scheduled: parsedRow.scheduled_jobs,
      activeClaims: parsedRow.active_claims,
      staleClaims: parsedRow.stale_claims,
      retrying: parsedRow.retrying_jobs,
      maxAttemptCount: parsedRow.max_attempt_count,
      oldestDueAt: parsedRow.oldest_due_at,
      nextRunAfter: parsedRow.next_run_after,
    },
    caveats: operations.storageLifecycleCaveats,
  };
  const observation = operations.storageLifecycleObservation.safeParse(candidate);
  return observation.success
    ? observation.data
    : unknownObservation(fallbackObservedAt, 'invalid_response');
}

function queryApplicationDatabase(
  text: string,
  values: readonly unknown[],
  _signal: AbortSignal,
): Promise<QueryResult> {
  // The app pool also enforces a server-side 5 s statement_timeout. The
  // observer-wide abort race above independently bounds pool acquisition.
  return getPool().query<DatabaseRow>(text, [...values]);
}

function raceWithAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(TIMED_OUT);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function unknownObservation(
  observedAt: string,
  reason: StorageLifecycleReason,
): StorageLifecycleObservation {
  return { observedAt, status: 'unknown', reason };
}

function isTimeout(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return hasErrorCode(error, '57014');
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
