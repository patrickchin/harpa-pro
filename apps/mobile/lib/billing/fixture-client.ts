import type { BillingClient, BillingCustomerInfo } from './types';

export function createFixtureBillingClient(): BillingClient {
  let hasPro = false;

  const customerInfo = (): BillingCustomerInfo => ({ hasPro });

  return {
    async configure() {},
    async logIn() {},
    async logOut() {
      hasPro = false;
    },
    async presentPaywall() {
      hasPro = true;
      return 'purchased';
    },
    async presentCustomerCenter() {},
    async restorePurchases() {
      hasPro = true;
      return customerInfo();
    },
    async getCustomerInfo() {
      return customerInfo();
    },
  };
}
