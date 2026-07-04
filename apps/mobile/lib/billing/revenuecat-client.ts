import type { CustomerInfo } from 'react-native-purchases';
import type { PAYWALL_RESULT as PaywallResult } from 'react-native-purchases-ui';

import type {
  BillingClient,
  BillingCustomerInfo,
  BillingPaywallResult,
} from './types';

interface RevenueCatModules {
  Purchases: typeof import('react-native-purchases').default;
  RevenueCatUI: typeof import('react-native-purchases-ui').default;
  paywallResult: typeof import('react-native-purchases-ui').PAYWALL_RESULT;
}

function toCustomerInfo(info: CustomerInfo): BillingCustomerInfo {
  return { hasPro: info.entitlements.active.pro !== undefined };
}

function toPaywallResult(
  result: PaywallResult,
  values: RevenueCatModules['paywallResult'],
): BillingPaywallResult {
  switch (result) {
    case values.PURCHASED:
      return 'purchased';
    case values.RESTORED:
      return 'restored';
    case values.CANCELLED:
      return 'cancelled';
    case values.NOT_PRESENTED:
      return 'not_presented';
    default:
      return 'error';
  }
}

export function createRevenueCatBillingClient(apiKey: string): BillingClient {
  let modulesPromise: Promise<RevenueCatModules> | null = null;

  const loadModules = async (): Promise<RevenueCatModules> => {
    modulesPromise ??= Promise.all([
      import('react-native-purchases'),
      import('react-native-purchases-ui'),
    ]).then(([purchases, ui]) => ({
      Purchases: purchases.default,
      RevenueCatUI: ui.default,
      paywallResult: ui.PAYWALL_RESULT,
    }));
    return modulesPromise;
  };

  return {
    async configure(appUserId) {
      const { Purchases } = await loadModules();
      Purchases.configure({ apiKey, appUserID: appUserId });
    },
    async logIn(appUserId) {
      const { Purchases } = await loadModules();
      await Purchases.logIn(appUserId);
    },
    async logOut() {
      const { Purchases } = await loadModules();
      await Purchases.logOut();
    },
    async presentPaywall() {
      const modules = await loadModules();
      const result = await modules.RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: 'pro',
      });
      return toPaywallResult(result, modules.paywallResult);
    },
    async presentCustomerCenter() {
      const { RevenueCatUI } = await loadModules();
      await RevenueCatUI.presentCustomerCenter();
    },
    async restorePurchases() {
      const { Purchases } = await loadModules();
      return toCustomerInfo(await Purchases.restorePurchases());
    },
    async getCustomerInfo() {
      const { Purchases } = await loadModules();
      return toCustomerInfo(await Purchases.getCustomerInfo());
    },
  };
}
