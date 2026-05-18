/**
 * Usage route — wires `/me/usage` into the props-only `Usage` body.
 *
 * P3.15.4 wiring:
 *  - The `/me/usage` response is locally augmented with token columns
 *    via `LegacyUsageMonth` / `LegacyUsageTotals`. TODO(P3.15.4-contract):
 *    drop the local type once the api-contract regen lands.
 *  - Per-model breakdown is forwarded straight through to the screen,
 *    which renders it inside the expanded month row.
 */
import { useRouter } from 'expo-router';

import { Usage, type UsageMonthlyRow, type UsageTotals } from '@/screens/usage';
import { useMeUsageQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

// TODO(P3.15.4-contract): remove these local types once /me/usage
// regenerates with token columns + per-model rollup.
interface LegacyUsageMonth {
  month: string;
  reports: number;
  voiceNotes: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  perModel?: ReadonlyArray<{
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}

interface LegacyUsageTotals {
  reports: number;
  voiceNotes: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

export default function UsageRoute() {
  const router = useRouter();
  const usageQuery = useMeUsageQuery();
  const { refreshing, onRefresh } = useRefresh([usageQuery.refetch]);

  const months = (usageQuery.data?.months ?? []) as unknown as LegacyUsageMonth[];
  const totalsRaw = (usageQuery.data?.totals ?? {
    reports: 0,
    voiceNotes: 0,
  }) as unknown as LegacyUsageTotals;

  const history: ReadonlyArray<UsageMonthlyRow> | null = usageQuery.data
    ? months.map((m) => ({
        month: m.month,
        reportsCount: m.reports,
        voiceNotesCount: m.voiceNotes,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cachedTokens: m.cachedTokens,
        perModel: m.perModel,
      }))
    : null;

  const totals: UsageTotals = {
    reports: totalsRaw.reports,
    voiceNotes: totalsRaw.voiceNotes,
    inputTokens: totalsRaw.inputTokens,
    outputTokens: totalsRaw.outputTokens,
    cachedTokens: totalsRaw.cachedTokens,
  };

  return (
    <Usage
      history={history}
      totals={totals}
      isLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as never)}
    />
  );
}
