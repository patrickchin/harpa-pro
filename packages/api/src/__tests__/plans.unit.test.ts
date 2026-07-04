import { describe, expect, it } from 'vitest';

import {
  effectivePlanFrom,
  higherPlan,
  isEntitlementActive,
} from '../services/plans.js';

const NOW = new Date('2026-07-05T00:00:00.000Z');

describe('higherPlan', () => {
  it.each([
    ['free', null, 'free'],
    ['free', 'pro', 'pro'],
    ['pro', null, 'pro'],
    ['pro', 'pro', 'pro'],
    ['enterprise', 'pro', 'enterprise'],
  ] as const)('keeps the higher of admin %s and paid %s', (admin, paid, expected) => {
    expect(higherPlan(admin, paid)).toBe(expected);
  });
});

describe('isEntitlementActive', () => {
  it('accepts an active entitlement with no expiry', () => {
    expect(isEntitlementActive({ active: true, expiresAt: null }, NOW)).toBe(true);
  });

  it('accepts an active entitlement expiring after now', () => {
    expect(
      isEntitlementActive(
        { active: true, expiresAt: new Date('2026-07-05T00:00:00.001Z') },
        NOW,
      ),
    ).toBe(true);
  });

  it.each([
    { active: false, expiresAt: null },
    { active: true, expiresAt: new Date('2026-07-05T00:00:00.000Z') },
    { active: true, expiresAt: new Date('2026-07-04T23:59:59.999Z') },
  ])('rejects inactive or expired state %#', (entitlement) => {
    expect(isEntitlementActive(entitlement, NOW)).toBe(false);
  });
});

describe('effectivePlanFrom', () => {
  it('upgrades Free to Pro only for an active paid entitlement', () => {
    expect(
      effectivePlanFrom(
        'free',
        { active: true, expiresAt: new Date('2026-08-01T00:00:00Z') },
        NOW,
      ),
    ).toBe('pro');
    expect(
      effectivePlanFrom(
        'free',
        { active: false, expiresAt: new Date('2026-08-01T00:00:00Z') },
        NOW,
      ),
    ).toBe('free');
  });

  it('never downgrades an admin Enterprise plan', () => {
    expect(
      effectivePlanFrom(
        'enterprise',
        { active: true, expiresAt: new Date('2026-08-01T00:00:00Z') },
        NOW,
      ),
    ).toBe('enterprise');
  });
});
