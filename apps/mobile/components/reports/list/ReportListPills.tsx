import { Text, View } from 'react-native';
import { reports } from '@harpa/api-contract';

const reportTypeLabels: Record<reports.ReportTypeValue, string> = {
  site_visit: 'Site visit',
  daily: 'Daily',
  inspection: 'Inspection',
  safety: 'Safety',
  incident: 'Incident',
  progress: 'Progress',
};

const riskLevelStyles: Record<
  reports.RiskLevelValue,
  { container: string; text: string }
> = {
  low: {
    container: 'rounded-md border border-success-border bg-success-soft px-2 py-1',
    text: 'text-xs font-semibold uppercase text-success-text',
  },
  medium: {
    container: 'rounded-md border border-warning-border bg-warning-soft px-2 py-1',
    text: 'text-xs font-semibold uppercase text-warning-text',
  },
  high: {
    container: 'rounded-md border border-danger-border bg-danger-soft px-2 py-1',
    text: 'text-xs font-semibold uppercase text-danger-text',
  },
};

export function ReportTypePill({
  value,
}: {
  value: reports.ReportTypeValue | null | undefined;
}) {
  if (!value) return null;
  return (
    <View className="rounded-md border border-border bg-card px-2 py-1">
      <Text className="text-xs font-medium text-muted-foreground">
        {reportTypeLabels[value]}
      </Text>
    </View>
  );
}

export function RiskLevelBadge({
  value,
}: {
  value: reports.RiskLevelValue | null | undefined;
}) {
  if (!value) return null;
  const style = riskLevelStyles[value];
  const label = value === 'low' ? 'Low' : value === 'medium' ? 'Medium' : 'High';
  return (
    <View className={style.container}>
      <Text className={style.text}>{label}</Text>
    </View>
  );
}
