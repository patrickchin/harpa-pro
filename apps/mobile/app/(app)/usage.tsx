/**
 * Usage route — wires `/me/usage` into the props-only `Usage` body.
 *
 * The v4 API returns `{ months: [{ month, reports, voiceNotes }],
 * totals }`; per-event timeline + per-model breakdown + the
 * `UsageBarChart` are deferred to P4 (route passes `chart={null}`).
 */
import { useRouter } from 'expo-router';

import { Usage, type UsageMonthlyRow, type UsageByModelRow } from '@/screens/usage';
import { useMeUsageQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

export default function UsageRoute() {
  const router = useRouter();
  const usageQuery = useMeUsageQuery();
  const { refreshing, onRefresh } = useRefresh([usageQuery.refetch]);

  const tokensByMonth = new Map<string, { input: number; output: number; cached: number; calls: number }>();
  for (const t of usageQuery.data?.usageTokens ?? []) {
    tokensByMonth.set(t.month, {
      input: t.inputTokens,
      output: t.outputTokens,
      cached: t.cachedTokens,
      calls: t.calls,
    });
  }

  const history: ReadonlyArray<UsageMonthlyRow> | null = usageQuery.data
    ? usageQuery.data.months.map((m) => {
        const tok = tokensByMonth.get(m.month);
        return {
          month: m.month,
          reportsCount: m.reports,
          voiceNotesCount: m.voiceNotes,
          inputTokens: tok?.input ?? 0,
          outputTokens: tok?.output ?? 0,
          cachedTokens: tok?.cached ?? 0,
          calls: tok?.calls ?? 0,
        };
      })
    : null;

  const totals = usageQuery.data?.totals ?? {
    reports: 0,
    voiceNotes: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    calls: 0,
  };

  const byModel: ReadonlyArray<UsageByModelRow> = usageQuery.data?.usageByModel ?? [];

  return (
    <Usage
      history={history}
      totals={totals}
      byModel={byModel}
      isLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as never)}
      chart={null}
    />
  );
}
