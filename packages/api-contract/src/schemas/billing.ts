import { z } from 'zod';

import { isoDateTime } from './_shared.js';
import { plan } from './usage-limits.js';

export const billingEntitlement = z.object({
  entitlementId: z.literal('pro'),
  productId: z.string().min(1).nullable(),
  store: z.enum(['app_store', 'play_store']).nullable(),
  active: z.boolean(),
  expiresAt: isoDateTime.nullable(),
  managementUrl: z.string().url().nullable(),
  syncedAt: isoDateTime,
});
export type BillingEntitlement = z.infer<typeof billingEntitlement>;

export const billingSyncResponse = z.object({
  plan,
  entitlement: billingEntitlement.nullable(),
});
export type BillingSyncResponse = z.infer<typeof billingSyncResponse>;
