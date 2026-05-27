/**
 * StatBar — three-stat strip across the top of the rendered report,
 * plus optional location and project-phase metadata rows.
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/StatBar.tsx` on
 * branch `dev`.
 */
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MapPin, Layers } from 'lucide-react-native';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { StatTile } from '@/components/primitives/StatTile';
import { getReportStats } from '@/lib/reports/report-ui';
import { colors } from '@/lib/design-tokens/colors';

const PROJECT_PHASE_LABEL: Record<string, string> = {
  planning: 'Planning',
  foundation: 'Foundation',
  structure: 'Structure',
  envelope: 'Envelope',
  services: 'Services',
  interior: 'Interior',
  finishing: 'Finishing',
  handover: 'Handover',
  other: 'Other',
};

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);
  const { location, projectPhase } = report.report.meta;

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

      {location ? (
        <View className="flex-row items-center gap-2">
          <MapPin size={14} color={colors.muted.foreground} />
          <Text className="text-sm text-muted-foreground">{location}</Text>
        </View>
      ) : null}

      {projectPhase ? (
        <View className="flex-row items-center gap-2">
          <Layers size={14} color={colors.muted.foreground} />
          <Text className="text-sm text-muted-foreground">
            {PROJECT_PHASE_LABEL[projectPhase] ?? projectPhase}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
