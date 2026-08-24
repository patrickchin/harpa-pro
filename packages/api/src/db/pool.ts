import pg from 'pg';
import { captureApiException, type ApiExceptionContext } from '../telemetry/sentry.js';
import { parseConnection } from './connection.js';

const { Pool } = pg;

/**
 * Server-side cap on any single statement's execution time. It bounds runaway
 * queries without imposing a connection deadline on the application pool.
 */
const STATEMENT_TIMEOUT_MS = 5_000;

interface ObservedPoolOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis?: number;
  idleErrorContext: Pick<ApiExceptionContext, 'requestId' | 'route'>;
}

/** Build a pool with the shared TLS, statement-limit, and idle-error wiring. */
export function createObservedPool(options: ObservedPoolOptions): pg.Pool {
  const pool = new Pool({
    ...parseConnection(options.connectionString),
    max: options.max,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ...(options.connectionTimeoutMillis === undefined
      ? {}
      : { connectionTimeoutMillis: options.connectionTimeoutMillis }),
  });

  pool.on('error', (error) => {
    captureApiException(error, {
      ...options.idleErrorContext,
      method: 'DB',
      status: 0,
    });
  });

  return pool;
}
