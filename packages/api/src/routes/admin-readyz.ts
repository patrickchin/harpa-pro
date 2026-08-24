/**
 * GET /admin/readyz — post-deploy readiness probe for the isolated admin DB.
 *
 * Fly keeps using /readyz for machine routing. This probe is separate so an
 * admin-only database incident does not remove the product API from service.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { getAdminPool } from '../db/admin-client.js';
import { probeMigrationLedger } from '../lib/migration-ledger.js';

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
});

type Ok = z.infer<typeof OkResponse>;
type Fail = z.infer<typeof FailResponse>;
type ProbeResult = { status: 200; body: Ok } | { status: 503; body: Fail };

const GREEN_TTL_MS = 2_000;
const FAILURE_TTL_MS = 1_000;
let cachedProbe: { expiresAt: number; result: ProbeResult } | null = null;
let inFlightProbe: Promise<ProbeResult> | null = null;

/** Test-only hook so integration tests do not observe a prior green probe. */
export function resetAdminReadyzCache(): void {
  cachedProbe = null;
  inFlightProbe = null;
}

async function runProbe(): Promise<ProbeResult> {
  try {
    const pool = getAdminPool();
    const ledger = await probeMigrationLedger({ pool, schema: 'admin' });
    if (!ledger.ok) {
      return { status: 503, body: ledger };
    }
    const actual = ledger.head;
    const expected = process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD;
    if (expected && actual !== expected) {
      return {
        status: 503,
        body: { ok: false, db: 'head-mismatch', expected, actual },
      };
    }

    const body: Ok = { ok: true, db: 'up', head: actual };
    return { status: 200, body };
  } catch {
    return { status: 503, body: { ok: false, db: 'down' } };
  }
}

async function runAndCacheProbe(): Promise<ProbeResult> {
  const result = await runProbe();
  cachedProbe = {
    expiresAt: Date.now() + (result.status === 200 ? GREEN_TTL_MS : FAILURE_TTL_MS),
    result,
  };
  return result;
}

async function probe(): Promise<ProbeResult> {
  if (cachedProbe && Date.now() < cachedProbe.expiresAt) {
    return cachedProbe.result;
  }
  if (inFlightProbe) return inFlightProbe;

  const currentProbe = runAndCacheProbe();
  inFlightProbe = currentProbe;
  try {
    return await currentProbe;
  } finally {
    if (inFlightProbe === currentProbe) inFlightProbe = null;
  }
}

export const adminReadyz = new OpenAPIHono<AppEnv>(openApiHonoOptions).openapi(
  createRoute({
    method: 'get',
    path: '/admin/readyz',
    tags: ['health'],
    responses: {
      200: {
        description: 'The isolated admin service database is ready.',
        content: { 'application/json': { schema: OkResponse } },
      },
      503: {
        description: 'The isolated admin database or schema is not ready.',
        content: { 'application/json': { schema: FailResponse } },
      },
    },
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store');
    const result = await probe();
    return result.status === 200 ? c.json(result.body, 200) : c.json(result.body, 503);
  },
);
