import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { env } from '../env.js';
import { signTestToken } from '../middleware/auth.js';
import {
  resetBillingRevenueCatClient,
  setBillingRevenueCatClient,
} from '../services/billing.js';
import {
  RevenueCatRequestError,
  type RevenueCatClient,
  type RevenueCatEntitlementSnapshot,
} from '../services/revenuecat.js';
import { makeSessionId, makeUserId } from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let alice: string;
let token: string;
const WEBHOOK_AUTH = 'Bearer webhook-secret-value';

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  await seedAuthUsers(fx.url, [{ id: alice }]);
  token = await signTestToken(alice, makeSessionId());
}, 120_000);

beforeEach(async () => {
  env.REVENUECAT_LIVE = '1';
  env.REVENUECAT_WEBHOOK_AUTH = WEBHOOK_AUTH;
  resetBillingRevenueCatClient();
  await getPool().query(`DELETE FROM app.billing_entitlements`);
  await getPool().query(`UPDATE public."user" SET plan = 'free' WHERE id = $1`, [alice]);
});

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('POST /me/billing/sync', () => {
  it('requires an authenticated Harpa session', async () => {
    const response = await createApp().request('/me/billing/sync', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  it('fails closed while live RevenueCat billing is disabled', async () => {
    env.REVENUECAT_LIVE = '0';
    const response = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'billing_unavailable' },
    });
  });

  it('upserts verified Pro state for the authenticated user', async () => {
    const getSubscriber = vi.fn(async (): Promise<RevenueCatEntitlementSnapshot> => ({
      productId: 'harpa_pro_monthly',
      store: 'app_store',
      active: true,
      expiresAt: new Date('2026-08-01T00:00:00Z'),
      managementUrl: 'https://apps.apple.com/account/subscriptions',
    }));
    setBillingRevenueCatClient({ getSubscriber });

    const response = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: 'pro',
      entitlement: {
        entitlementId: 'pro',
        productId: 'harpa_pro_monthly',
        store: 'app_store',
        active: true,
      },
    });
    expect(getSubscriber).toHaveBeenCalledWith(alice);

    const stored = await getPool().query<{
      user_id: string;
      active: boolean;
      product_id: string;
    }>(
      `SELECT user_id, active, product_id FROM app.billing_entitlements WHERE user_id = $1`,
      [alice],
    );
    expect(stored.rows).toEqual([
      { user_id: alice, active: true, product_id: 'harpa_pro_monthly' },
    ]);
  });

  it('does not downgrade an admin Enterprise plan when paid Pro is inactive', async () => {
    await getPool().query(`UPDATE public."user" SET plan = 'enterprise' WHERE id = $1`, [alice]);
    setBillingRevenueCatClient({ getSubscriber: vi.fn(async () => null) });

    const response = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: 'enterprise',
      entitlement: { active: false },
    });
  });

  it('returns 502 and preserves the last confirmed row on provider failure', async () => {
    const active: RevenueCatEntitlementSnapshot = {
      productId: 'harpa_pro_monthly',
      store: 'app_store',
      active: true,
      expiresAt: new Date('2026-08-01T00:00:00Z'),
      managementUrl: null,
    };
    setBillingRevenueCatClient({ getSubscriber: vi.fn(async () => active) });
    const first = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.status).toBe(200);

    const failingClient: RevenueCatClient = {
      getSubscriber: vi.fn(async () => {
        throw new RevenueCatRequestError('upstream failed', 503);
      }),
    };
    setBillingRevenueCatClient(failingClient);
    const failed = await createApp().request('/me/billing/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(failed.status).toBe(502);
    const stored = await getPool().query<{ active: boolean }>(
      `SELECT active FROM app.billing_entitlements WHERE user_id = $1`,
      [alice],
    );
    expect(stored.rows[0]?.active).toBe(true);
  });
});

describe('POST /webhooks/revenuecat', () => {
  const eventBody = (overrides: Record<string, unknown> = {}) => ({
    event: {
      id: 'evt_current',
      app_user_id: alice,
      event_timestamp_ms: Date.parse('2026-07-05T01:00:00Z'),
      ...overrides,
    },
  });

  it('fails closed while live RevenueCat billing is disabled', async () => {
    env.REVENUECAT_LIVE = '0';
    const getSubscriber = vi.fn(async () => null);
    setBillingRevenueCatClient({ getSubscriber });

    const response = await createApp().request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: WEBHOOK_AUTH,
        'content-type': 'application/json',
      },
      body: JSON.stringify(eventBody()),
    });

    expect(response.status).toBe(503);
    expect(getSubscriber).not.toHaveBeenCalled();
  });

  it('rejects a missing or incorrect authorization header', async () => {
    const response = await createApp().request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret-value',
        'content-type': 'application/json',
      },
      body: JSON.stringify(eventBody()),
    });

    expect(response.status).toBe(401);
  });

  it('resolves a Harpa user alias and syncs current subscriber state', async () => {
    const getSubscriber = vi.fn(async (): Promise<RevenueCatEntitlementSnapshot> => ({
      productId: 'harpa_pro_annual',
      store: 'play_store',
      active: true,
      expiresAt: new Date('2027-07-01T00:00:00Z'),
      managementUrl: 'https://play.google.com/store/account/subscriptions',
    }));
    setBillingRevenueCatClient({ getSubscriber });

    const response = await createApp().request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: WEBHOOK_AUTH,
        'content-type': 'application/json',
      },
      body: JSON.stringify(eventBody({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: '$RCAnonymousID:original',
        aliases: [alice],
      })),
    });

    expect(response.status).toBe(200);
    expect(getSubscriber).toHaveBeenCalledWith(alice);
    const stored = await getPool().query<{
      active: boolean;
      last_event_id: string;
      store: string;
    }>(
      `SELECT active, last_event_id, store FROM app.billing_entitlements WHERE user_id = $1`,
      [alice],
    );
    expect(stored.rows[0]).toEqual({
      active: true,
      last_event_id: 'evt_current',
      store: 'play_store',
    });
  });

  it('acknowledges duplicate and older events without replacing newer state', async () => {
    const active: RevenueCatEntitlementSnapshot = {
      productId: 'harpa_pro_monthly',
      store: 'app_store',
      active: true,
      expiresAt: new Date('2026-08-01T00:00:00Z'),
      managementUrl: null,
    };
    setBillingRevenueCatClient({ getSubscriber: vi.fn(async () => active) });
    const post = (body: unknown) => createApp().request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: WEBHOOK_AUTH,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    expect((await post(eventBody())).status).toBe(200);

    const staleFetch = vi.fn(async () => null);
    setBillingRevenueCatClient({ getSubscriber: staleFetch });
    expect((await post(eventBody())).status).toBe(200);
    expect((await post(eventBody({
      id: 'evt_older',
      event_timestamp_ms: Date.parse('2026-07-05T00:59:59Z'),
    }))).status).toBe(200);

    expect(staleFetch).not.toHaveBeenCalled();
    const stored = await getPool().query<{
      active: boolean;
      last_event_id: string;
    }>(
      `SELECT active, last_event_id FROM app.billing_entitlements WHERE user_id = $1`,
      [alice],
    );
    expect(stored.rows[0]).toEqual({ active: true, last_event_id: 'evt_current' });
  });

  it('rejects events that contain no Harpa user id', async () => {
    const response = await createApp().request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: WEBHOOK_AUTH,
        'content-type': 'application/json',
      },
      body: JSON.stringify(eventBody({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: '$RCAnonymousID:original',
        aliases: ['$RCAnonymousID:alias'],
      })),
    });

    expect(response.status).toBe(400);
  });
});
