/**
 * `UsageBarChart` — token-usage bar chart.
 *
 * Ported from `../haru3-reports/apps/mobile/components/ui/UsageBarChart.tsx`
 * on branch `dev`. Renders up to 6 months of usage as `react-native-svg`
 * rounded-rect bars with a dashed grid and a label row beneath. Bars
 * with `value === 0` use the muted track colour so empty months stay
 * visible.
 */
import { View, Text } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';

import { colors } from '@/lib/design-tokens/colors';
import { cn } from '@/lib/utils';

export interface BarDatum {
  /** X-axis label (e.g. short month name `Nov`). */
  label: string;
  /** Bar value (any non-negative scalar — tokens, reports, etc.). */
  value: number;
}

export interface UsageBarChartProps {
  data: BarDatum[];
  /** Optional caption rendered under the chart (e.g. unit). */
  unit?: string;
  className?: string;
  testID?: string;
}

const CHART_HEIGHT = 120;
const BAR_RADIUS = 4;

export function UsageBarChart({ data, unit, className, testID }: UsageBarChartProps) {
  if (!data.length) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // Show at most 6 months and reverse so the newest sits on the right
  // (matches canonical and matches the way history arrays come back
  // from `/me/usage` — newest first).
  const visible = data.slice(0, 6).reverse();
  const barCount = visible.length;
  const barGap = 8;
  const barWidth = Math.max(
    16,
    Math.min(36, (280 - barGap * (barCount - 1)) / barCount),
  );
  const chartWidth = barCount * barWidth + (barCount - 1) * barGap;

  return (
    <View className={cn('items-center', className)} testID={testID}>
      <View style={{ width: chartWidth, height: CHART_HEIGHT }}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {[0.25, 0.5, 0.75].map((frac) => (
            <Line
              key={frac}
              x1={0}
              y1={CHART_HEIGHT * (1 - frac)}
              x2={chartWidth}
              y2={CHART_HEIGHT * (1 - frac)}
              stroke={colors.chart.grid}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {visible.map((d, i) => {
            const barHeight = Math.max(2, (d.value / maxValue) * (CHART_HEIGHT - 4));
            const x = i * (barWidth + barGap);
            const y = CHART_HEIGHT - barHeight;
            return (
              <Rect
                key={`${d.label}-${i}`}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={d.value > 0 ? colors.chart.fill : colors.chart.track}
              />
            );
          })}
        </Svg>
      </View>

      <View
        style={{
          width: chartWidth,
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 6,
        }}
      >
        {visible.map((d, i) => (
          <Text
            key={`${d.label}-label-${i}`}
            style={{ width: barWidth, textAlign: 'center' }}
            className="text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>

      {unit ? (
        <Text className="mt-1 text-xs text-muted-foreground">{unit}</Text>
      ) : null}
    </View>
  );
}
