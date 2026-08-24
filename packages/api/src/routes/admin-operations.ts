import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { RouteConfig } from '@hono/zod-openapi';
import { errorEnvelope, operations } from '@harpa/api-contract';
import type { ReportGenerateDiagnosticObservation } from '@harpa/api-contract';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { runAdminReportGenerateDiagnostic } from '../lib/admin-report-diagnostic.js';
import { ADMIN_CSRF_HEADER, withAdminCsrf } from '../lib/admin-csrf.js';
import { observeAdminFlyInventory } from '../lib/fly-operations.js';
import { observeAdminNeonUsage } from '../lib/neon-usage.js';
import { observeAdminNeonInventory } from '../lib/neon-operations.js';
import { observeAdminR2Capacity } from '../lib/r2-operations.js';
import { observeAdminSentry } from '../lib/sentry-operations.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { withTrustedAdminOrigin } from '../middleware/admin-origin.js';
import { adminAuthIpWindow } from '../middleware/admin-rate-limit.js';
import { withAdminSession } from '../middleware/admin-session.js';
import { withRateLimit } from '../middleware/rateLimit.js';
import { observeAdminAiUsage } from '../services/admin-ai-usage.js';
import { observeAdminStorageLifecycle } from '../services/admin-storage-lifecycle.js';

const MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;

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

function auditReportLiveCanary(
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
          reportId: observation.target.reportId,
          reportNumber: observation.target.reportNumber,
          provider: observation.generation.vendor,
          model: observation.generation.model,
          fixtureMode: observation.generation.fixtureMode,
          idempotentReplay: observation.generation.idempotentReplay,
          usage: {
            inputTokens: observation.usage.inputTokens,
            outputTokens: observation.usage.outputTokens,
            cachedTokens: observation.usage.cachedTokens,
            latencyMs: observation.usage.latencyMs,
            matched: observation.usage.matched,
          },
          counts: {
            workers: observation.preview.counts.workers,
            materials: observation.preview.counts.materials,
            issues: observation.preview.counts.issues,
            nextSteps: observation.preview.counts.nextSteps,
            summarySections: observation.preview.counts.summarySections,
            imageAttachments: observation.preview.counts.imageAttachments,
            documentAttachments: observation.preview.counts.documentAttachments,
          },
          truncated: observation.preview.truncated,
          bodySha256: observation.preview.bodySha256,
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
            outcome:
              observation.reason === 'not_enabled'
                ? 'report_generate_not_enabled'
                : 'report_generate_not_configured',
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

const adminSentryRateLimit = withRateLimit({
  name: 'admin.operations.sentry.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminNeonUsageRateLimit = withRateLimit({
  name: 'admin.operations.neon-usage.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminStorageLifecycleRateLimit = withRateLimit({
  name: 'admin.operations.storage-lifecycle.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminFlyInventoryRateLimit = withRateLimit({
  name: 'admin.operations.fly-inventory.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminAiUsageRateLimit = withRateLimit({
  name: 'admin.operations.ai-usage.read.1m',
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

export const adminOperationsRoutes = new OpenAPIHono<AppEnv>(openApiHonoOptions);

function registerAdminObservation<
  const Path extends `/admin/operations/${string}`,
  Observation extends object,
>({
  path,
  rateLimit,
  description,
  schema,
  observe,
}: {
  path: Path;
  rateLimit: MiddlewareHandler<AppEnv>;
  description: string;
  schema: z.ZodType<Observation, z.ZodTypeDef, unknown>;
  observe: () => Promise<NoInfer<Observation>>;
}): void {
  const route: RouteConfig = createRoute({
    method: 'get',
    path,
    tags: ['admin'],
    security: [{ adminSession: [] }],
    middleware: [privateNoStore, adminAuthIpWindow, withAdminSession(), rateLimit] as const,
    responses: {
      200: {
        description,
        content: {
          'application/json': { schema },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  adminOperationsRoutes.openapi(route, async (c: Context<AppEnv>): Promise<Response> => {
    return c.json(await observe(), 200);
  });
}

registerAdminObservation({
  path: '/admin/operations/neon',
  rateLimit: adminNeonOperationsRateLimit,
  description: 'Bounded, read-only Neon organization inventory.',
  schema: operations.neonInventoryObservation,
  observe: observeAdminNeonInventory,
});

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
        description: 'Bounded live canary report-generation observation.',
        content: {
          'application/json': { schema: operations.reportGenerateDiagnosticObservation },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      403: {
        description: 'Untrusted origin or invalid CSRF token.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  }),
  async (c) => {
    const observation = await runAdminReportGenerateDiagnostic();
    auditReportLiveCanary(c, observation);
    return c.json(observation, 200);
  },
);

registerAdminObservation({
  path: '/admin/operations/neon-usage',
  rateLimit: adminNeonUsageRateLimit,
  description: 'Bounded, read-only Neon Free-plan usage observation.',
  schema: operations.neonUsageObservation,
  observe: observeAdminNeonUsage,
});

registerAdminObservation({
  path: '/admin/operations/r2-capacity',
  rateLimit: adminR2CapacityRateLimit,
  description: 'Bounded, read-only Cloudflare R2 capacity observation.',
  schema: operations.r2CapacityObservation,
  observe: observeAdminR2Capacity,
});

registerAdminObservation({
  path: '/admin/operations/sentry',
  rateLimit: adminSentryRateLimit,
  description: 'Bounded, read-only Sentry aggregate issue and mobile session observation.',
  schema: operations.sentryObservation,
  observe: observeAdminSentry,
});

registerAdminObservation({
  path: '/admin/operations/storage-lifecycle',
  rateLimit: adminStorageLifecycleRateLimit,
  description: 'Bounded, read-only application storage lifecycle observation.',
  schema: operations.storageLifecycleObservation,
  observe: observeAdminStorageLifecycle,
});

registerAdminObservation({
  path: '/admin/operations/ai-usage',
  rateLimit: adminAiUsageRateLimit,
  description: 'Bounded, read-only Harpa AI usage ledger observation.',
  schema: operations.aiUsageObservation,
  observe: observeAdminAiUsage,
});

registerAdminObservation({
  path: '/admin/operations/fly-inventory',
  rateLimit: adminFlyInventoryRateLimit,
  description: 'Bounded, read-only Fly application infrastructure inventory.',
  schema: operations.flyInventoryObservation,
  observe: observeAdminFlyInventory,
});
