/**
 * Usage screen body — props-only, no API coupling.
 *
 * Wires the v4 `/me/usage` aggregates (monthly rows + per-(vendor,
 * model,operation) breakdown + totals) and the `/me/usage/events`
 * raw event feed into a single read-only screen.
 *
 * Monthly rows are expandable in-place. The optional `chart` slot
 * lets the route pass a real `UsageBarChart` once we have token-level
 * history; today the dev mirror passes a placeholder and the route
 * passes `null`.
 */
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { StatTile } from '@/components/primitives/StatTile';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { UsageLimitsCard, type LimitBucket } from '@/components/account/UsageLimitsCard';
import { colors } from '@/lib/design-tokens/colors';

export interface UsageMonthlyRow {
  /** ISO month string (e.g. `2024-11` or `2024-11-01T00:00:00.000Z`). */
  month: string;
  reportsCount: number;
  voiceNotesCount: number;
  /** Optional per-month token totals (set when API returns them). */
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  /** Optional per-month transcribed audio seconds. */
  inputSeconds?: number;
  calls?: number;
}

export interface UsageTotals {
  reports: number;
  voiceNotes: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  /** Total transcribed audio seconds across the window. */
  inputSeconds?: number;
  calls?: number;
}

export interface UsageByModelRow {
  vendor: string;
  model: string;
  operation: 'chat' | 'transcribe' | 'generate_report';
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Audio seconds for transcribe rows; 0 otherwise. */
  inputSeconds?: number;
}

/**
 * Single LLM call event for the per-event timeline. Mirrors the
 * `/me/usage/events` row shape, trimmed to the fields the UI shows.
 * `inputSeconds` is non-null only for transcribe rows.
 */
export interface RecentUsageEvent {
  id: string;
  createdAt: string;
  vendor: string;
  model: string;
  operation: 'chat' | 'transcribe' | 'generate_report';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputSeconds: number | null;
  status: 'ok' | 'error';
}

export interface UsageScreenProps {
  history: ReadonlyArray<UsageMonthlyRow> | null;
  totals: UsageTotals;
  /** Optional per-(vendor,model,operation) breakdown card. */
  byModel?: ReadonlyArray<UsageByModelRow>;
  /**
   * Optional newest-first feed of individual LLM calls
   * (`/me/usage/events`). Renders as a "Recent Activity" card when
   * non-empty. Includes `status='error'` rows so failed calls show up.
   */
  recentEvents?: ReadonlyArray<RecentUsageEvent>;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  /** Optional chart slot (e.g. `<UsageBarChart … />`). Renders only
   * when at least 2 months are present. Set null/undefined to hide. */
  chart?: ReactNode;
  /** Optional plan + per-bucket monthly limits surfaced by the
   * `/me/limits` endpoint. When provided, a UsageLimitsCard renders
   * above the All-Time Summary. */
  limits?: {
    plan: 'free' | 'pro' | 'enterprise';
    buckets: ReadonlyArray<LimitBucket>;
  };
  onUpgrade?: () => void | Promise<void>;
}

function parseMonth(iso: string): Date {
  // Accept both `YYYY-MM` and full ISO.
  return /^\d{4}-\d{2}$/.test(iso) ? new Date(`${iso}-01T00:00:00.000Z`) : new Date(iso);
}

