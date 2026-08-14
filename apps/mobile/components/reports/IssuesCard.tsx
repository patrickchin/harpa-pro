/**
 * IssuesCard — severity-coloured list of issues raised in the report.
 * Returns null when empty. Ported from
 * `../haru3-reports/apps/mobile/components/reports/IssuesCard.tsx` on
 * branch `dev`. Severity styles use the soft `*-border` ramp so cards
 * match the visual weight of the rest of the design system.
 */
import { View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { reports } from '@harpa/api-contract';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { AddAttachmentsButton } from '@/components/reports/detail/AddAttachmentsButton';
import { PlacedPhotoStrip } from '@/components/reports/detail/PlacedPhotoStrip';
import {
  getIssueMeta,
  getIssueSeverityTone,
  toTitleCase,
} from '@/lib/reports/report-ui';
import { colors } from '@/lib/design-tokens/colors';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

const SEVERITY_STYLES: Record<
  string,
  { stripe: string; bg: string; text: string }
> = {
  danger: {
    stripe: 'bg-danger-border',
    bg: 'bg-danger-soft',
    text: 'text-danger-text',
  },
  warning: {
    stripe: 'bg-warning-border',
    bg: 'bg-warning-soft',
    text: 'text-warning-text',
  },
  neutral: {
    stripe: 'bg-border',
    bg: 'bg-secondary',
    text: 'text-muted-foreground',
  },
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[getIssueSeverityTone(severity)]!;
}

interface IssuesCardProps {
  issues: reports.ReportBody['issues'];
  onEditIssue?: (index: number) => void;
  /**
   * Optional map of issue index → placed photo groups. When set, each
   * matching issue renders its photos as a small inline strip below
   * the action-required banner.
   */
  placedByIssue?: ReadonlyMap<number, ReadonlyArray<PhotoGroup>>;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  onEditPlacement?: (noteId: string) => void;
  placementActionsDisabled?: boolean;
  onAddAttachmentsToIssue?: (index: number) => void;
  editActionsDisabled?: boolean;
}

export function IssuesCard({
  issues,
  onEditIssue,
  placedByIssue,
  onOpenPhoto,
  onEditPlacement,
  placementActionsDisabled = false,
  onAddAttachmentsToIssue,
  editActionsDisabled = false,
}: IssuesCardProps) {
  if (issues.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Issues"
        icon={<AlertTriangle size={16} color={colors.warning.text} />}
        trailing={
          <View className="rounded-md border border-warning-border bg-warning-soft px-3 py-1.5">
            <Text className="text-sm font-semibold text-warning-text">
              {issues.length}
            </Text>
          </View>
        }
      />
      <View className="mt-4 gap-4">
        {issues.map((issue, index) => {
          const severityLabel = issue.severity?.trim() ? toTitleCase(issue.severity) : 'Unknown';
          const style = getSeverityStyle(issue.severity ?? '');
          const meta = getIssueMeta(issue);
          return (
            <View
              key={`${issue.title}-${index}`}
              className={index > 0 ? 'border-t border-border pt-4' : ''}
            >
              <View className="flex-row gap-3">
                <View
                  className={`${style.stripe} self-stretch rounded-full`}
                  style={{ width: 4 }}
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-start gap-3">
                    <Text className="flex-1 text-base font-semibold text-foreground">
                      {issue.title}
                    </Text>
                    <View
                      className={`${style.bg} shrink-0 rounded-md border border-current px-2.5 py-1.5`}
                    >
                      <Text
                        className={`text-sm font-semibold uppercase tracking-wider ${style.text}`}
                      >
                        {severityLabel}
                      </Text>
                    </View>
                    {onAddAttachmentsToIssue || onEditIssue ? (
                      <View className="shrink-0 flex-row items-center gap-2">
                        <View
                          className="flex-row items-center gap-2"
                          testID={`report-issue-actions-${index}`}
                        >
                          {onAddAttachmentsToIssue ? (
                            <AddAttachmentsButton
                              onPress={() => {
                                if (placementActionsDisabled) return;
                                onAddAttachmentsToIssue(index);
                              }}
                              disabled={placementActionsDisabled}
                              accessibilityLabel={`Add attachments to issue ${index + 1}`}
                              testID={`btn-add-attachments-issue-${index}`}
                            />
                          ) : null}
                          {onEditIssue ? (
                            <EditPencilButton
                              onPress={() => {
                                if (editActionsDisabled) return;
                                onEditIssue(index);
                              }}
                              disabled={editActionsDisabled}
                              accessibilityLabel={`Edit issue ${index + 1}`}
                              testID={`btn-edit-issue-${index}`}
                            />
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                  {meta ? (
                    <Text className="mt-2 text-sm text-muted-foreground">{meta}</Text>
                  ) : null}
                  {issue.description ? (
                    <Text className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {issue.description}
                    </Text>
                  ) : null}
                  {issue.action ? (
                    <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                      <Text className="text-base font-medium text-warning-text">
                        → {issue.action}
                      </Text>
                    </View>
                  ) : null}
                  {placedByIssue && (placedByIssue.get(index)?.length ?? 0) > 0 ? (
                    <PlacedPhotoStrip
                      groups={placedByIssue.get(index)!}
                      onOpenPhoto={onOpenPhoto}
                      onEditPlacement={onEditPlacement}
                      placementActionsDisabled={placementActionsDisabled}
                      testID={`placed-photos-issue-${index}`}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
