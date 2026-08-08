import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { operations } from '@harpa/api-contract';
import type { ReportGenerateDiagnosticObservation } from '@harpa/api-contract';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { runAdminReportGenerateDiagnostic } from '../lib/admin-report-diagnostic.js';
import { ADMIN_CSRF_HEADER, withAdminCsrf } from '../lib/admin-csrf.js';
import { observeAdminNeonInventory } from '../lib/neon-operations.js';
import { observeAdminR2Capacity } from '../lib/r2-operations.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { withTrustedAdminOrigin } from '../middleware/admin-origin.js';
import { adminAuthIpWindow } from '../middleware/admin-rate-limit.js';
import { withAdminSession } from '../middleware/admin-session.js';
import { withRateLimit } from '../middleware/rateLimit.js';

const MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

const adminCsrfHeader = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const privateNoStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  // This must run before either limiter and authentication so their 401/429
  // responses inherit the same cache policy as successful observations.
  c.header('Cache-Control', 'private, no-store');
  await next();
};

function adminOperationsRateLimitKey(c: Context<AppEnv>): string {
  const identityId = c.get('adminIdentityId');
  const sessionId = c.get('adminSessionId');
  if (!identityId || !sessionId) {
    throw new HTTPException(401, { message: 'Unauthorized.' });
  }
  return `${identityId}:${sessionId}`;
}

function auditReportDiagnostic(
  c: Context<AppEnv>,
  observation: ReportGenerateDiagnosticObservation,
): void {
  const common = {
    requestId: c.get('requestId'),
    adminIdentityId: c.get('adminIdentityId'),
    adminSessionId: c.get('adminSessionId'),
  };

  const details =
    observation.status === 'pass' || observation.status === 'warning'
      ? {
          outcome: `report_generate_${observation.status}`,
          durationMs: observation.durationMs,
          projectId: observation.target.projectId,
          reportNumber: observation.target.reportNumber,
          provider: observation.generation.vendor,
          model: observation.generation.model,
          fixtureMode: observation.generation.fixtureMode,
          idempotentReplay: observation.generation.idempotentReplay,
          downstreamRequestId: observation.generation.requestId ?? undefined,
          cleanup: observation.cleanup,
          warnings: observation.status === 'warning' ? observation.warnings : undefined,
        }
      : observation.status === 'fail'
        ? {
            outcome: 'report_generate_fail',
            durationMs: observation.durationMs,
            phase: observation.phase,
            reason: observation.reason,
            cleanup: observation.cleanup,
          }
        : {
            outcome: 'report_generate_not_configured',
            reason: observation.reason,
          };

  // The runner has already reduced the result to the strict reviewed schema.
  // Keep this operational audit metadata-only; never serialize response bodies.
  console.info('[admin-operations]', JSON.stringify({ ...common, ...details }));
}

const adminNeonOperationsRateLimit = withRateLimit({
  name: 'admin.operations.neon.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminR2CapacityRateLimit = withRateLimit({
  name: 'admin.operations.r2-capacity.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminReportDiagnosticRateLimit = withRateLimit({
  name: 'admin.operations.report-generate.run.15m',
  keyBy: adminOperationsRateLimitKey,
  limit: 3,
  windowMs: FIFTEEN_MINUTES_MS,
  getLimiter: getAdminRateLimiter,
});

export const adminOperationsRoutes = new OpenAPIHono<AppEnv>();

adminOperationsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/operations/neon',
    tags: ['admin'],
    security: [{ adminSession: [] }],
    middleware: [
      privateNoStore,
      adminAuthIpWindow,
      withAdminSession(),
      adminNeonOperationsRateLimit,
    ] as const,
    responses: {
      200: {
        description: 'Bounded, read-only Neon organization inventory.',
        content: {
          'application/json': { schema: operations.neonInventoryObservation },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => c.json(await observeAdminNeonInventory(), 200),
);

adminOperationsRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/operations/report-generate',
    tags: ['admin'],
    security: [{ adminSession: [] }],
    request: {
      headers: z.object({ [ADMIN_CSRF_HEADER]: adminCsrfHeader }),
    },
    middleware: [
      privateNoStore,
      withTrustedAdminOrigin(),
      adminAuthIpWindow,
      withAdminSession(),
      withAdminCsrf(),
      adminReportDiagnosticRateLimit,
    ] as const,
    responses: {
      200: {
        description: 'Bounded report-generation diagnostic observation.',
        content: {
          'application/json': { schema: operations.reportGenerateDiagnosticObservation },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorBody } },
      },
      403: {
        description: 'Untrusted origin or invalid CSRF token.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => {
    const observation = await runAdminReportGenerateDiagnostic();
    auditReportDiagnostic(c, observation);
    return c.json(observation, 200);
  },
);

adminOperationsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/operations/r2-capacity',
    tags: ['admin'],
    security: [{ adminSession: [] }],
    middleware: [
      privateNoStore,
      adminAuthIpWindow,
      withAdminSession(),
      adminR2CapacityRateLimit,
    ] as const,
    responses: {
      200: {
        description: 'Bounded, read-only Cloudflare R2 capacity observation.',
        content: {
          'application/json': { schema: operations.r2CapacityObservation },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => c.json(await observeAdminR2Capacity(), 200),
);
