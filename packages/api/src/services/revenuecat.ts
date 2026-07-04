import { z } from 'zod';

import { env } from '../env.js';

const entitlementSchema = z.object({
  product_identifier: z.string().min(1),
  expires_date: z.string().datetime({ offset: true }).nullable(),
}).passthrough();

const subscriptionSchema = z.object({
  store: z.string().optional(),
  expires_date: z.string().datetime({ offset: true }).nullable().optional(),
}).passthrough();

const subscriberResponseSchema = z.object({
  subscriber: z.object({
    management_url: z.string().url().nullable().optional(),
    entitlements: z.record(entitlementSchema),
    subscriptions: z.record(subscriptionSchema),
  }).passthrough(),
});

export interface RevenueCatEntitlementSnapshot {
  productId: string;
  store: 'app_store' | 'play_store' | null;
  active: boolean;
  expiresAt: Date | null;
  managementUrl: string | null;
}

export class RevenueCatRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'RevenueCatRequestError';
    this.status = status;
  }
}

export function normalizeRevenueCatSubscriber(
  payload: unknown,
  now: Date = new Date(),
): RevenueCatEntitlementSnapshot | null {
  const parsed = subscriberResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RevenueCatRequestError('Invalid RevenueCat subscriber response.');
  }

  const subscriber = parsed.data.subscriber;
  const entitlement = subscriber.entitlements.pro;
  if (!entitlement) return null;

  const expiresAt = entitlement.expires_date === null
    ? null
    : new Date(entitlement.expires_date);
  const subscription = subscriber.subscriptions[entitlement.product_identifier];
  const store = subscription?.store === 'app_store' || subscription?.store === 'play_store'
    ? subscription.store
    : null;

  return {
    productId: entitlement.product_identifier,
    store,
    active: expiresAt === null || expiresAt.getTime() > now.getTime(),
    expiresAt,
    managementUrl: subscriber.management_url ?? null,
  };
}

export interface RevenueCatClient {
  getSubscriber(userId: string): Promise<RevenueCatEntitlementSnapshot | null>;
}

interface RevenueCatClientOptions {
  baseUrl?: string;
  secretApiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export function createRevenueCatClient(
  options: RevenueCatClientOptions = {},
): RevenueCatClient {
  const baseUrl = (options.baseUrl ?? env.REVENUECAT_BASE_URL).replace(/\/$/, '');
  const secretApiKey = options.secretApiKey ?? env.REVENUECAT_SECRET_API_KEY;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  if (!secretApiKey) {
    throw new RevenueCatRequestError('RevenueCat secret API key is not configured.');
  }

  return {
    async getSubscriber(userId) {
      const response = await fetchImpl(
        `${baseUrl}/subscribers/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new RevenueCatRequestError(
          `RevenueCat subscriber request failed with status ${response.status}.`,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new RevenueCatRequestError('Invalid RevenueCat subscriber response.');
      }
      return normalizeRevenueCatSubscriber(payload, now());
    },
  };
}
