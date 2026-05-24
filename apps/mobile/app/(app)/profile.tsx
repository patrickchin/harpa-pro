/**
 * Profile route — wires the better-auth session, /me/usage query,
 * sign-out, and query-cache clearing into the props-only
 * `Profile` body.
 *
 * AI provider state + provider availability are deferred to P4 — the
 * route passes empty lists and `showDeveloperSection={false}` so the
 * Developer card is hidden on real builds (the dev mirror flips it
 * on with the canonical catalogue for visual review).
 */
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Profile, type ProfileMonthlyUsage } from '@/screens/profile';
import { useAuthSession } from '@/lib/auth/session';
import { useMeUsageQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { useCopyToClipboard } from '@/lib/use-clipboard';
import { safeBack } from '@/lib/nav/safe-back';
import {
  AI_PROVIDERS,
  PROVIDER_MODELS,
  useAiProvider,
  useAvailableProviders,
  type AiProviderKey,
} from '@/lib/ai/useAiProvider';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function ProfileRoute() {
  const router = useRouter();
  const { status, user, signOut } = useAuthSession();
  const queryClient = useQueryClient();
  const { copy } = useCopyToClipboard();

  const usageQuery = useMeUsageQuery();
  const { refreshing, onRefresh } = useRefresh([usageQuery.refetch]);

  const ai = useAiProvider();
  const availability = useAvailableProviders();

  // Find the current month's row from the v4 usage history; fall back
  // to null. v4 returns one row per month — match by the YYYY-MM prefix
  // of "now" rather than relying on row order.
  const now = new Date();
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const currentMonthRow = usageQuery.data?.months.find((m) => m.month === yyyyMm) ?? null;
  const monthlyUsage: ProfileMonthlyUsage | null =
    currentMonthRow
      ? {
          reportsCount: currentMonthRow.reports,
          voiceNotesCount: currentMonthRow.voiceNotes,
          // TODO(P4): wire token-level counts once the v4 API exposes them.
        }
      : null;

  return (
    <Profile
      user={
        user
          ? {
              displayName: user.displayName,
              companyName: user.companyName,
              phone: user.phone,
            }
          : null
      }
      isLoading={status === 'loading'}
      monthlyUsage={monthlyUsage}
      usageLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/projects')}
      onPressAccount={() => router.push('/(app)/account' as Href)}
      onPressUsage={() => router.push('/(app)/usage' as Href)}
      onCopy={(value, options) => {
        void copy(value, { toast: options.toast });
      }}
      onSignOut={async () => {
        await signOut();
        // Auth gate in (app)/_layout.tsx redirects automatically when
        // status becomes 'unauthenticated'. Explicit navigation here
        // causes a POP_TO_TOP error because the (app) stack is already
        // unmounting.
      }}
      onClearCache={async () => {
        queryClient.clear();
        await queryClient.refetchQueries({ type: 'active' });
      }}
      // P3.15.4 — AI provider picker. Availability defaults to all
      // providers until the API exposes a probe (NOTE: P4). Selection
      // persists via AsyncStorage.
      showDeveloperSection
      aiProviders={AI_PROVIDERS}
      aiProvider={ai.provider}
      onSelectProvider={(key) => ai.setProvider(key as AiProviderKey)}
      aiModels={PROVIDER_MODELS[ai.provider] ?? []}
      aiModel={ai.model}
      onSelectModel={(model) => ai.setModel(model)}
      availableProviderKeys={availability.availableKeys}
      actions={<AppHeaderActions />}
    />
  );
}
