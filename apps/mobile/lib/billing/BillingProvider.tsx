import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { useSyncBillingMutation } from '../api/hooks';
import { useAuthSession } from '../auth/session';
import { env } from '../config/env';
import { createFixtureBillingClient } from './fixture-client';
import { createRevenueCatBillingClient } from './revenuecat-client';
import type {
  BillingClient,
  BillingContextValue,
  BillingStatus,
} from './types';

const BillingContext = createContext<BillingContextValue | undefined>(undefined);

function defaultClient(): BillingClient {
  if (env.EXPO_PUBLIC_USE_FIXTURES) return createFixtureBillingClient();
  const apiKey = Platform.OS === 'android'
    ? env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
    : env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    throw new Error('[billing] RevenueCat public API key is not configured');
  }
  return createRevenueCatBillingClient(apiKey);
}

function statusForCustomer(hasPro: boolean): BillingStatus {
  return hasPro ? 'pro' : 'free';
}

export interface BillingProviderProps {
  children: ReactNode;
  client?: BillingClient;
  enabled?: boolean;
}

export function BillingProvider({
  children,
  client: clientOverride,
  enabled: enabledOverride,
}: BillingProviderProps): React.JSX.Element {
  const { user } = useAuthSession();
  const enabled = enabledOverride ?? env.EXPO_PUBLIC_BILLING_ENABLED;
  const clientRef = useRef<BillingClient | null>(clientOverride ?? null);
  const configuredRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<BillingStatus>('disabled');
  const syncBilling = useSyncBillingMutation();

  const getClient = useCallback((): BillingClient => {
    clientRef.current ??= defaultClient();
    return clientRef.current;
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;
    const userId = enabled ? user?.id ?? null : null;

    if (!enabled) {
      setStatus('disabled');
      return;
    }

    if (!userId) {
      const previousUserId = activeUserIdRef.current;
      activeUserIdRef.current = null;
      setStatus('disabled');
      if (previousUserId && configuredRef.current) {
        void getClient().logOut().catch(() => undefined);
      }
      return;
    }

    if (activeUserIdRef.current === userId) return;
    setStatus('loading');

    void (async () => {
      try {
        const billingClient = getClient();
        if (!configuredRef.current) {
          await billingClient.configure(userId);
          configuredRef.current = true;
        } else {
          await billingClient.logIn(userId);
        }
        activeUserIdRef.current = userId;
        const info = await billingClient.getCustomerInfo();
        if (runIdRef.current === runId) setStatus(statusForCustomer(info.hasPro));
      } catch {
        if (runIdRef.current === runId) setStatus('error');
      }
    })();
  }, [enabled, getClient, user?.id]);

  const refresh = useCallback(async () => {
    if (!enabled || !activeUserIdRef.current) return;
    try {
      const info = await getClient().getCustomerInfo();
      setStatus(statusForCustomer(info.hasPro));
    } catch {
      setStatus('error');
    }
  }, [enabled, getClient]);

  const verifyServerPlan = useCallback(async (): Promise<boolean> => {
    const result = await syncBilling.mutateAsync();
    const isPro = result.plan === 'pro' || result.plan === 'enterprise';
    setStatus(isPro ? 'pro' : 'free');
    return isPro;
  }, [syncBilling]);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (!enabled || !activeUserIdRef.current) return false;
    const previousStatus = status;
    try {
      const result = await getClient().presentPaywall();
      if (result !== 'purchased' && result !== 'restored') {
        setStatus(previousStatus === 'pro' ? 'pro' : 'free');
        return false;
      }
      setStatus('loading');
      return await verifyServerPlan();
    } catch {
      setStatus('error');
      return false;
    }
  }, [enabled, getClient, status, verifyServerPlan]);

  const presentCustomerCenter = useCallback(async (): Promise<void> => {
    if (!enabled || !activeUserIdRef.current) return;
    await getClient().presentCustomerCenter();
  }, [enabled, getClient]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!enabled || !activeUserIdRef.current) return false;
    try {
      await getClient().restorePurchases();
      setStatus('loading');
      return await verifyServerPlan();
    } catch {
      setStatus('error');
      return false;
    }
  }, [enabled, getClient, verifyServerPlan]);

  const value = useMemo<BillingContextValue>(() => ({
    enabled,
    status,
    presentPaywall,
    presentCustomerCenter,
    restorePurchases,
    refresh,
  }), [
    enabled,
    presentCustomerCenter,
    presentPaywall,
    refresh,
    restorePurchases,
    status,
  ]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const value = useContext(BillingContext);
  if (!value) {
    throw new Error('useBilling must be used within a <BillingProvider>');
  }
  return value;
}
