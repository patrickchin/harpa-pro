/**
 * GET /readyz — readiness probe used by Fly's HTTP health check.
 *
 * Distinct from /healthz (cheap static literal, liveness):
 *  - opens a real DB connection from the pool,
 *  - verifies app._migrations exists,
 *  - asserts its newest row matches env.MIGRATIONS_REQUIRED_HEAD (set
 *    at image build time so the running container knows what schema
 *    its code expects).
 *
 * Returns 503 (not 500) on failure so Fly + load balancers treat the
 * machine as "not ready" rather than buggy, and auto-rollback engages.
 *
 * See docs/v4/arch-cicd-and-migrations.md.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { getPool } from '../db/client.js';
// NB: do not import `env` for MIGRATIONS_REQUIRED_HEAD — env is parsed once
// at module load. Reading process.env at probe time lets ops set the var
// without a full restart (and lets tests cover the mismatch path).

const OkResponse = z.object({
  ok: z.literal(true),
  db: z.literal('up'),
  head: z.string().nullable(),
});

const FailResponse = z.object({
  ok: z.literal(false),
  db: z.enum(['down', 'schema-missing', 'head-mismatch']),
  expected: z.string().optional(),
  actual: z.string().nullable().optional(),
  message: z.string().optional(),
});

type Ok = z.infer<typeof OkResponse>;
type Fail = z.infer<typeof FailResponse>;

const GREEN_TTL_MS = 2_000;
let cachedOk: { at: number; body: Ok } | null = null;

/** Test-only hook so integration tests don't fight a stale cache. */
export function resetReadyzCache(): void {
  cachedOk = null;
}

async function probe(): Promise<{ status: 200; body: Ok } | { status: 503; body: Fail }> {
  if (cachedOk && Date.now() - cachedOk.at < GREEN_TTL_MS) {
    return { status: 200, body: cachedOk.body };
  }
  let pool;
  try {
    pool = getPool();
  } catch (err) {
    return {
      status: 503,
      body: { ok: false, db: 'down', message: (err as Error).message },
    };
  }
  try {
    await pool.query('SELECT 1');
    const schemaCheck = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('app._migrations') IS NOT NULL AS exists`,
    );
    if (!schemaCheck.rows[0]?.exists) {
      return { status: 503, body: { ok: false, db: 'schema-missing' } };
    }
    const headRow = await pool.query<{ name: string }>(
      `SELECT name FROM app._migrations ORDER BY name DESC LIMIT 1`,
    );
    const actual = headRow.rows[0]?.name ?? null;
    const expected = process.env.MIGRATIONS_REQUIRED_HEAD;
    if (expected && actual !== expected) {
      return {
        status: 503,
        body: { ok: false, db: 'head-mismatch', expected, actual },
      };
    }
    const body: Ok = { ok: true, db: 'up', head: actual };
    cachedOk = { at: Date.now(), body };
    return { status: 200, body };
  } catch (err) {
    return {
      status: 503,
      body: { ok: false, db: 'down', message: (err as Error).message },
    };
  }
}

export const readyz = new OpenAPIHono<AppEnv>(openApiHonoOptions).openapi(
  createRoute({
    method: 'get',
    path: '/readyz',
    tags: ['health'],
    responses: {
      200: {
        description: 'Service is ready to serve traffic.',
        content: { 'application/json': { schema: OkResponse } },
      },
      503: {
        description: 'Service is not ready (DB or schema check failed).',
        content: { 'application/json': { schema: FailResponse } },
      },
    },
  }),
  async (c) => {
    const result = await probe();
    if (result.status === 200) {
      return c.json(result.body, 200);
    }
    return c.json(result.body, 503);
  },
);
