/**
 * ReportView — read-only composition of every section card that makes
 * up a generated report. Children handle their own empty-state logic
 * (e.g. WorkersCard returns null when workers is absent), so this
 * component is intentionally dumb. Ported from
 * `../haru3-reports/apps/mobile/components/reports/ReportView.tsx` on
 * branch `dev`.
 */
import { View, Text } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { StatBar } from './StatBar';
import { WeatherStrip } from './WeatherStrip';
import { WorkersCard } from './WorkersCard';
import { MaterialsCard } from './MaterialsCard';
import { IssuesCard } from './IssuesCard';
import { NextStepsCard } from './NextStepsCard';
import { SummarySectionCard } from './SummarySectionCard';
import { colors } from '@/lib/design-tokens/colors';

interface ReportViewProps {
  report: GeneratedSiteReport;
}

export function ReportView({ report }: ReportViewProps) {
  const { sections } = report.report;

  return (
    <View className="gap-3">
      <StatBar report={report} />

      <WeatherStrip report={report} />

      {report.report.meta.summary ? (
        <Card variant="default" padding="lg">
          <SectionHeader
            title="Summary"
            icon={<FileText size={16} color={colors.foreground} />}
          />
          <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
            {report.report.meta.summary}
          </Text>
        </Card>
      ) : null}

      <IssuesCard issues={report.report.issues} />

      <WorkersCard workers={report.report.workers} />

      <MaterialsCard materials={report.report.materials} />

      <NextStepsCard steps={report.report.nextSteps} />

      {sections.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Summary Sections
          </Text>
          {sections.map((section, i) => (
            <SummarySectionCard key={`${section.title}-${i}`} section={section} />
          ))}
        </View>
      )}
    </View>
  );
}
