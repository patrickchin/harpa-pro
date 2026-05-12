/**
 * /settings/ai — per-user AI provider preference. Self-only via
 * app.user_settings RLS. UPSERT on (user_id) lets the row not exist
 * yet for first-time users (defaults baked into the service layer).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { settings as settingsSchemas, errorEnvelope } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { getAiSettings, updateAiSettings } from '../services/settings.js';

export const settingsRoutes = new OpenAPIHono<AppEnv>();

settingsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/settings/ai',
    tags: ['settings'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Current AI settings.', content: { 'application/json': { schema: settingsSchemas.aiSettings } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const out = await db((d) => getAiSettings(d, userId));
    return c.json(out, 200);
  },
);

settingsRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/settings/ai',
    tags: ['settings'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: settingsSchemas.updateAiSettingsRequest } } },
    },
    responses: {
      200: { description: 'Updated.', content: { 'application/json': { schema: settingsSchemas.aiSettings } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const patch = c.req.valid('json');
    const out = await db((d) => updateAiSettings(d, userId, patch));
    return c.json(out, 200);
  },
);
