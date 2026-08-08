import { afterEach, describe, expect, it, vi } from 'vitest';

const { defaultPoolQuery } = vi.hoisted(() => ({ defaultPoolQuery: vi.fn() }));

vi.mock('../db/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/client.js')>();
  return {
    ...actual,
    getPool: () => ({ query: defaultPoolQuery }),
  };
});

import { observeAdminStorageLifecycle } from './admin-storage-lifecycle.js';

const NOW = new Date('2026-08-08T08:00:00.000Z');
const OBSERVED_AT = '2026-08-08T07:59:59.123Z';
const ARMED_AT = '2026-08-08T07:40:00.000Z';
const ENFORCE_AFTER = '2026-08-08T07:45:00.000Z';
const UPDATED_AT = '2026-08-08T07:50:00.000Z';
const OLDEST_DUE_AT = '2026-08-08T07:00:00.000Z';
const NEXT_RUN_AFTER = '2026-08-08T09:00:00.000Z';
const DATABASE_SECRET = 'postgres://private-user:private-password@private.invalid/app';
const CAVEATS = [
  'db_state_not_worker_liveness',
  'queue_counts_not_provider_health',
  'empty_queue_not_execution_proof',
] as const;

type DatabaseRow = Record<string, unknown>;
type QueryApplicationDb = (
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
) => Promise<{ rows: readonly DatabaseRow[] }>;

function availableRow(overrides: DatabaseRow = {}): DatabaseRow {
  return {
    observed_at: new Date(OBSERVED_AT),
    armed_at: new Date(ARMED_AT),
    enforce_after: ENFORCE_AFTER,
    account_delete_enabled: true,
    lease_enforcement_active: true,
    updated_at: new Date(UPDATED_AT),
    total_jobs: 9,
    initial_jobs: 5,
    final_jobs: 4,
    due_now_jobs: 6,
    scheduled_jobs: 3,
    active_claims: 2,
    stale_claims: 1,
    retrying_jobs: 3,
    max_attempt_count: 7,
    oldest_due_at: new Date(OLDEST_DUE_AT),
    next_run_after: NEXT_RUN_AFTER,
    ...overrides,
  };
}

function queryWithRows(rows: readonly DatabaseRow[]): ReturnType<typeof vi.fn<QueryApplicationDb>> {
  return vi.fn<QueryApplicationDb>().mockResolvedValue({ rows });
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  defaultPoolQuery.mockReset();
});

