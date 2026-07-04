import { sql } from 'drizzle-orm';
import type { billing as billingSchemas } from '@harpa/api-contract';
import type { z } from 'zod';

import { rawDb } from '../db/client.js';
import { effectivePlanFrom, type Plan } from './plans.js';
import {
  createRevenueCatClient,
  type RevenueCatClient,
  type RevenueCatEntitlementSnapshot,
} from './revenuecat.js';

type BillingSyncResponse = z.infer<typeof billingSchemas.billingSyncResponse>;

interface BillingRow {
  user_id: string;
  entitlement_id: 'pro';
  product_id: string | null;
  store: 'app_store' | 'play_store' | null;
  active: boolean;
  expires_at: Date | null;
  management_url: string | null;
  last_event_id: string | null;
  last_event_at: Date | null;
  synced_at: Date;
}

type RawBillingRow = Omit<
  BillingRow,
  'expires_at' | 'last_event_at' | 'synced_at'
> & {
  expires_at: Date | string | null;
  last_event_at: Date | string | null;
  synced_at: Date | string;
};

export interface BillingEventMetadata {
  eventId: string;
  eventAt: Date;
}

let revenueCatClient: RevenueCatClient | null = null;

export function setBillingRevenueCatClient(client: RevenueCatClient): void {
  revenueCatClient = client;
}

export function resetBillingRevenueCatClient(): void {
  revenueCatClient = null;
}

function getRevenueCatClient(): RevenueCatClient {
  revenueCatClient ??= createRevenueCatClient();
  return revenueCatClient;
}

async function loadBillingRow(userId: string): Promise<BillingRow | null> {
  const result = await rawDb().execute<RawBillingRow>(sql`
    SELECT user_id, entitlement_id, product_id, store, active, expires_at,
           management_url, last_event_id, last_event_at, synced_at
    FROM app.billing_entitlements
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? normalizeBillingRow(row) : null;
}

function normalizeBillingRow(row: RawBillingRow): BillingRow {
  return {
    ...row,
    expires_at: row.expires_at === null ? null : new Date(row.expires_at),
    last_event_at: row.last_event_at === null ? null : new Date(row.last_event_at),
    synced_at: new Date(row.synced_at),
  };
}

async function loadAdminPlan(userId: string): Promise<Plan> {
  const result = await rawDb().execute<{ plan: Plan }>(sql`
    SELECT plan FROM public."user" WHERE id = ${userId} LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error(`[billing] user ${userId} not found`);
  return row.plan;
}

function toResponse(adminPlan: Plan, row: BillingRow): BillingSyncResponse {
  return {
    plan: effectivePlanFrom(
      adminPlan,
      { active: row.active, expiresAt: row.expires_at },
    ),
    entitlement: {
      entitlementId: 'pro',
      productId: row.product_id,
      store: row.store,
      active: row.active,
      expiresAt: row.expires_at?.toISOString() ?? null,
      managementUrl: row.management_url,
      syncedAt: row.synced_at.toISOString(),
    },
  };
}

function isStaleEvent(row: BillingRow | null, metadata: BillingEventMetadata): boolean {
  if (!row) return false;
  if (row.last_event_id === metadata.eventId) return true;
  return row.last_event_at !== null
    && row.last_event_at.getTime() >= metadata.eventAt.getTime();
}

export async function syncRevenueCatEntitlement(
  userId: string,
  metadata?: BillingEventMetadata,
): Promise<BillingSyncResponse> {
  const current = await loadBillingRow(userId);
  if (metadata && isStaleEvent(current, metadata) && current) {
    return toResponse(await loadAdminPlan(userId), current);
  }

  const snapshot: RevenueCatEntitlementSnapshot | null =
    await getRevenueCatClient().getSubscriber(userId);
  const eventId = metadata?.eventId ?? null;
  const eventAt = metadata?.eventAt.toISOString() ?? null;
  const syncedAt = new Date();
  const result = await rawDb().execute<RawBillingRow>(sql`
    INSERT INTO app.billing_entitlements (
      user_id, provider, entitlement_id, product_id, store, active, expires_at,
      management_url, last_event_id, last_event_at, synced_at
    ) VALUES (
      ${userId}, 'revenuecat', 'pro', ${snapshot?.productId ?? null},
      ${snapshot?.store ?? null}, ${snapshot?.active ?? false},
      ${snapshot?.expiresAt?.toISOString() ?? null}::timestamptz,
      ${snapshot?.managementUrl ?? null}, ${eventId},
      ${eventAt}::timestamptz, ${syncedAt.toISOString()}::timestamptz
    )
    ON CONFLICT (user_id) DO UPDATE SET
      product_id = EXCLUDED.product_id,
      store = EXCLUDED.store,
      active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at,
      management_url = EXCLUDED.management_url,
      last_event_id = COALESCE(EXCLUDED.last_event_id, app.billing_entitlements.last_event_id),
      last_event_at = COALESCE(EXCLUDED.last_event_at, app.billing_entitlements.last_event_at),
      synced_at = EXCLUDED.synced_at
    WHERE EXCLUDED.last_event_at IS NULL
       OR app.billing_entitlements.last_event_at IS NULL
       OR EXCLUDED.last_event_at > app.billing_entitlements.last_event_at
    RETURNING user_id, entitlement_id, product_id, store, active, expires_at,
              management_url, last_event_id, last_event_at, synced_at
  `);
  const returned = result.rows[0];
  const row = returned ? normalizeBillingRow(returned) : await loadBillingRow(userId);
  if (!row) throw new Error(`[billing] entitlement upsert failed for ${userId}`);
  return toResponse(await loadAdminPlan(userId), row);
}
