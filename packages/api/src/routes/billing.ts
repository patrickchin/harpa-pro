import { timingSafeEqual } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  billing as billingSchemas,
  errorEnvelope,
  userId as userIdSchema,
} from '@harpa/api-contract';

import type { AppEnv } from '../app.js';
import { env } from '../env.js';
import { withAuth } from '../middleware/auth.js';
import { syncRevenueCatEntitlement } from '../services/billing.js';
import { RevenueCatRequestError } from '../services/revenuecat.js';

export const billingRoutes = new OpenAPIHono<AppEnv>();

const revenueCatWebhook = z.object({
  event: z.object({
    id: z.string().min(1),
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    event_timestamp_ms: z.number().int().nonnegative(),
  }).passthrough(),
});

export function secureCompareAuthorization(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

function resolveWebhookUserId(event: z.infer<typeof revenueCatWebhook>['event']): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ];
  for (const candidate of candidates) {
    const parsed = userIdSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

billingRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/me/billing/sync',
    tags: ['billing'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: {
        description: 'Server-verified billing state.',
        content: { 'application/json': { schema: billingSchemas.billingSyncResponse } },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      502: {
        description: 'RevenueCat verification failed.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      503: {
        description: 'Billing is disabled.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  }),
  async (c) => {
    if (env.REVENUECAT_LIVE !== '1') {
      return c.json(
        {
          error: {
            code: 'billing_unavailable',
            message: 'Billing is not available.',
          },
        },
        503,
      );
    }

    const userId = c.get('userId');
    if (!userId) throw new HTTPException(401, { message: 'Unauthorized.' });
    try {
      return c.json(await syncRevenueCatEntitlement(userId), 200);
    } catch (error) {
      if (error instanceof RevenueCatRequestError) {
        return c.json(
          {
            error: {
              code: 'billing_sync_failed',
              message: 'Could not verify subscription status.',
            },
          },
          502,
        );
      }
      throw error;
    }
  },
);

billingRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/webhooks/revenuecat',
    tags: ['billing'],
    request: {
      body: { content: { 'application/json': { schema: revenueCatWebhook } } },
    },
    responses: {
      200: {
        description: 'Webhook accepted.',
        content: {
          'application/json': {
            schema: z.object({ received: z.literal(true) }),
          },
        },
      },
      400: {
        description: 'No Harpa user id was present.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      401: {
        description: 'Webhook authorization failed.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      502: {
        description: 'RevenueCat verification failed.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      503: {
        description: 'Billing is disabled.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  }),
  async (c) => {
    if (env.REVENUECAT_LIVE !== '1') {
      return c.json(
        { error: { code: 'billing_unavailable', message: 'Billing is not available.' } },
        503,
      );
    }
    if (!secureCompareAuthorization(
      c.req.header('authorization'),
      env.REVENUECAT_WEBHOOK_AUTH,
    )) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Unauthorized.' } },
        401,
      );
    }

    const { event } = c.req.valid('json');
    const userId = resolveWebhookUserId(event);
    if (!userId) {
      return c.json(
        {
          error: {
            code: 'billing_user_not_found',
            message: 'Webhook did not identify a Harpa user.',
          },
        },
        400,
      );
    }

    try {
      await syncRevenueCatEntitlement(userId, {
        eventId: event.id,
        eventAt: new Date(event.event_timestamp_ms),
      });
      return c.json({ received: true as const }, 200);
    } catch (error) {
      if (error instanceof RevenueCatRequestError) {
        return c.json(
          {
            error: {
              code: 'billing_sync_failed',
              message: 'Could not verify subscription status.',
            },
          },
          502,
        );
      }
      throw error;
    }
  },
);
