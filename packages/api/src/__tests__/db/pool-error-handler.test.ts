/**
 * Default-wiring proof for the pg pool's `error` listener.
 *
 * Why this exists: HARPA-PRO-A in Sentry was a fatal `read ETIMEDOUT`
 * surfaced as `auto.node.onuncaughtexception`. Neon kills idle
 * connections after a few minutes, the underlying TLS socket then
 * emits `error` on the next tick, pg re-emits it on the pool — and
 * without a registered listener, Node treats it as an uncaught
 * exception and crashes the worker. The fix is a single
 * `pool.on('error', …)` swallow at construction time. Pitfall 13:
 * assert the *default* wiring, not a stub.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

vi.mock('../../telemetry/sentry.js', () => ({
  captureApiException: vi.fn(),
}));

import { getPool, resetPool } from '../../db/client.js';
import { captureApiException } from '../../telemetry/sentry.js';

describe('pg pool error handler', () => {
  afterEach(async () => {
    await resetPool();
    vi.mocked(captureApiException).mockReset();
  });

  it('registers a listener for the pool "error" event by default', () => {
    const pool = getPool('postgresql://user:pw@127.0.0.1:1/db');
    // pg's Pool extends EventEmitter; `error` listeners count > 0
    // proves we won't crash the process when an idle client errors.
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
  });

  it('forwards a synthetic idle-client error to Sentry without throwing', () => {
    const pool = getPool('postgresql://user:pw@127.0.0.1:1/db');
    const err = Object.assign(new Error('read ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });
    // EventEmitter throws "Unhandled 'error' event" if nobody listens.
    // Emitting from inside this test confirms our listener absorbs it.
    expect(() => pool.emit('error', err, {} as pg.PoolClient)).not.toThrow();
    expect(captureApiException).toHaveBeenCalledTimes(1);
    expect(captureApiException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        route: 'pg.pool.idle-client',
        method: 'DB',
      }),
    );
  });
});
