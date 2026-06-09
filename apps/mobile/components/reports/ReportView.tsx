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
import type { ReportEditTarget } from './edit/types';
import type { SplitPlacements } from '@/lib/reports/photo-placements';

interface ReportViewProps {
  report: GeneratedSiteReport;
  /** Per-project report number — used to build testIDs for Maestro selectors. */
  reportNumber?: number;
  /**
   * When provided, each editable card surfaces a pencil button. Tapping
   * fires this callback with the target slice descriptor; the parent
   * mounts `<ReportEditModal>` and threads the result back through
   * `onChangeReport`. Undefined in the generate flow (read-only).
   */
  onEdit?: (target: ReportEditTarget) => void;
  /**
   * Pre-split placement buckets from `splitPlacements`. When provided,
   * placed photo groups render inline under their target issue or
   * section card. Unplaced groups remain the caller's responsibility
   * (typically `ReportPhotos`).
   */
  placements?: SplitPlacements;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  onEditPlacement?: (noteId: string) => void;
}

export function ReportView({
  report,
  reportNumber,
  onEdit,
  placements,
  onOpenPhoto,
  onEditPlacement,
}: ReportViewProps) {
  const { sections } = report.report;
  const numStr = reportNumber ?? 'x';

  return (
    <View className="gap-3" testID={`report-view-${numStr}`}>
      <StatBar report={report} />

      <WeatherStrip
        report={report}
        onEdit={onEdit ? () => onEdit({ kind: 'weather' }) : undefined}
      />

      <SummaryLead
        summary={report.report.meta.summary}
        onEdit={onEdit ? () => onEdit({ kind: 'meta' }) : undefined}
      />

      <IssuesCard
        issues={report.report.issues}
        onEditIssue={
          onEdit ? (index) => onEdit({ kind: 'issue', index }) : undefined
        }
        placedByIssue={placements?.byIssue}
        onOpenPhoto={onOpenPhoto}
        onEditPlacement={onEditPlacement}
      />

      <WorkersCard
        workers={report.report.workers}
        onEdit={onEdit ? () => onEdit({ kind: 'workers' }) : undefined}
      />

      <MaterialsCard
        materials={report.report.materials}
        onEdit={onEdit ? () => onEdit({ kind: 'materials' }) : undefined}
      />

      <NextStepsCard
        steps={report.report.nextSteps}
        onEdit={onEdit ? () => onEdit({ kind: 'nextSteps' }) : undefined}
      />

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
              onEdit={
                onEdit ? () => onEdit({ kind: 'section', index: i }) : undefined
              }
              placedGroups={placements?.bySection.get(i)}
              onOpenPhoto={onOpenPhoto}
              onEditPlacement={onEditPlacement}
            />
          ))}
        </View>
      )}
    </View>
  );
}
