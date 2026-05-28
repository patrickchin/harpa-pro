/**
 * StatBar — three-stat strip across the top of the rendered report.
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/StatBar.tsx` on
 * branch `dev`.
 */
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { StatTile } from '@/components/primitives/StatTile';
import { getReportStats } from '@/lib/reports/report-ui';

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="gap-3">
      <View className="flex-row gap-3">
        {stats.map((stat, i) => (
          <StatTile
            key={stat.label}
            value={stat.value}
            label={stat.label}
            tone={stat.tone === 'warning' && i === 2 ? 'warning' : 'default'}
            compact
          />
        ))}
      </View>
    </Animated.View>
  );
}
