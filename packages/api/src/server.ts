import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';
import { startAdminRateLimitGc } from './lib/adminRateLimiter.js';
import { backgroundMaintenanceEnabled } from './lib/background-maintenance.js';
import { startIdempotencyGc } from './lib/idempotencyStore.js';

const app = createApp();
if (backgroundMaintenanceEnabled()) {
  startAdminRateLimitGc();
  startIdempotencyGc();
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});
