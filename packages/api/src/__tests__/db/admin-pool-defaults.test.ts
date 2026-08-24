import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../telemetry/sentry.js', () => ({
  captureApiException: vi.fn(),
}));

import { getAdminPool, resetAdminPool } from '../../db/admin-client.js';
import { captureApiException } from '../../telemetry/sentry.js';

describe('admin pg pool defaults', () => {
  afterEach(async () => {
    await resetAdminPool();
    vi.mocked(captureApiException).mockReset();
  });

  it('keeps the admin profile and singleton contract', () => {
    const pool = getAdminPool('postgresql://user:pw@127.0.0.1:1/admin');

    expect(getAdminPool('postgresql://other:pw@127.0.0.1:2/ignored')).toBe(pool);
    expect(pool.options).toMatchObject({
      max: 5,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
    });
  });

  it('reports idle-client errors with the admin telemetry tag', () => {
    const pool = getAdminPool('postgresql://user:pw@127.0.0.1:1/admin');
    const error = Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' });

    expect(() => pool.emit('error', error, {} as pg.PoolClient)).not.toThrow();
    expect(captureApiException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ route: 'pg.admin-pool.idle-client' }),
    );
  });
});
