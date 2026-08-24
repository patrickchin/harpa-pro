/**
 * Report Debug route — slug-native scheme.
 *
 * Reads `project` + per-project `number`, fetches the Debug payload
 * via `useReportDebugQuery`, and renders the props-driven
 * `ReportDebug` screen body. The shared developer-tools policy gates
 * both its navigation entry and direct deep links.
 *
 * See docs/v4/design-maestro-full-regression.md §3.4.
 */
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { ReportDebug } from '@/screens/report-debug';
import { useReportDebugQuery } from '@/lib/api/hooks';
import { safeBack } from '@/lib/nav/safe-back';
import { AppHeaderActions } from '@/components/ui/AppHeaderActions';
import { SHOW_DEVELOPER_TOOLS } from '@/lib/config/developer-tools';

type DebugResponse = {
  prompt: { system: string; user: string };
  notes: ReadonlyArray<{
    id: string;
    kind: 'text' | 'voice' | 'image' | 'document';
    body: string | null;
    transcript: string | null;
    createdAt: string;
  }>;
  lastGeneration: {
    requestedAt: string;
    finishedAt: string | null;
    vendor: string;
    model: string;
    fixtureMode: 'live' | 'replay' | 'record';
    systemPrompt: string;
    userPrompt: string;
    response: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens?: number;
    } | null;
  } | null;
};

export default function ReportDebugRoute() {
  const router = useRouter();
  const { project, number } = useLocalSearchParams<{
    project: string;
    number: string;
  }>();
  const slug = project ?? '';
  const rawNumber = number ?? '';
  const parsedNumber = /^[1-9]\d*$/.test(rawNumber) ? Number(rawNumber) : Number.NaN;
  const reportNumber = Number.isSafeInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;
  const hasValidRouteParams = slug.length > 0 && reportNumber !== null;

  const debugQuery = useReportDebugQuery(
    {
      params: {
        project: slug,
        number: reportNumber ?? 0,
      },
    },
    { enabled: SHOW_DEVELOPER_TOOLS && hasValidRouteParams },
  );

  const data = debugQuery.data as DebugResponse | undefined;

  if (slug.length === 0 || reportNumber === null) {
    return <Redirect href="/(app)/projects" />;
  }

  if (!SHOW_DEVELOPER_TOOLS) {
    return <Redirect href={`/(app)/projects/${slug}/reports/${reportNumber}` as Href} />;
  }

  return (
    <ReportDebug
      reportNumber={reportNumber}
      isLoading={debugQuery.isLoading}
      loadError={debugQuery.error ?? null}
      prompt={data?.prompt ?? null}
      notes={data?.notes ?? []}
      lastGeneration={data?.lastGeneration ?? null}
      onBack={() => safeBack(router, `/(app)/projects/${slug}/reports/${reportNumber}`)}
      actions={<AppHeaderActions />}
    />
  );
}
