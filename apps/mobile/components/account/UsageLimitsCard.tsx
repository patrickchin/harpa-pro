/**
 * UsageLimitsCard — renders the per-bucket monthly usage state from
 * `GET /me/limits` as a stacked list of labelled progress bars.
 *
 * Props-only: the route fetches `/me/limits` via `useMeLimitsQuery`
 * and passes the buckets in. The component itself does zero API
 * coupling so it's trivial to unit-test and reusable from the Usage
 * screen + (future) Settings screen.
 *
 * Wire shape comes from `@harpa/api-contract usageLimits.limitState`:
 *   { kind, limit: number|null, used, remaining: number|null, resetAt,
 *     plan, overridden }
 *
 * Phase 3 of per-account usage limits — see
 * docs/v4/arch-usage-limits.md §4-§5 and §11.
 */
import { View, Text } from 'react-native';

import { Card } from '@/components/primitives/Card';
import { Button } from '@/components/primitives/Button';

export interface LimitBucket {
  kind:
    | 'report_generate'
    | 'voice_transcribe'
    | 'voice_summarize'
    | 'ai_input_tokens'
    | 'ai_output_tokens';
  /** Cap for the current month; null = unbounded (enterprise / admin override -1). */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** ISO timestamp for the first instant of the next UTC month. */
  resetAt: string;
  plan: 'free' | 'pro' | 'enterprise';
  /** True iff this bucket's value came from `app.user_limit_overrides`. */
  overridden: boolean;
}

export interface UsageLimitsCardProps {
  plan: 'free' | 'pro' | 'enterprise';
  buckets: ReadonlyArray<LimitBucket>;
  onUpgrade?: () => void | Promise<unknown>;
}

const KIND_LABEL: Record<LimitBucket['kind'], string> = {
  report_generate: 'Reports generated',
  voice_transcribe: 'Voice transcriptions',
  voice_summarize: 'Voice summaries',
  ai_input_tokens: 'Weighted AI input',
  ai_output_tokens: 'Weighted AI output',
};

function formatNumber(n: number): string {
  // Avoid Intl in mobile bundles — small custom formatter handles the
  // millions/thousands case used by token rows.
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function pct(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  // Cap at 100 — over-usage (post-hoc token overspend) shouldn't push
  // the bar past full; the next request will 403 anyway.
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatReset(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'next month';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BucketRow({ b }: { b: LimitBucket }) {
  const percent = pct(b.used, b.limit);
  const label = KIND_LABEL[b.kind];
  const usedLabel = b.limit === null
    ? `${formatNumber(b.used)} / unlimited`
    : `${formatNumber(b.used)} / ${formatNumber(b.limit)}`;
  // Bar tint:  default → muted-foreground; ≥80% → danger; overridden → primary.
  const tint =
    b.limit !== null && percent >= 80
      ? 'bg-danger'
      : b.overridden
        ? 'bg-primary'
        : 'bg-foreground';
  return (
    <View testID={`usage-limit-${b.kind}`} className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{usedLabel}</Text>
      </View>
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        {b.limit !== null && (
          <View
            testID={`usage-limit-bar-${b.kind}`}
            className={`h-full ${tint}`}
            style={{ width: `${percent}%` }}
          />
        )}
      </View>
      {b.overridden && (
        <Text className="text-xs text-muted-foreground">
          Custom limit set by support
        </Text>
      )}
    </View>
  );
}

export function UsageLimitsCard({ plan, buckets, onUpgrade }: UsageLimitsCardProps) {
  const first = buckets[0];
  const resetLabel = first ? formatReset(first.resetAt) : null;
  return (
    <Card className="gap-4" testID="usage-limits-card">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-title-sm text-foreground">Plan & limits</Text>
          {resetLabel && (
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Resets {resetLabel}
            </Text>
          )}
        </View>
        <View
          testID="usage-limits-plan"
          className={`rounded-full border px-2 py-0.5 ${plan === 'free' ? 'border-border bg-surface-muted' : 'border-success-border bg-success-soft'}`}
        >
          <Text className={`text-xs font-medium ${plan === 'free' ? 'text-muted-foreground' : 'text-success-text'}`}>
            {plan.toUpperCase()}
          </Text>
        </View>
      </View>
      <View className="gap-3">
        {buckets.map((b) => (
          <BucketRow key={b.kind} b={b} />
        ))}
      </View>
      {plan === 'free' && onUpgrade ? (
        <Button
          testID="btn-upgrade-plan"
          accessibilityLabel="Upgrade to Pro"
          onPress={() => {
            void onUpgrade();
          }}
        >
          Upgrade to Pro
        </Button>
      ) : null}
    </Card>
  );
}
