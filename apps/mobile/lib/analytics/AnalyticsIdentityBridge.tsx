/**
 * Bridges AuthSessionProvider → AnalyticsProvider.
 *
 * - On sign-in: posthog.identify(user.id, { phone_country, app_variant }).
 * - On sign-out: posthog.reset() so the next anonymous visit gets a
 *   fresh distinct id (the auth user's events stay associated with
 *   the previous id).
 *
 * Must render *below* AuthSessionProvider and *below* AnalyticsProvider
 * so both contexts are available. Stateless component — all side effects
 * are in the effect.
 */
import { useEffect, useRef } from 'react';
import { useAuthSession } from '@/lib/auth/session';
import { useAnalytics } from './AnalyticsStub';

export function AnalyticsIdentityBridge() {
  const { user } = useAuthSession();
  const analytics = useAnalytics();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = user?.id ?? null;
    if (id === lastIdRef.current) return;

    if (id) {
      analytics.identify(id);
    } else if (lastIdRef.current) {
      // Was signed in, now signed out → reset distinct id.
      analytics.reset();
    }
    lastIdRef.current = id;
  }, [user?.id, analytics]);

  return null;
}
