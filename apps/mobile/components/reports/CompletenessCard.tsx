/**
 * CompletenessCard — warns when a report is missing common fields and
 * shows tags for each missing slice. Returns null when everything is
 * present (the report is "complete"). Ported from
 * `../haru3-reports/apps/mobile/components/reports/CompletenessCard.tsx`
 * on branch `dev`.
 */
import { View, Text } from 'react-native';
import {
  AlertTriangle,
  Cloud,
  Users,
  Package,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react-native';
import { reports } from '@harpa/api-contract';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { colors } from '@/lib/design-tokens/colors';

interface MissingField {
  label: string;
  icon: LucideIcon;
}

function getMissingFields(report: reports.ReportBody): MissingField[] {
  const missing: MissingField[] = [];

  if (!report.meta.visitDate) {
    missing.push({ label: 'Visit date', icon: ClipboardList });
  }
  if (!report.weather) {
    missing.push({ label: 'Weather conditions', icon: Cloud });
  }
  if (report.workers.length === 0) {
    missing.push({ label: 'Workers / crew info', icon: Users });
  }
  if (report.materials.length === 0) {
    missing.push({ label: 'Materials', icon: Package });
  }
  if (report.issues.length === 0) {
    missing.push({ label: 'Issues / risks', icon: AlertTriangle });
  }
  if (report.nextSteps.length === 0) {
    missing.push({ label: 'Next steps', icon: ClipboardList });
  }

  return missing;
}

interface CompletenessCardProps {
  report: reports.ReportBody;
}

export function CompletenessCard({ report }: CompletenessCardProps) {
  const missingFields = getMissingFields(report);

  if (missingFields.length === 0) {
    return null;
  }

  return (
    <Card variant="emphasis">
      <SectionHeader
        title={`Still missing (${missingFields.length})`}
        subtitle="Add a note about the topics below to complete the report."
        icon={<AlertTriangle size={16} color={colors.warning.text} />}
      />
      <View className="mt-3 flex-row flex-wrap gap-2">
        {missingFields.map((field) => {
          const Icon = field.icon;
          return (
            <View
              key={field.label}
              className="flex-row items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-3 py-2"
            >
              <Icon size={12} color={colors.warning.text} />
              <Text className="text-sm font-semibold uppercase tracking-wider text-warning-text">
                {field.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
