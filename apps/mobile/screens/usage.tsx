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
  DollarSign,
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

export interface UsageScreenProps {
  history: ReadonlyArray<UsageMonthlyRow> | null;
  totals: UsageTotals;
  /** Optional per-(vendor,model,operation) breakdown card. */
  byModel?: ReadonlyArray<UsageByModelRow>;
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
          {/* TODO(P4): per-generation event list + per-model breakdown
              once the v4 API exposes token-level usage. */}
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
  byModel,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
  chart,
  limits,
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
              {/* Plan & limits (per-account monthly caps). Renders
                  before the All-Time Summary so users see what they
                  have left at a glance. */}
              {limits ? (
                <UsageLimitsCard plan={limits.plan} buckets={limits.buckets} />
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
