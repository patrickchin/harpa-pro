/**
 * Usage route — wires `/me/usage` into the props-only `Usage` body.
 *
 * The v4 API returns `{ months: [{ month, reports, voiceNotes }],
 * totals }`; per-event timeline + per-model breakdown + the
 * `UsageBarChart` are deferred to P4 (route passes `chart={null}`).
 */
import { useRouter } from 'expo-router';

import { Usage, type UsageMonthlyRow } from '@/screens/usage';
import { useMeUsageQuery } from '@/lib/api/hooks';
import { useRefresh } from '@/lib/use-refresh';
import { safeBack } from '@/lib/nav/safe-back';

export default function UsageRoute() {
  const router = useRouter();
  const usageQuery = useMeUsageQuery();
  const { refreshing, onRefresh } = useRefresh([usageQuery.refetch]);

  const history: ReadonlyArray<UsageMonthlyRow> | null = usageQuery.data
    ? usageQuery.data.months.map((m) => ({
        month: m.month,
        reportsCount: m.reports,
        voiceNotesCount: m.voiceNotes,
      }))
    : null;

  const totals = usageQuery.data?.totals ?? { reports: 0, voiceNotes: 0 };

  return (
    <Usage
      history={history}
      totals={totals}
      isLoading={usageQuery.isLoading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => safeBack(router, '/(app)/profile' as never)}
      // TODO(P4): pass <UsageBarChart … /> once we have token-level
      // monthly history to render.
      chart={null}
    />
  );
}
