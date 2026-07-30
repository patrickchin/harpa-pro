import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';
import { startAdminRateLimitGc } from './lib/adminRateLimiter.js';
import { startIdempotencyGc } from './lib/idempotencyStore.js';
import { startRateLimitGc } from './lib/rateLimiter.js';

const app = createApp();
startAdminRateLimitGc();
startIdempotencyGc();
startRateLimitGc();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});
