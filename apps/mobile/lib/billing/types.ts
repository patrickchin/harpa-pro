export type BillingStatus = 'disabled' | 'loading' | 'free' | 'pro' | 'error';

export type BillingPaywallResult =
  | 'purchased'
  | 'restored'
  | 'cancelled'
  | 'not_presented'
  | 'error';

export interface BillingCustomerInfo {
  hasPro: boolean;
}

export interface BillingClient {
  configure(appUserId: string): Promise<void>;
  logIn(appUserId: string): Promise<void>;
  logOut(): Promise<void>;
  presentPaywall(): Promise<BillingPaywallResult>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<BillingCustomerInfo>;
  getCustomerInfo(): Promise<BillingCustomerInfo>;
}

export interface BillingContextValue {
  enabled: boolean;
  status: BillingStatus;
  presentPaywall(): Promise<boolean>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<boolean>;
  refresh(): Promise<void>;
}
