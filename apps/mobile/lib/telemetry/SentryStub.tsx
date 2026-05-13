/**
 * SentryStub — telemetry hookup post-MVP.
 *
 * No-op for P2.6. Real Sentry setup lands when we have a production DSN
 * and decide on sampling rates / error filtering rules.
 */
import { type ReactNode } from 'react';

export function initSentry() {
  // No-op for P2.6. Real Sentry setup post-MVP.
}

export function SentryProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
