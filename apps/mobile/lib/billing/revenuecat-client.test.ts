import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  logIn: vi.fn(async () => ({ customerInfo: {} })),
  logOut: vi.fn(async () => ({})),
  restorePurchases: vi.fn(async () => ({
    entitlements: { active: { pro: {} } },
  })),
  getCustomerInfo: vi.fn(async () => ({
    entitlements: { active: {} },
  })),
  presentPaywallIfNeeded: vi.fn(async () => 'PURCHASED'),
  presentCustomerCenter: vi.fn(async () => undefined),
}));

vi.mock('react-native-purchases', () => ({
  default: {
    configure: sdk.configure,
    logIn: sdk.logIn,
    logOut: sdk.logOut,
    restorePurchases: sdk.restorePurchases,
    getCustomerInfo: sdk.getCustomerInfo,
  },
}));

vi.mock('react-native-purchases-ui', () => ({
  default: {
    presentPaywallIfNeeded: sdk.presentPaywallIfNeeded,
    presentCustomerCenter: sdk.presentCustomerCenter,
  },
  PAYWALL_RESULT: {
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
    CANCELLED: 'CANCELLED',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  },
}));

import { createRevenueCatBillingClient } from './revenuecat-client';

describe('createRevenueCatBillingClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('configures the public key and stable Harpa user id', async () => {
    const client = createRevenueCatBillingClient('appl_public');
    await client.configure('usr_123');
    expect(sdk.configure).toHaveBeenCalledWith({
      apiKey: 'appl_public',
      appUserID: 'usr_123',
    });
  });

  it('presents the pro paywall and maps only purchased/restored to success', async () => {
    const client = createRevenueCatBillingClient('appl_public');

    sdk.presentPaywallIfNeeded.mockResolvedValueOnce('PURCHASED');
    await expect(client.presentPaywall()).resolves.toBe('purchased');
    expect(sdk.presentPaywallIfNeeded).toHaveBeenCalledWith({
      requiredEntitlementIdentifier: 'pro',
    });

    sdk.presentPaywallIfNeeded.mockResolvedValueOnce('RESTORED');
    await expect(client.presentPaywall()).resolves.toBe('restored');
    sdk.presentPaywallIfNeeded.mockResolvedValueOnce('CANCELLED');
    await expect(client.presentPaywall()).resolves.toBe('cancelled');
    sdk.presentPaywallIfNeeded.mockResolvedValueOnce('ERROR');
    await expect(client.presentPaywall()).resolves.toBe('error');
  });

  it('delegates customer center and user-initiated restore', async () => {
    const client = createRevenueCatBillingClient('appl_public');
    await client.presentCustomerCenter();
    await expect(client.restorePurchases()).resolves.toEqual({ hasPro: true });
    expect(sdk.presentCustomerCenter).toHaveBeenCalledOnce();
    expect(sdk.restorePurchases).toHaveBeenCalledOnce();
  });
});
