/**
 * Usage route — wires `/me/usage` (aggregates) + `/me/usage/events`
 * (per-call timeline) into the props-only `Usage` body.
 */
import { useRouter, type Href } from 'expo-router';

import {
  Usage,
  type UsageMonthlyRow,
  type UsageByModelRow,
  type RecentUsageEvent,
} from '@/screens/usage';
import {
  useMeUsageQuery,
  useMeLimitsQuery,
  useMeUsageEventsQuery,
} from '@/lib/api/hooks';
import { useRefresh } from '@/lib/util/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

export default function UsageRoute() {
  const router = useRouter();
  const usageQuery = useMeUsageQuery();
  const limitsQuery = useMeLimitsQuery();
  // Show the most recent 20 LLM calls. Single page is enough for the
  // overview screen; a paginated drilldown can land later if needed.
  const eventsQuery = useMeUsageEventsQuery({ query: { limit: 20 } });
  const { refreshing, onRefresh } = useRefresh([
    usageQuery.refetch,
    limitsQuery.refetch,
    eventsQuery.refetch,
  ]);

  const tokensByMonth = new Map<string, { input: number; output: number; cached: number; seconds: number; calls: number }>();
  for (const t of usageQuery.data?.usageTokens ?? []) {
    tokensByMonth.set(t.month, {
      input: t.inputTokens,
      output: t.outputTokens,
      cached: t.cachedTokens,
      seconds: t.inputSeconds,
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
          inputSeconds: tok?.seconds ?? 0,
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
    inputSeconds: 0,
    calls: 0,
  };

  const byModel: ReadonlyArray<UsageByModelRow> = usageQuery.data?.usageByModel ?? [];

  const recentEvents: ReadonlyArray<RecentUsageEvent> = (eventsQuery.data?.items ?? []).map(
    (e) => ({
      id: e.id,
      createdAt: e.createdAt,
      vendor: e.vendor,
      model: e.model,
      operation: e.operation,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cachedTokens: e.cachedTokens,
      inputSeconds: e.inputSeconds,
      status: e.status,
    }),
  );

  return (
    <Usage
      history={history}
      totals={totals}
      byModel={byModel}
      recentEvents={recentEvents}
      isLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as Href)}
      chart={null}
      limits={limitsQuery.data ? { plan: limitsQuery.data.plan, buckets: limitsQuery.data.buckets } : undefined}
    />
  );
}
