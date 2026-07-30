import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../telemetry/sentry.js', () => ({
  captureApiException: vi.fn(),
}));

import { getAdminPool, resetAdminPool } from '../../db/admin-client.js';

describe('admin pg pool defaults', () => {
  afterEach(async () => {
    await resetAdminPool();
  });

  it('bounds connection establishment and pool checkout alongside statements', () => {
    const pool = getAdminPool('postgresql://user:pw@127.0.0.1:1/admin');

    expect(pool.options.connectionTimeoutMillis).toBe(5_000);
    expect(pool.options.statement_timeout).toBe(5_000);
  });
});
