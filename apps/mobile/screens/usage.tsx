/**
 * Usage screen body — props-only, no API coupling.
 *
 * Ported from `../haru3-reports/apps/mobile/app/usage.tsx` on branch
 * `dev`. v3 used Supabase token-usage rollups (input/output/cached
 * tokens, per-event breakdown, per-model aggregation); v4's
 * `/me/usage` returns `{ months: [{ month, reports, voiceNotes }],
 * totals: { reports, voiceNotes } }` — so the per-event timeline and
 * per-model breakdown are deferred to P4. The pricing reference card
 * is ported as static copy (unchanged from canonical).
 *
 * Monthly rows are expandable in-place. The optional `chart` slot
 * lets the route pass a real `UsageBarChart` once we have token-level
 * history; today the dev mirror passes a placeholder and the route
 * passes `null`.
 */
import { useState } from 'react';
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
  DollarSign,
  Zap,
} from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { StatTile } from '@/components/primitives/StatTile';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { UsageBarChart } from '@/components/ui/UsageBarChart';
import { colors } from '@/lib/design-tokens/colors';

export interface UsagePerModelRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageMonthlyRow {
  /** ISO month string (e.g. `2024-11` or `2024-11-01T00:00:00.000Z`). */
  month: string;
  reportsCount: number;
  voiceNotesCount: number;
  // TODO(P3.15.4-contract): drop these local fields once `/me/usage`
  // ships token columns and the generated api-contract types include them.
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  perModel?: ReadonlyArray<UsagePerModelRow>;
}

export interface UsageTotals {
  reports: number;
  voiceNotes: number;
  // TODO(P3.15.4-contract): drop once /me/usage ships token columns.
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

export interface UsageScreenProps {
  history: ReadonlyArray<UsageMonthlyRow> | null;
  totals: UsageTotals;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}

function parseMonth(iso: string): Date {
  // Accept both `YYYY-MM` and full ISO.
  return /^\d{4}-\d{2}$/.test(iso) ? new Date(`${iso}-01T00:00:00.000Z`) : new Date(iso);
}

function formatMonth(iso: string) {
  const d = parseMonth(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
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
  const hasTokens = (row.inputTokens ?? 0) + (row.outputTokens ?? 0) > 0;

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
        <View className="gap-3">
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
            {hasTokens ? (
              <>
                <StatTile
                  value={formatTokens(row.inputTokens ?? 0)}
                  label="Input Tokens"
                  compact
                  className="min-w-[46%]"
                />
                <StatTile
                  value={formatTokens(row.outputTokens ?? 0)}
                  label="Output Tokens"
                  compact
                  className="min-w-[46%]"
                />
              </>
            ) : null}
          </View>

          {row.perModel?.length ? (
            <View
              className="gap-2 rounded-md border border-border bg-background/40 p-3"
              testID={`usage-month-${row.month}-per-model`}
            >
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                Per model
              </Text>
              {row.perModel.map((m) => (
                <View
                  key={m.model}
                  className="flex-row items-center justify-between"
                >
                  <Text className="flex-1 text-sm text-foreground">
                    {m.model}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

function PricingRow({
  provider,
  model,
  input,
  output,
}: {
  provider: string;
  model: string;
  input: string;
  output: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{model}</Text>
        <Text className="text-xs text-muted-foreground">{provider}</Text>
      </View>
      <View className="flex-row gap-4">
        <View className="items-end">
          <Text className="text-sm text-foreground">{input}</Text>
          <Text className="text-xs text-muted-foreground">in</Text>
        </View>
        <View className="items-end">
          <Text className="text-sm text-foreground">{output}</Text>
          <Text className="text-xs text-muted-foreground">out</Text>
        </View>
      </View>
    </View>
  );
}

export function Usage({
  history,
  totals,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
}: UsageScreenProps) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const handleToggle = (month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  };

  const tokenChartData = (history ?? []).map((row) => ({
    label: formatMonth(row.month).split(' ')[0]!.slice(0, 3),
    value: (row.inputTokens ?? 0) + (row.outputTokens ?? 0),
  }));
  const showTokenChart =
    (history?.length ?? 0) > 1 && tokenChartData.some((d) => d.value > 0);

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
          <View className="flex-1 items-center justify-center px-5" testID="usage-empty">
            <InlineNotice tone="info">
              No usage data yet. Generate your first report to see stats here.
            </InlineNotice>
          </View>
        ) : (
          <View className="flex-1">
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
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
              </View>

              {/* Token usage over time. Renders when ≥2 months and
                  token data is present. TODO(P3.15.4-contract): drive
                  visibility off generated types once tokens land. */}
              {showTokenChart && (
                <>
                  <SectionHeader
                    title="Usage Over Time"
                    icon={<BarChart3 size={18} color={colors.foreground} />}
                  />
                  <Card className="items-center py-5" testID="usage-token-chart">
                    <UsageBarChart
                      data={tokenChartData}
                      unit="tokens"
                      testID="usage-token-chart-svg"
                    />
                  </Card>
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

              {/* Pricing reference */}
              <SectionHeader
                title="Token Pricing Reference"
                subtitle="Cost per 1M tokens (USD)"
                icon={<DollarSign size={18} color={colors.foreground} />}
              />
              <Card className="gap-3">
                <PricingRow provider="OpenAI" model="GPT-4o Mini" input="$0.15" output="$0.60" />
                <PricingRow provider="OpenAI" model="GPT-4o" input="$2.50" output="$10.00" />
                <PricingRow provider="Anthropic" model="Claude Sonnet" input="$3.00" output="$15.00" />
                <PricingRow provider="Anthropic" model="Claude Haiku" input="$0.25" output="$1.25" />
                <PricingRow provider="Google" model="Gemini 2.0 Flash" input="$0.10" output="$0.40" />
                <PricingRow provider="Kimi" model="Moonshot" input="$0.14" output="$0.28" />
                <PricingRow provider="Kimi" model="K2" input="$0.55" output="$2.19" />
                <PricingRow provider="DeepSeek" model="DeepSeek-V3" input="$0.27" output="$1.10" />
                <PricingRow provider="DeepSeek" model="DeepSeek-R1" input="$0.55" output="$2.19" />
                <PricingRow provider="Z.AI" model="GLM-4.6" input="$1.40" output="$1.40" />
              </Card>
              <InlineNotice tone="info">
                Prices are approximate and may change. Check each provider&apos;s site for current rates.
              </InlineNotice>
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
