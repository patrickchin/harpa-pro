import { View, Text } from '../lib/primitives.js';
import { VoiceReportSection } from './VoiceReportSection.js';
import { cn } from '../lib/cn.js';
import type { VoiceReportViewProps } from '../types.js';

const SEVERITY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const SEVERITY_BADGE: Record<'low' | 'medium' | 'high', string> = {
  // Tailwind classes resolved by both apps. Tokens map to the same
  // semantic colours; the variant differences come from the apps'
  // theme files (mobile = JS tokens, marketing = CSS @theme).
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-accent/15 text-accent',
  high: 'bg-destructive/15 text-destructive',
};

function formatVisitDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Locale-independent: "12 May 2026". Avoids hydration mismatches
  // between server-rendered and client-rendered Astro builds.
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Renders a full voice-generated site report. Pure presentational —
 * no data fetching, no platform branching. The host app supplies the
 * report payload (live API or fixture).
 *
 * Layout mirrors the canonical `ReportView` from
 * `../haru3-reports/apps/mobile/components/reports/ReportView.tsx`
 * (AGENTS.md hard rule #1) but drops the icon dependency so this
 * package stays free of `react-native-svg`.
 */
export function VoiceReportView({
  report,
  watermark,
  className,
}: VoiceReportViewProps) {
  const visitLabel = formatVisitDate(report.visitDate);
  const issueCount = report.issues.length;
  const workerHeadcount = report.workers.reduce((sum, w) => sum + w.count, 0);

  return (
    <View
      className={cn(
        'relative gap-6 rounded-xl border border-border bg-card p-6',
        className,
      )}
    >
      {watermark ? (
        <View className="absolute right-4 top-4 rounded-md bg-muted px-2 py-1">
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {watermark}
          </Text>
        </View>
      ) : null}

      {/* Header */}
      <View className="gap-1">
        <Text className="text-lg font-bold text-foreground">
          Site report
        </Text>
        {visitLabel ? (
          <Text className="text-sm text-muted-foreground">{visitLabel}</Text>
        ) : null}
      </View>

      {/* StatBar — compact metrics */}
      <View className="flex-row flex-wrap gap-3">
        <StatTile label="Issues" value={String(issueCount)} />
        <StatTile label="Workers" value={String(workerHeadcount)} />
        <StatTile label="Materials" value={String(report.materials.length)} />
        <StatTile label="Next steps" value={String(report.nextSteps.length)} />
      </View>

      {/* Weather strip */}
      {report.weather ? (
        <VoiceReportSection title="Weather">
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            {report.weather.condition ? (
              <Text className="text-sm text-foreground">
                {report.weather.condition}
              </Text>
            ) : null}
            {report.weather.temperatureC != null ? (
              <Text className="text-sm text-muted-foreground">
                {report.weather.temperatureC}°C
              </Text>
            ) : null}
            {report.weather.windKph != null ? (
              <Text className="text-sm text-muted-foreground">
                Wind {report.weather.windKph} km/h
              </Text>
            ) : null}
          </View>
          {report.weather.impact ? (
            <Text className="text-sm leading-relaxed text-muted-foreground">
              {report.weather.impact}
            </Text>
          ) : null}
        </VoiceReportSection>
      ) : null}

      {/* Issues */}
      {report.issues.length > 0 ? (
        <VoiceReportSection title="Issues" meta={`${issueCount} flagged`}>
          <View className="gap-3">
            {report.issues.map((issue, idx) => (
              <View
                key={`${issue.title}-${idx}`}
                className="gap-2 rounded-lg border border-border bg-background p-4"
              >
                <View className="flex-row items-center gap-2">
                  <View
                    className={cn(
                      'rounded-md px-2 py-0.5',
                      SEVERITY_BADGE[issue.severity],
                    )}
                  >
                    <Text
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-widest',
                        SEVERITY_BADGE[issue.severity],
                      )}
                    >
                      {SEVERITY_LABEL[issue.severity]}
                    </Text>
                  </View>
                  <Text className="flex-1 text-base font-semibold text-foreground">
                    {issue.title}
                  </Text>
                </View>
                {issue.description ? (
                  <Text className="text-sm leading-relaxed text-foreground">
                    {issue.description}
                  </Text>
                ) : null}
                {issue.action ? (
                  <Text className="text-sm leading-relaxed text-muted-foreground">
                    <Text className="font-semibold text-foreground">
                      Action.{' '}
                    </Text>
                    {issue.action}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </VoiceReportSection>
      ) : null}

      {/* Workers */}
      {report.workers.length > 0 ? (
        <VoiceReportSection title="Workers" meta={`${workerHeadcount} on site`}>
          <View className="gap-2">
            {report.workers.map((w, idx) => (
              <View
                key={`${w.role}-${idx}`}
                className="flex-row items-baseline justify-between gap-3 border-b border-border/60 pb-2"
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-foreground">
                    {w.role}
                  </Text>
                  {w.notes ? (
                    <Text className="text-xs text-muted-foreground">
                      {w.notes}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-sm tabular-nums text-foreground">
                  {w.count}× · {w.hours != null ? `${w.hours}h` : '—'}
                </Text>
              </View>
            ))}
          </View>
        </VoiceReportSection>
      ) : null}

      {/* Materials */}
      {report.materials.length > 0 ? (
        <VoiceReportSection title="Materials">
          <View className="gap-2">
            {report.materials.map((m, idx) => (
              <View
                key={`${m.name}-${idx}`}
                className="flex-row items-baseline justify-between gap-3 border-b border-border/60 pb-2"
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-foreground">
                    {m.name}
                  </Text>
                  {m.notes ? (
                    <Text className="text-xs text-muted-foreground">
                      {m.notes}
                    </Text>
                  ) : null}
                </View>
                <View className="items-end gap-0.5">
                  {m.quantity != null ? (
                    <Text className="text-sm tabular-nums text-foreground">
                      {m.quantity}
                      {m.unit ? ` ${m.unit}` : ''}
                    </Text>
                  ) : null}
                  {m.status ? (
                    <Text className="text-xs uppercase tracking-widest text-muted-foreground">
                      {m.status}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </VoiceReportSection>
      ) : null}

      {/* Next steps */}
      {report.nextSteps.length > 0 ? (
        <VoiceReportSection title="Next steps">
          <View className="gap-2">
            {report.nextSteps.map((step, idx) => (
              <View key={`${idx}`} className="flex-row gap-3">
                <Text className="w-5 text-sm font-semibold tabular-nums text-accent">
                  {idx + 1}.
                </Text>
                <Text className="flex-1 text-sm leading-relaxed text-foreground">
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </VoiceReportSection>
      ) : null}

      {/* Free-form summary sections */}
      {report.summarySections.length > 0 ? (
        <View className="gap-4">
          {report.summarySections.map((s, idx) => (
            <VoiceReportSection key={`${s.title}-${idx}`} title={s.title}>
              {s.body}
            </VoiceReportSection>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 min-w-[80px] gap-1 rounded-lg border border-border bg-background px-3 py-2">
      <Text className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
      <Text className="text-xl font-bold tabular-nums text-foreground">
        {value}
      </Text>
    </View>
  );
}
