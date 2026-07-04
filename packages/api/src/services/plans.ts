import type { usageLimits } from '@harpa/api-contract';
import type { z } from 'zod';

export type Plan = z.infer<typeof usageLimits.plan>;

export interface EntitlementState {
  active: boolean;
  expiresAt: Date | null;
}

export const PLAN_RANK: Readonly<Record<Plan, number>> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export function higherPlan(adminPlan: Plan, paidPlan: Plan | null): Plan {
  if (paidPlan === null) return adminPlan;
  return PLAN_RANK[paidPlan] > PLAN_RANK[adminPlan] ? paidPlan : adminPlan;
}

export function isEntitlementActive(
  entitlement: EntitlementState | null,
  now: Date = new Date(),
): boolean {
  if (!entitlement?.active) return false;
  return entitlement.expiresAt === null || entitlement.expiresAt.getTime() > now.getTime();
}

export function effectivePlanFrom(
  adminPlan: Plan,
  entitlement: EntitlementState | null,
  now: Date = new Date(),
): Plan {
  return higherPlan(adminPlan, isEntitlementActive(entitlement, now) ? 'pro' : null);
}
