import { z } from 'zod';
import { getPool } from '../db/client.js';
import {
  executeStorageCleanupPlan,
  type StorageCleanupPlan,
} from './account-deletion.js';
import { pickStorage, type Storage } from './storage.js';

const payloadSchema = z.object({
  userId: z.string().min(1),
  exactKeys: z.array(z.string().min(1)),
  sweepPrefixes: z.array(z.string().min(1)),
});

interface ClaimedJob {
  user_id: string;
  job_kind: string;
  payload: unknown;
  attempt_count: number;
  locked_at: Date;
}

export interface DrainStorageDeleteJobsOptions {
  /** Bound one drain pass so a route or worker iteration cannot monopolise the process. */
  maxJobs?: number;
  /** Fast-path filter used by DELETE /me after its database transaction commits. */
  userId?: string;
  /** Negative-path test seam. Production and the MinIO proof use pickStorage(). */
  storage?: Storage;
}

export interface DrainStorageDeleteJobsResult {
  claimed: number;
  completed: number;
  failed: number;
}

export interface PruneExpiredUploadLeasesResult {
  consumedLeasesPruned: number;
  unconsumedLeasesPruned: number;
  orphanObjectsDeleted: number;
}

const STALE_CLAIM_AFTER_MINUTES = 5;
const MAX_JOBS_PER_PASS = 100;
const MAX_LEASES_PER_PASS = 1_000;
const PRESIGN_SAFETY_SECONDS = 30;

/**
 * Return when the oldest job can next be claimed.
 *
 * The service-less worker uses this to avoid waking Neon every few seconds
 * while still sleeping only until a known retry or delayed final pass is due.
 * A live claim becomes eligible again when its five-minute claim lease ends.
 */
export async function getNextStorageDeleteJobWakeAt(): Promise<Date | null> {
  const result = await getPool().query<{ wake_at: Date | null }>(
    `SELECT min(
       CASE
         WHEN locked_at IS NULL THEN run_after
         ELSE greatest(
           run_after,
           locked_at + make_interval(mins => $1::int)
         )
       END
     ) AS wake_at
     FROM app.storage_delete_jobs`,
    [STALE_CLAIM_AFTER_MINUTES],
  );
  return result.rows[0]?.wake_at ?? null;
}

/**
 * Claim and execute due storage-delete jobs.
 *
 * Claiming is one UPDATE fed by `FOR UPDATE SKIP LOCKED`, so concurrent
 * workers never wait on or execute the same live claim. Object deletion is
 * outside the database transaction; `locked_at` acts as a compare-and-delete
 * token so a worker that outlives its five-minute lease cannot remove a newer
 * worker's claim.
 */
export async function drainStorageDeleteJobs(
  options: DrainStorageDeleteJobsOptions = {},
): Promise<DrainStorageDeleteJobsResult> {
  const maxJobs = Math.max(
    1,
    Math.min(MAX_JOBS_PER_PASS, Math.trunc(options.maxJobs ?? 10)),
  );
  const storage = options.storage ?? pickStorage();
  const result: DrainStorageDeleteJobsResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
  };

  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextJob(options.userId);
    if (!job) break;
    result.claimed += 1;

    try {
      const payload = payloadSchema.parse(job.payload);
      const cleanup = await executeStorageCleanupPlan(
        storage,
        payload satisfies StorageCleanupPlan,
      );
      if (
        cleanup.failures.length > 0 ||
        cleanup.truncatedPrefixes.length > 0
      ) {
        const operations = cleanup.failures.map((failure) => failure.operation);
        throw new Error(
          [
            operations.length > 0
              ? `operations=${operations.join(',')}`
              : null,
            cleanup.truncatedPrefixes.length > 0
              ? `truncated=${cleanup.truncatedPrefixes.join(',')}`
              : null,
          ]
            .filter(Boolean)
            .join(' '),
        );
      }

      const completed = await completeClaim(job);
      if (completed) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      await retryClaim(job, error);
      result.failed += 1;
    }
  }

  return result;
}

/**
 * Bound lease-table growth after signed PUT capabilities expire.
 *
 * Consumed leases can be dropped once the URL plus safety window expires
 * because app.files is then the durable object record. For unconsumed leases,
 * hold row locks while deleting the exact objects first; registration blocks
 * on those rows and either completed before the claim or receives a clean 409
 * after the lease is removed.
 */
