import { createContext, useContext } from 'react';

import type { BillingContextValue } from './types';

export const BillingContext = createContext<BillingContextValue | undefined>(undefined);

export function useBilling(): BillingContextValue {
  const value = useContext(BillingContext);
  if (!value) {
    throw new Error('useBilling must be used within a <BillingProvider>');
  }
  return value;
}

export function useOptionalBilling(): BillingContextValue | null {
  return useContext(BillingContext) ?? null;
}
