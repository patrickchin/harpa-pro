/**
 * IssuesCard — severity-coloured list of issues raised in the report.
 * Returns null when empty. Ported from
 * `../haru3-reports/apps/mobile/components/reports/IssuesCard.tsx` on
 * branch `dev`. Severity styles use the soft `*-border` ramp so cards
 * match the visual weight of the rest of the design system.
 */
import { View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import type { GeneratedReportIssue } from '@harpa/report-core';
import { toTitleCase } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { getIssueSeverityTone } from '@/lib/mobile-ui';
import { colors } from '@/lib/design-tokens/colors';

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
  issues: readonly GeneratedReportIssue[];
}

export function IssuesCard({ issues }: IssuesCardProps) {
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
          const style = getSeverityStyle(issue.severity);
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
                        {toTitleCase(issue.severity)}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-2 text-sm text-muted-foreground">
                    {[issue.category, issue.status]
                      .filter(Boolean)
                      .map(toTitleCase)
                      .join(' · ')}
                  </Text>
                  <Text className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {issue.details}
                  </Text>
                  {issue.actionRequired ? (
                    <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                      <Text className="text-base font-medium text-warning-text">
                        → {issue.actionRequired}
                      </Text>
                    </View>
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