function formatMonth(iso: string) {
  const d = parseMonth(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Render seconds as `Hh Mm`, `Mm Ss`, or `Ns` for short clips. */
function formatSeconds(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '0s';
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function MonthCard({
  row,
  isExpanded,
  onToggle,
}: {
  row: UsageMonthlyRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = isExpanded ? ChevronUp : ChevronDown;
  const reportsLabel = `${row.reportsCount} report${row.reportsCount !== 1 ? 's' : ''}`;
  const voiceLabel = `${row.voiceNotesCount} voice note${row.voiceNotesCount !== 1 ? 's' : ''}`;

  return (
    <Card className="gap-3">
      <Pressable
        testID={`usage-month-${row.month}`}
        onPress={onToggle}
        className="flex-row items-center justify-between"
        accessibilityRole="button"
        accessibilityLabel={`${formatMonth(row.month)}, ${isExpanded ? 'collapse' : 'expand'}`}
      >
        <View className="flex-1">
          <Text className="text-title-sm text-foreground">{formatMonth(row.month)}</Text>
          <Text className="mt-0.5 text-sm text-muted-foreground">
            {reportsLabel} · {voiceLabel}
          </Text>
        </View>
        <Chevron size={18} color={colors.muted.foreground} />
      </Pressable>

      {isExpanded && (
        <View>
          <View className="flex-row flex-wrap gap-3">
            <StatTile
              value={row.reportsCount}
              label="Reports"
              compact
              className="min-w-[46%]"
            />
            <StatTile
              value={row.voiceNotesCount}
              label="Voice Notes"
              compact
              className="min-w-[46%]"
            />
          </View>
        </View>
      )}
    </Card>
  );
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RecentEventRow({ event }: { event: RecentUsageEvent }) {
  const isTranscribe = event.operation === 'transcribe';
  const isError = event.status === 'error';
  const right = isTranscribe
    ? formatSeconds(event.inputSeconds ?? 0)
    : `${event.inputTokens + event.outputTokens}`;
  const rightLabel = isTranscribe ? 'audio' : 'tokens';
  return (
    <View
      className="flex-row items-center justify-between"
      testID={`usage-event-${event.id}`}
    >
      <View className="flex-1 gap-0.5 pr-3">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {event.model}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {event.vendor} · {event.operation} · {formatEventTime(event.createdAt)}
          {isError ? ' · failed' : ''}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={`text-sm ${isError ? 'text-destructive' : 'text-foreground'}`}
        >
          {right}
        </Text>
        <Text className="text-xs text-muted-foreground">{rightLabel}</Text>
      </View>
    </View>
  );
}

export function Usage({
  history,
  totals,
  byModel,
  recentEvents,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
  chart,
  limits,
  onUpgrade,
}: UsageScreenProps) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const handleToggle = (month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} testID="screen-usage">
      <View className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader
            title="Usage History"
            onBack={onBack}
            backLabel="Profile"
          />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center" testID="usage-loading">
            <ActivityIndicator size="large" color={colors.foreground} />
          </View>
        ) : !history?.length ? (
          limits ? (
            <View className="flex-1">
              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                <UsageLimitsCard plan={limits.plan} buckets={limits.buckets} onUpgrade={onUpgrade} />
                <View testID="usage-empty">
                  <InlineNotice
                    tone="info"
                    title="No usage data yet"
                  >
                    Generate your first report to see stats here.
                  </InlineNotice>
                </View>
              </ScrollView>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center px-5" testID="usage-empty">
              <InlineNotice
                tone="info"
                title="No usage data yet"
              >
                Generate your first report to see stats here.
              </InlineNotice>
            </View>
          )
        ) : (
          <View className="flex-1">
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
              {/* Plan & limits (per-account monthly caps). Renders
                  before the All-Time Summary so users see what they
                  have left at a glance. */}
              {limits ? (
                <UsageLimitsCard plan={limits.plan} buckets={limits.buckets} onUpgrade={onUpgrade} />
              ) : null}

              {/* All-time summary */}
              <SectionHeader
                title="All-Time Summary"
                icon={<Zap size={18} color={colors.foreground} />}
              />
              <View className="flex-row flex-wrap gap-3">
                <StatTile
                  value={totals.reports}
                  label="Reports"
                  compact
                  className="min-w-[46%]"
                />
                <StatTile
                  value={totals.voiceNotes}
                  label="Voice Notes"
                  compact
                  className="min-w-[46%]"
                />
                {(totals.calls ?? 0) > 0 && (
                  <>
                    <StatTile
                      value={totals.calls ?? 0}
                      label="AI Calls"
                      compact
                      className="min-w-[46%]"
                    />
                    <StatTile
                      value={(totals.inputTokens ?? 0) + (totals.outputTokens ?? 0)}
                      label="Tokens"
                      compact
                      className="min-w-[46%]"
                    />
                  </>
                )}
                {(totals.inputSeconds ?? 0) > 0 && (
                  <StatTile
                    value={formatSeconds(totals.inputSeconds ?? 0)}
                    label="Audio transcribed"
                    compact
                    className="min-w-[46%]"
                  />
                )}
              </View>

              {byModel && byModel.length > 0 && (
                <>
                  <SectionHeader title="Per-model Usage" />
                  <Card className="gap-3" testID="usage-by-model">
                    {byModel.map((row) => (
                      <View
                        key={`${row.vendor}-${row.model}-${row.operation}`}
                        className="flex-row items-center justify-between"
                        testID={`usage-by-model-${row.vendor}-${row.model}-${row.operation}`}
                      >
                        <View className="flex-1 gap-0.5">
                          <Text className="text-sm font-medium text-foreground">{row.model}</Text>
                          <Text className="text-xs text-muted-foreground">
                            {row.vendor} · {row.operation}
                          </Text>
                        </View>
                        <View className="flex-row gap-4">
                          <View className="items-end">
                            <Text className="text-sm text-foreground">{row.calls}</Text>
                            <Text className="text-xs text-muted-foreground">calls</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-sm text-foreground">
                              {row.inputTokens + row.outputTokens}
                            </Text>
                            <Text className="text-xs text-muted-foreground">tokens</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </Card>
                </>
              )}

              {recentEvents && recentEvents.length > 0 && (
                <>
                  <SectionHeader
                    title="Recent Activity"
                    subtitle="Latest LLM calls (newest first)"
                  />
                  <Card className="gap-3" testID="usage-recent-events">
                    {recentEvents.map((e) => (
                      <RecentEventRow key={e.id} event={e} />
                    ))}
                  </Card>
                </>
              )}

              {/* Timeline chart (slot) */}
              {chart && history.length > 1 && (
                <>
                  <SectionHeader
                    title="Usage Over Time"
                    icon={<BarChart3 size={18} color={colors.foreground} />}
                  />
                  <Card className="items-center py-5">{chart}</Card>
                </>
              )}

              {/* Monthly breakdown */}
              <SectionHeader
                title="Monthly Breakdown"
                subtitle="Tap a month to see details"
              />
              {history.map((row) => (
                <View key={row.month}>
                  <MonthCard
                    row={row}
                    isExpanded={expandedMonth === row.month}
                    onToggle={() => handleToggle(row.month)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
