/**
 * Usage route — wires `/me/usage` into the props-only `Usage` body.
 *
 * The `/me/usage` response shape is the contract `usageResponse`
 * (months[], byModel[], totals) with token columns nested under
 * `tokens.{input,output,cached}`. We flatten that into the screen's
 * presentation type (`reportsCount` / `voiceNotesCount` / flat token
 * fields). Per-model rollup is global, not per-month, so individual
 * `UsageMonthlyRow`s don't carry a `perModel` breakdown.
 */
import { useRouter } from 'expo-router';

import { Usage, type UsageMonthlyRow, type UsageTotals } from '@/screens/usage';
import { useMeUsageQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';

export default function UsageRoute() {
  const router = useRouter();
  const usageQuery = useMeUsageQuery();
  const { refreshing, onRefresh } = useRefresh([usageQuery.refetch]);

  const history: ReadonlyArray<UsageMonthlyRow> | null = usageQuery.data
    ? usageQuery.data.months.map((m) => ({
        month: m.month,
        reportsCount: m.reports,
        voiceNotesCount: m.voiceNotes,
        inputTokens: m.tokens.input,
        outputTokens: m.tokens.output,
        cachedTokens: m.tokens.cached,
      }))
    : null;

  const totalsRaw = usageQuery.data?.totals;
  const totals: UsageTotals = {
    reports: totalsRaw?.reports ?? 0,
    voiceNotes: totalsRaw?.voiceNotes ?? 0,
    inputTokens: totalsRaw?.tokens.input,
    outputTokens: totalsRaw?.tokens.output,
    cachedTokens: totalsRaw?.tokens.cached,
  };

  return (
    <Usage
      history={history}
      totals={totals}
      isLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as never)}
      actions={<AppHeaderActions />}
    />
  );
}
