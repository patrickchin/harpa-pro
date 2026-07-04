import { describe, expect, it, vi } from 'vitest';

import {
  RevenueCatRequestError,
  createRevenueCatClient,
  normalizeRevenueCatSubscriber,
} from '../services/revenuecat.js';

const NOW = new Date('2026-07-05T00:00:00.000Z');

function subscriber(overrides: Record<string, unknown> = {}): unknown {
  return {
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
      ...overrides,
    },
  };
}

describe('normalizeRevenueCatSubscriber', () => {
  it('returns null when the subscriber has no Pro entitlement', () => {
    expect(
      normalizeRevenueCatSubscriber(
        subscriber({ entitlements: {}, subscriptions: {} }),
        NOW,
      ),
    ).toBeNull();
  });

  it('normalizes an active App Store entitlement', () => {
    expect(normalizeRevenueCatSubscriber(subscriber(), NOW)).toEqual({
      productId: 'harpa_pro_monthly',
      store: 'app_store',
      active: true,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      managementUrl: 'https://apps.apple.com/account/subscriptions',
    });
  });

  it('keeps cancelled access active through the paid expiry', () => {
    const payload = subscriber({
      subscriptions: {
        harpa_pro_monthly: {
          store: 'app_store',
          expires_date: '2026-08-01T00:00:00Z',
          unsubscribe_detected_at: '2026-07-01T00:00:00Z',
        },
      },
    });

    expect(normalizeRevenueCatSubscriber(payload, NOW)?.active).toBe(true);
  });

  it('marks an expired entitlement inactive', () => {
    const payload = subscriber({
      entitlements: {
        pro: {
          product_identifier: 'harpa_pro_monthly',
          expires_date: '2026-07-04T23:59:59Z',
        },
      },
      subscriptions: {
        harpa_pro_monthly: {
          store: 'play_store',
          expires_date: '2026-07-04T23:59:59Z',
        },
      },
    });

    expect(normalizeRevenueCatSubscriber(payload, NOW)).toMatchObject({
      store: 'play_store',
      active: false,
      expiresAt: new Date('2026-07-04T23:59:59.000Z'),
    });
  });

  it('accepts a lifetime entitlement with no expiry', () => {
    const payload = subscriber({
      entitlements: {
        pro: {
          product_identifier: 'harpa_pro_lifetime',
          expires_date: null,
        },
      },
      subscriptions: {
        harpa_pro_lifetime: { store: 'app_store', expires_date: null },
      },
    });

    expect(normalizeRevenueCatSubscriber(payload, NOW)).toMatchObject({
      active: true,
      expiresAt: null,
    });
  });

  it('rejects malformed subscriber payloads', () => {
    expect(() => normalizeRevenueCatSubscriber({ subscriber: [] }, NOW)).toThrow(
      /RevenueCat subscriber response/i,
    );
  });
});

describe('createRevenueCatClient', () => {
  it('sends the secret bearer key and normalizes the response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(subscriber()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createRevenueCatClient({
      baseUrl: 'https://api.revenuecat.test/v1',
      secretApiKey: 'sk_test_secret',
      fetchImpl,
      now: () => NOW,
    });

    await expect(client.getSubscriber('usr_test')).resolves.toMatchObject({
      active: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.revenuecat.test/v1/subscribers/usr_test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('throws a typed error for non-2xx responses', async () => {
    const client = createRevenueCatClient({
      baseUrl: 'https://api.revenuecat.test/v1',
      secretApiKey: 'sk_test_secret',
      fetchImpl: vi.fn(async () => new Response('upstream unavailable', { status: 503 })),
      now: () => NOW,
    });

    await expect(client.getSubscriber('usr_test')).rejects.toBeInstanceOf(
      RevenueCatRequestError,
    );
  });
});