describe('observeAdminStorageLifecycle', () => {
  it('uses the default app pool for one fixed, aggregate-only database-clock statement', async () => {
    defaultPoolQuery.mockResolvedValue({ rows: [availableRow()] });

    const result = await observeAdminStorageLifecycle();

    expect(result).toEqual({
      observedAt: OBSERVED_AT,
      status: 'available',
      rollout: {
        armedAt: ARMED_AT,
        enforceAfter: ENFORCE_AFTER,
        accountDeleteEnabled: true,
        leaseEnforcementActive: true,
        accountDeletionAvailable: true,
        updatedAt: UPDATED_AT,
      },
      jobs: {
        total: 9,
        initial: 5,
        final: 4,
        dueNow: 6,
        scheduled: 3,
        activeClaims: 2,
        staleClaims: 1,
        retrying: 3,
        maxAttemptCount: 7,
        oldestDueAt: OLDEST_DUE_AT,
        nextRunAfter: NEXT_RUN_AFTER,
      },
      caveats: CAVEATS,
    });

    expect(defaultPoolQuery).toHaveBeenCalledOnce();
    expect(defaultPoolQuery.mock.calls[0]).toHaveLength(2);
    const [rawSql, values] = defaultPoolQuery.mock.calls[0] ?? [];
    const sql = normalizeSql(String(rawSql));
    expect(values).toEqual([]);
    expect(sql).toMatch(/now\(\)\s+as\s+observed_at/);
    expect(sql).not.toContain('clock_timestamp()');
    expect(sql).toContain('from app.storage_lifecycle_rollout');
    expect(sql).toContain('app.file_upload_leases_enforced()');
    expect(sql).toContain('from app.storage_delete_jobs');
    expect(sql).toContain("job_kind = 'account_delete_initial'");
    expect(sql).toContain("job_kind = 'account_delete_final'");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain('last_error is not null');
    expect(sql).toMatch(/count\([^)]*\)(?:\s+filter\s*\([^)]*\))?::int/);
    expect(sql).toMatch(/coalesce\(max\(attempt_count\),\s*0\)::int/);
    expect(sql).not.toMatch(/\buser_id\b|\bpayload\b/);
    expect(sql).not.toContain('last_error as');
    expect(sql).not.toContain('locked_at as');
    expect(sql).not.toContain('group by');
    expect(sql).not.toContain(';');
  });

  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ] as const)(
    'derives account deletion availability from lease=%s and flag=%s only',
    async (leaseEnforcementActive, accountDeleteEnabled, accountDeletionAvailable) => {
      const query = queryWithRows([
        availableRow({
          enforce_after: leaseEnforcementActive ? ENFORCE_AFTER : '2026-08-08T08:05:00.000Z',
          lease_enforcement_active: leaseEnforcementActive,
          account_delete_enabled: accountDeleteEnabled,
        }),
      ]);

      const result = await observeAdminStorageLifecycle({ query, now: () => NOW });

      expect(result).toMatchObject({
        status: 'available',
        rollout: {
          leaseEnforcementActive,
          accountDeleteEnabled,
          accountDeletionAvailable,
        },
      });
      expect(query).toHaveBeenCalledOnce();
    },
  );

  it('normalizes the empty queue and nullable rollout markers without inventing evidence', async () => {
    const query = queryWithRows([
      availableRow({
        armed_at: null,
        enforce_after: null,
        account_delete_enabled: false,
        lease_enforcement_active: false,
        total_jobs: 0,
        initial_jobs: 0,
        final_jobs: 0,
        due_now_jobs: 0,
        scheduled_jobs: 0,
        active_claims: 0,
        stale_claims: 0,
        retrying_jobs: 0,
        max_attempt_count: 0,
        oldest_due_at: null,
        next_run_after: null,
      }),
    ]);

    await expect(observeAdminStorageLifecycle({ query, now: () => NOW })).resolves.toEqual({
      observedAt: OBSERVED_AT,
      status: 'available',
      rollout: {
        armedAt: null,
        enforceAfter: null,
        accountDeleteEnabled: false,
        leaseEnforcementActive: false,
        accountDeletionAvailable: false,
        updatedAt: UPDATED_AT,
      },
      jobs: {
        total: 0,
        initial: 0,
        final: 0,
        dueNow: 0,
        scheduled: 0,
        activeClaims: 0,
        staleClaims: 0,
        retrying: 0,
        maxAttemptCount: 0,
        oldestDueAt: null,
        nextRunAfter: null,
      },
      caveats: CAVEATS,
    });
  });

  it('fails closed when the fixed statement returns no rollout singleton', async () => {
    const query = queryWithRows([]);

    await expect(observeAdminStorageLifecycle({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'rollout_state_missing',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('fails closed when the query result omits its rows array', async () => {
    const query = vi.fn<QueryApplicationDb>().mockResolvedValue(
      {} as {
        rows: readonly DatabaseRow[];
      },
    );

    await expect(observeAdminStorageLifecycle({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    ['two rows', [availableRow(), availableRow()]],
    ['an extra payload field', [availableRow({ payload: { exactKeys: ['secret-key'] } })]],
    ['an extra user ID field', [availableRow({ user_id: 'usr_private123' })]],
    ['a raw retry error field', [availableRow({ last_error: 'secret provider failure' })]],
    ['a negative count', [availableRow({ stale_claims: -1 })]],
    ['an unsafe count', [availableRow({ total_jobs: Number.MAX_SAFE_INTEGER + 1 })]],
    ['a string count', [availableRow({ total_jobs: '9' })]],
    ['a null max attempt count', [availableRow({ max_attempt_count: null })]],
    ['an invalid database clock', [availableRow({ observed_at: 'not-a-timestamp' })]],
    ['an invalid timestamp', [availableRow({ updated_at: 'not-a-timestamp' })]],
    ['a non-finite timestamp', [availableRow({ armed_at: new Date(Number.NaN) })]],
    ['a non-boolean rollout flag', [availableRow({ account_delete_enabled: 1 })]],
    ['an inconsistent aggregate', [availableRow({ initial_jobs: 4 })]],
  ] as const)('maps %s to a strict redacted invalid response', async (_label, rows) => {
    const query = queryWithRows(rows);

    const result = await observeAdminStorageLifecycle({ query, now: () => NOW });

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /usr_private123|secret-key|secret provider failure|payload|last_error|user_id/,
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it('redacts a database failure and does not retry', async () => {
    const query = vi.fn<QueryApplicationDb>().mockRejectedValue(new Error(DATABASE_SECRET));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await observeAdminStorageLifecycle({ query, now: () => NOW });

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'database_unavailable',
    });
    expect(query).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(DATABASE_SECRET);
    for (const spy of [errors, warnings, logs]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(DATABASE_SECRET);
    }
  });

  it('maps PostgreSQL statement cancellation to timeout without retrying', async () => {
    const query = vi
      .fn<QueryApplicationDb>()
      .mockRejectedValue(Object.assign(new Error(DATABASE_SECRET), { code: '57014' }));

    await expect(observeAdminStorageLifecycle({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    ['a DOM AbortError', new DOMException('aborted', 'AbortError')],
    ['an Error named AbortError', Object.assign(new Error('aborted'), { name: 'AbortError' })],
  ])('maps %s to timeout without retrying', async (_label, error) => {
    const query = vi.fn<QueryApplicationDb>().mockRejectedValue(error);

    await expect(observeAdminStorageLifecycle({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('bounds a default-pool query that never settles at the five-second deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    defaultPoolQuery.mockImplementation(async (_text: string, values: readonly unknown[]) => {
      expect(values).toEqual([]);
      return new Promise<never>(() => undefined);
    });

    const pending = observeAdminStorageLifecycle({ now: () => new Date(Date.now()) });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(defaultPoolQuery).toHaveBeenCalledOnce();
    expect(defaultPoolQuery.mock.calls[0]).toHaveLength(2);
  });

  it('aborts the single statement at the five-second deadline without retrying', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let querySignal: AbortSignal | undefined;
    const query = vi.fn<QueryApplicationDb>(async (_text, values, signal) => {
      expect(values).toEqual([]);
      querySignal = signal;
      return new Promise<{ rows: readonly DatabaseRow[] }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    const pending = observeAdminStorageLifecycle({
      query,
      now: () => new Date(Date.now()),
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    expect(querySignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(querySignal?.aborted).toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });
});
