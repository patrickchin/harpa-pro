/**
 * ReportView — read-only composition of every section card that makes
 * up a generated report. Children handle their own empty-state logic
 * (e.g. WorkersCard returns null when workers is absent), so this
 * component is intentionally dumb. Ported from
 * `../haru3-reports/apps/mobile/components/reports/ReportView.tsx` on
 * branch `dev`.
 */
import { View, Text } from 'react-native';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { StatBar } from './StatBar';
import { WeatherStrip } from './WeatherStrip';
import { WorkersCard } from './WorkersCard';
import { MaterialsCard } from './MaterialsCard';
import { IssuesCard } from './IssuesCard';
import { NextStepsCard } from './NextStepsCard';
import { SummarySectionCard } from './SummarySectionCard';
import { SummaryLead } from './detail/SummaryLead';

interface ReportViewProps {
  report: GeneratedSiteReport;
  /** Per-project report number — used to build testIDs for Maestro selectors. */
  reportNumber?: number;
}

export function ReportView({ report, reportNumber }: ReportViewProps) {
  const { sections } = report.report;
  const numStr = reportNumber ?? 'x';

  return (
    <View className="gap-3" testID={`report-view-${numStr}`}>
      <StatBar report={report} />

      <WeatherStrip report={report} />

      <SummaryLead summary={report.report.meta.summary} />

      <IssuesCard issues={report.report.issues} />

      <WorkersCard workers={report.report.workers} />

      <MaterialsCard materials={report.report.materials} />

      <NextStepsCard steps={report.report.nextSteps} />

      {sections.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Detailed Sections
          </Text>
          {sections.map((section, i) => (
            <SummarySectionCard
              key={`${section.title}-${i}`}
              section={section}
              reportNumber={reportNumber}
              sectionIndex={i}
            />
          ))}
        </View>
      )}
    </View>
  );
}
