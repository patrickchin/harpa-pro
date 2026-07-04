import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { env } from '../env.js';
import { getPool, resetPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { resetBillingRevenueCatClient } from '../services/billing.js';
import { makeSessionId, makeUserId } from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let server: Server;
let baseUrl: string;
let userId: string;
let token: string;
let requests: Array<{ url: string; authorization: string | undefined }>;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  userId = makeUserId();
  await seedAuthUsers(fx.url, [{ id: userId }]);
  token = await signTestToken(userId, makeSessionId());

  server = createServer((request, response) => {
    requests.push({
      url: request.url ?? '',
      authorization: request.headers.authorization,
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      subscriber: {
        management_url: 'https://apps.apple.com/account/subscriptions',
        entitlements: {
          pro: {
            product_identifier: 'harpa_pro_monthly',
            expires_date: '2026-08-01T00:00:00Z',
          },
        },
        subscriptions: {
          harpa_pro_monthly: {
            store: 'app_store',
            expires_date: '2026-08-01T00:00:00Z',
          },
        },
      },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake RevenueCat failed to bind');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
}, 120_000);

beforeEach(async () => {
  requests = [];
  env.REVENUECAT_LIVE = '1';
  env.REVENUECAT_SECRET_API_KEY = 'sk_default_wiring_secret';
  env.REVENUECAT_BASE_URL = baseUrl;
  resetBillingRevenueCatClient();
  await getPool().query(`DELETE FROM app.billing_entitlements`);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve());
  });
  await fx?.stop();
}, 60_000);

describe('RevenueCat default wiring', () => {
  it('calls the configured REST endpoint and persists its verified entitlement', async () => {
    const response = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(requests).toEqual([{
      url: `/v1/subscribers/${userId}`,
      authorization: 'Bearer sk_default_wiring_secret',
    }]);
    const stored = await getPool().query<{
      active: boolean;
      product_id: string;
      store: string;
    }>(
      `SELECT active, product_id, store FROM app.billing_entitlements WHERE user_id = $1`,
      [userId],
    );
    expect(stored.rows).toEqual([{
      active: true,
      product_id: 'harpa_pro_monthly',
      store: 'app_store',
    }]);
  });
});
