import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';
import { startIdempotencyGc } from './lib/idempotencyStore.js';

const app = createApp();
startIdempotencyGc();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});
