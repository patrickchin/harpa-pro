/**
 * WeatherStrip — compact weather summary card. Ported from
 * `../haru3-reports/apps/mobile/components/reports/WeatherStrip.tsx`
 * on branch `dev`. Returns null when no weather data is present unless
 * the report is editable, so drafts can still open the Weather modal.
 */
import { View, Text } from 'react-native';
import { Cloud, Thermometer, Wind } from 'lucide-react-native';
import { reports } from '@harpa/api-contract';

import { Card } from '@/components/primitives/Card';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { colors } from '@/lib/design-tokens/colors';

interface WeatherStripProps {
  report: reports.ReportBody;
  onEdit?: () => void;
  editActionsDisabled?: boolean;
}

export function WeatherStrip({
  report,
  onEdit,
  editActionsDisabled = false,
}: WeatherStripProps) {
  const weather = report.weather;
  if (!weather && !onEdit) return null;

  const items = weather
    ? ([
        weather.condition ? { icon: Cloud, text: weather.condition } : null,
        weather.temperature ? { icon: Thermometer, text: weather.temperature } : null,
        weather.wind ? { icon: Wind, text: weather.wind } : null,
      ].filter(Boolean) as Array<{ icon: typeof Cloud; text: string }>)
    : [];

  if (items.length === 0 && !onEdit) return null;

  const [first, ...rest] = items;

  return (
    <Card variant="default" padding="md" className="gap-3">
      {onEdit ? (
        <View className="flex-row items-center justify-end">
          <EditPencilButton
            onPress={() => {
              if (editActionsDisabled) return;
              onEdit();
            }}
            disabled={editActionsDisabled}
            accessibilityLabel="Edit weather"
            testID="btn-edit-weather"
          />
        </View>
      ) : null}
      {first ? (
        (() => {
          const CondIcon = first.icon;
          return (
            <View className="flex-row items-start gap-1.5">
              <CondIcon size={14} color={colors.muted.foreground} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-sm font-medium text-foreground">{first.text}</Text>
            </View>
          );
        })()
      ) : (
        <Text className="text-sm text-muted-foreground">No weather recorded yet.</Text>
      )}
      {rest.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <View
                key={item.text}
                className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2"
              >
                <Icon size={14} color={colors.muted.foreground} />
                <Text className="text-sm font-medium text-foreground">{item.text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {weather?.impact ? (
        <Text className="text-sm text-muted-foreground">Impact: {weather.impact}</Text>
      ) : null}
    </Card>
  );
}
