import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BillingClient,
  BillingContextValue,
  BillingPaywallResult,
} from './types';

const testState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  syncBilling: vi.fn(async () => ({ plan: 'pro' as const })),
  env: {
    EXPO_PUBLIC_BILLING_ENABLED: true,
    EXPO_PUBLIC_USE_FIXTURES: false,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_test',
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_test',
  },
  fixtureClient: null as BillingClient | null,
  revenueCatClient: null as BillingClient | null,
  createFixture: vi.fn(),
  createRevenueCat: vi.fn(),
}));

vi.mock('../auth/session', () => ({
  useAuthSession: () => ({ user: testState.user }),
}));

vi.mock('../api/hooks', () => ({
  useSyncBillingMutation: () => ({ mutateAsync: testState.syncBilling }),
}));

vi.mock('../config/env', () => ({ env: testState.env }));

vi.mock('./fixture-client', () => ({
  createFixtureBillingClient: testState.createFixture,
}));

vi.mock('./revenuecat-client', () => ({
  createRevenueCatBillingClient: testState.createRevenueCat,
}));

import { BillingProvider, useBilling } from './BillingProvider';

function makeClient(): BillingClient {
  return {
    configure: vi.fn(async () => undefined),
    logIn: vi.fn(async () => undefined),
    logOut: vi.fn(async () => undefined),
    presentPaywall: vi.fn(async (): Promise<BillingPaywallResult> => 'cancelled'),
    presentCustomerCenter: vi.fn(async () => undefined),
    restorePurchases: vi.fn(async () => ({ hasPro: true })),
    getCustomerInfo: vi.fn(async () => ({ hasPro: false })),
  };
}

let latest!: BillingContextValue;
function Probe() {
  latest = useBilling();
  return null;
}

async function renderProvider(client?: BillingClient): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <BillingProvider client={client}>
        <Probe />
      </BillingProvider>,
    );
  });
  return tree;
}

async function rerender(tree: ReactTestRenderer, client?: BillingClient) {
  await act(async () => {
    tree.update(
      <BillingProvider client={client}>
        <Probe />
      </BillingProvider>,
    );
  });
}

async function runBooleanAction(action: () => Promise<boolean>): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = await action();
  });
  return result;
}

describe('BillingProvider', () => {
  beforeEach(() => {
    testState.user = null;
    testState.env.EXPO_PUBLIC_BILLING_ENABLED = true;
    testState.env.EXPO_PUBLIC_USE_FIXTURES = false;
    testState.syncBilling.mockReset();
    testState.syncBilling.mockResolvedValue({ plan: 'pro' });
    testState.createFixture.mockReset();
    testState.createRevenueCat.mockReset();
    testState.fixtureClient = makeClient();
    testState.revenueCatClient = makeClient();
    testState.createFixture.mockImplementation(() => testState.fixtureClient);
    testState.createRevenueCat.mockImplementation(() => testState.revenueCatClient);
  });

  it('waits for auth, configures the first user, logs in changes, and logs out', async () => {
    const client = makeClient();
    const tree = await renderProvider(client);
    expect(client.configure).not.toHaveBeenCalled();

    testState.user = { id: 'usr_first' };
    await rerender(tree, client);
    expect(client.configure).toHaveBeenCalledWith('usr_first');
    expect(latest.status).toBe('free');

    testState.user = { id: 'usr_second' };
    await rerender(tree, client);
    expect(client.logIn).toHaveBeenCalledWith('usr_second');

    testState.user = null;
    await rerender(tree, client);
    expect(client.logOut).toHaveBeenCalledOnce();
    expect(latest.status).toBe('disabled');
  });

  it('server-verifies successful paywall and restore results', async () => {
    const client = makeClient();
    vi.mocked(client.presentPaywall).mockResolvedValue('purchased');
    testState.user = { id: 'usr_paid' };
    await renderProvider(client);

    await expect(runBooleanAction(() => latest.presentPaywall())).resolves.toBe(true);
    expect(testState.syncBilling).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe('pro');

    await expect(runBooleanAction(() => latest.restorePurchases())).resolves.toBe(true);
    expect(client.restorePurchases).toHaveBeenCalledOnce();
    expect(testState.syncBilling).toHaveBeenCalledTimes(2);
  });

  it.each(['cancelled', 'not_presented', 'error'] as const)(
    'does not grant Pro for a %s paywall result',
    async (result) => {
      const client = makeClient();
      vi.mocked(client.presentPaywall).mockResolvedValue(result);
      testState.user = { id: 'usr_free' };
      await renderProvider(client);

      await expect(runBooleanAction(() => latest.presentPaywall())).resolves.toBe(false);
      expect(testState.syncBilling).not.toHaveBeenCalled();
      expect(latest.status).not.toBe('pro');
    },
  );

  it('does not grant Pro when the store or network throws', async () => {
    const client = makeClient();
    vi.mocked(client.presentPaywall).mockRejectedValue(new Error('store unavailable'));
    testState.user = { id: 'usr_free' };
    await renderProvider(client);

    await expect(runBooleanAction(() => latest.presentPaywall())).resolves.toBe(false);
    expect(testState.syncBilling).not.toHaveBeenCalled();
    expect(latest.status).toBe('error');
  });

  it('delegates subscription management to the client', async () => {
    const client = makeClient();
    testState.user = { id: 'usr_manage' };
    await renderProvider(client);

    await act(async () => latest.presentCustomerCenter());
    expect(client.presentCustomerCenter).toHaveBeenCalledOnce();
  });

  it('uses the fixture client without constructing the RevenueCat client', async () => {
    testState.env.EXPO_PUBLIC_USE_FIXTURES = true;
    testState.user = { id: 'usr_fixture' };
    await renderProvider();

    expect(testState.createFixture).toHaveBeenCalledOnce();
    expect(testState.createRevenueCat).not.toHaveBeenCalled();
  });
});
