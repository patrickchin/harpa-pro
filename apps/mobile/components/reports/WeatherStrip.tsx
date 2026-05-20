/**
 * WeatherStrip — compact weather summary card. Ported from
 * `../haru3-reports/apps/mobile/components/reports/WeatherStrip.tsx`
 * on branch `dev`. Returns null when no weather data is present, so
 * `ReportView` can mount it unconditionally.
 */
import { View, Text } from 'react-native';
import { Cloud, Thermometer, Wind } from 'lucide-react-native';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { colors } from '@/lib/design-tokens/colors';

interface WeatherStripProps {
  report: GeneratedSiteReport;
}

export function WeatherStrip({ report }: WeatherStripProps) {
  const weather = report.report.weather;
  if (!weather) return null;

  const items = [
    weather.conditions ? { icon: Cloud, text: weather.conditions } : null,
    weather.temperature
      ? { icon: Thermometer, text: weather.temperature }
      : null,
    weather.wind ? { icon: Wind, text: weather.wind } : null,
  ].filter(Boolean) as Array<{ icon: typeof Cloud; text: string }>;

  if (items.length === 0) return null;

  const [first, ...rest] = items;

  return (
    <Card variant="default" padding="md" className="gap-3">
      {first
        ? (() => {
            const CondIcon = first.icon;
            return (
              <View className="flex-row items-start gap-1.5">
                <CondIcon
                  size={14}
                  color={colors.muted.foreground}
                  style={{ marginTop: 2 }}
                />
                <Text className="flex-1 text-sm font-medium text-foreground">
                  {first.text}
                </Text>
              </View>
            );
          })()
        : null}
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
                <Text className="text-sm font-medium text-foreground">
                  {item.text}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {weather.impact ? (
        <Text className="text-sm text-muted-foreground">
          Impact: {weather.impact}
        </Text>
      ) : null}
    </Card>
  );
}