export async function pruneExpiredFileUploadLeases(
  options: {
    maxLeases?: number;
    storage?: Storage;
  } = {},
): Promise<PruneExpiredUploadLeasesResult> {
  const maxLeases = Math.max(
    1,
    Math.min(
      MAX_LEASES_PER_PASS,
      Math.trunc(options.maxLeases ?? MAX_LEASES_PER_PASS),
    ),
  );
  const storage = options.storage ?? pickStorage();
  const connection = await getPool().connect();

  try {
    await connection.query('BEGIN');
    const consumed = await connection.query(
      `WITH candidates AS (
         SELECT file_id
         FROM app.file_upload_leases
         WHERE consumed_at IS NOT NULL
           AND presign_expires_at
               + make_interval(secs => $2::int) <= now()
         ORDER BY presign_expires_at, file_id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       DELETE FROM app.file_upload_leases AS lease
       USING candidates
       WHERE lease.file_id = candidates.file_id`,
      [maxLeases, PRESIGN_SAFETY_SECONDS],
    );

    const unconsumed = await connection.query<{
      file_id: string;
      file_key: string;
    }>(
      `SELECT file_id, file_key
       FROM app.file_upload_leases
       WHERE consumed_at IS NULL
         AND presign_expires_at
             + make_interval(secs => $2::int) <= now()
       ORDER BY presign_expires_at, file_id
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [maxLeases, PRESIGN_SAFETY_SECONDS],
    );
    const keys = unconsumed.rows.map((row) => row.file_key);
    if (keys.length > 0) {
      await storage.deleteObjects(keys);
      await connection.query(
        `DELETE FROM app.file_upload_leases
         WHERE file_id = ANY($1::app.fil_id[])
           AND consumed_at IS NULL
           AND presign_expires_at
               + make_interval(secs => $2::int) <= now()`,
        [
          unconsumed.rows.map((row) => row.file_id),
          PRESIGN_SAFETY_SECONDS,
        ],
      );
    }

    await connection.query('COMMIT');
    return {
      consumedLeasesPruned: consumed.rowCount ?? 0,
      unconsumedLeasesPruned: unconsumed.rowCount ?? 0,
      orphanObjectsDeleted: keys.length,
    };
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function claimNextJob(userId?: string): Promise<ClaimedJob | null> {
  const claimed = await getPool().query<ClaimedJob>(
    `WITH candidate AS (
       SELECT user_id, job_kind
       FROM app.storage_delete_jobs
       WHERE run_after <= now()
         AND (
           locked_at IS NULL
           OR locked_at < now() - make_interval(mins => $2::int)
         )
         AND ($1::text IS NULL OR user_id = $1::app.usr_id)
       ORDER BY run_after ASC, user_id ASC, job_kind ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE app.storage_delete_jobs AS job
     SET locked_at = date_trunc('milliseconds', clock_timestamp()),
         attempt_count = job.attempt_count + 1,
         last_error = NULL,
         updated_at = now()
     FROM candidate
     WHERE job.user_id = candidate.user_id
       AND job.job_kind = candidate.job_kind
     RETURNING
       job.user_id,
       job.job_kind,
       job.payload,
       job.attempt_count,
       job.locked_at`,
    [userId ?? null, STALE_CLAIM_AFTER_MINUTES],
  );
  return claimed.rows[0] ?? null;
}

async function completeClaim(job: ClaimedJob): Promise<boolean> {
  const deleted = await getPool().query(
    `DELETE FROM app.storage_delete_jobs
     WHERE user_id = $1::app.usr_id
       AND job_kind = $2
       AND locked_at = $3::timestamptz`,
    [job.user_id, job.job_kind, job.locked_at],
  );
  return deleted.rowCount === 1;
}

async function retryClaim(job: ClaimedJob, error: unknown): Promise<void> {
  const delaySeconds = Math.min(
    3_600,
    5 * 2 ** Math.min(Math.max(job.attempt_count - 1, 0), 10),
  );
  const message = error instanceof Error ? error.message : String(error);
  await getPool().query(
    `UPDATE app.storage_delete_jobs
     SET locked_at = NULL,
         last_error = $4,
         run_after = now() + make_interval(secs => $5::int),
         updated_at = now()
     WHERE user_id = $1::app.usr_id
       AND job_kind = $2
       AND locked_at = $3::timestamptz`,
    [
      job.user_id,
      job.job_kind,
      job.locked_at,
      message.slice(0, 2_000),
      delaySeconds,
    ],
  );
}
