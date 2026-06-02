/**
 * Per-account usage limits — enforcement service.
 *
 * Single source-of-truth for "is this user over their monthly cap?".
 * Called from gated route handlers BEFORE the costly side-effect.
 *
 * Design + alternatives considered: docs/v4/arch-usage-limits.md.
 *
 * Counts are computed live from `app.llm_usage_events` (the same table
 * that powers `GET /me/usage`) so there is no second source-of-truth
 * to drift (Pitfall 8). The hot path is two queries per check:
 *   1. SELECT plan + override row (one cheap PK + indexed lookup).
 *   2. count/sum over llm_usage_events for the current calendar month
 *      (partial index `llm_usage_events_user_status_created_idx`).
 *
 * Pitfall 13: this module is NOT behind a DI factory. The default
 * wiring is the function itself; the route-level integration test
 * exercises it without any stubs.
 */
import { sql } from 'drizzle-orm';
import type { ScopedDb } from '../db/scope.js';
import type { z } from 'zod';
import { usageLimits } from '@harpa/api-contract';
import { rawDb } from '../db/client.js';

export type LimitKind = z.infer<typeof usageLimits.limitKind>;
export type LimitState = z.infer<typeof usageLimits.limitState>;
export type Plan = z.infer<typeof usageLimits.plan>;

/** Effective in-memory limit values. `Infinity` = unbounded. */
export interface PlanLimits {
  report_generate: number;
  voice_transcribe: number;
  voice_summarize: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
}

/**
 * Per-plan caps. Still placeholders pending GA pricing input, but
 * raised on 2026-05-24 from the original draft values — the original
 * 200k input-token cap was burning out after one or two reports
 * because a single generate easily uses 50-200k input tokens
 * (system prompt + notes + few-shot examples). Token caps now scale
 * roughly with the count caps so reaching the count cap is the
 * binding constraint, not the token cap.
 *
 * `Number.POSITIVE_INFINITY` is the explicit unbounded marker; the
 * wire serialiser (`toWire`) maps it to `null`.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    report_generate: 1_000,
    voice_transcribe: 1_000,
    voice_summarize: 1_000,
    ai_input_tokens: 200_000_000,
    ai_output_tokens: 50_000_000,
  },
  pro: {
    report_generate: 10_000,
    voice_transcribe: 10_000,
    voice_summarize: 10_000,
    ai_input_tokens: 2_000_000_000,
    ai_output_tokens: 500_000_000,
  },
  enterprise: {
    report_generate: Number.POSITIVE_INFINITY,
    voice_transcribe: Number.POSITIVE_INFINITY,
    voice_summarize: Number.POSITIVE_INFINITY,
    ai_input_tokens: Number.POSITIVE_INFINITY,
    ai_output_tokens: Number.POSITIVE_INFINITY,
  },
};

export const LIMIT_KINDS: readonly LimitKind[] = [
  'report_generate',
  'voice_transcribe',
  'voice_summarize',
  'ai_input_tokens',
  'ai_output_tokens',
] as const;

export const COUNT_BUCKETS: ReadonlySet<LimitKind> = new Set([
  'report_generate',
  'voice_transcribe',
  'voice_summarize',
]);

export const TOKEN_BUCKETS: ReadonlySet<LimitKind> = new Set([
  'ai_input_tokens',
  'ai_output_tokens',
]);

/**
 * Threshold at which the `X-Usage-Warning: near-limit; …` header
 * fires. Tracks docs/v4/arch-usage-limits.md §4.2 ("80% used").
 */
export const NEAR_LIMIT_THRESHOLD = 0.8;

export interface LimitCheck {
  kind: LimitKind;
  /** Amount to be consumed by this call. Defaults to 1 for count buckets. */
  amount?: number;
}

export class UsageLimitExceededError extends Error {
  readonly code = 'usage_limit_exceeded';
  readonly state: LimitState;
  constructor(state: LimitState) {
    super(`Usage limit exceeded for ${state.kind}`);
    this.name = 'UsageLimitExceededError';
    this.state = state;
  }
}

interface OverrideRow {
  report_generate: number | null;
  voice_transcribe: number | null;
  voice_summarize: number | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  expires_at: Date | null;
}

/**
 * First instant of the next UTC calendar month — the "reset" boundary
 * surfaced to clients. Exposed for tests.
 */
export function nextMonthResetAt(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
}

/** First instant of the current UTC calendar month. */
export function currentMonthStart(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
}

/**
 * Merge plan defaults + override row. NULL columns fall through to
 * the plan; -1 means explicit unbounded; positive numbers replace.
 *
 * Returns a `{ limits, overridden }` pair where `overridden[kind]` is
 * true iff the override row carried a non-null value for that bucket.
 */
export function mergeLimits(
  plan: Plan,
  row: OverrideRow | null,
  now: Date = new Date(),
): { limits: PlanLimits; overridden: OverriddenFlags } {
  const base = PLAN_LIMITS[plan];
  if (!base) {
    throw new Error(`[usage-limits] unknown plan: ${plan}`);
  }
  // Expired override behaves as if absent — admins set expires_at to
  // cap a "this month only" bump without a follow-up DELETE.
  const active =
    row && (row.expires_at === null || row.expires_at.getTime() > now.getTime())
      ? row
      : null;
  const pickLimit = (override: number | null, fallback: number): number => {
    if (override === null) return fallback;
    return override === -1 ? Number.POSITIVE_INFINITY : override;
  };
  const isSet = (v: number | null | undefined): boolean => v !== null && v !== undefined;
  const overridden: OverriddenFlags = {
    report_generate: active ? isSet(active.report_generate) : false,
    voice_transcribe: active ? isSet(active.voice_transcribe) : false,
    voice_summarize: active ? isSet(active.voice_summarize) : false,
    ai_input_tokens: active ? isSet(active.ai_input_tokens) : false,
    ai_output_tokens: active ? isSet(active.ai_output_tokens) : false,
  };
  const limits: PlanLimits = {
    report_generate: active
      ? pickLimit(active.report_generate, base.report_generate)
      : base.report_generate,
    voice_transcribe: active
      ? pickLimit(active.voice_transcribe, base.voice_transcribe)
      : base.voice_transcribe,
    voice_summarize: active
      ? pickLimit(active.voice_summarize, base.voice_summarize)
      : base.voice_summarize,
    ai_input_tokens: active
      ? pickLimit(active.ai_input_tokens, base.ai_input_tokens)
      : base.ai_input_tokens,
    ai_output_tokens: active
      ? pickLimit(active.ai_output_tokens, base.ai_output_tokens)
      : base.ai_output_tokens,
  };
  return { limits, overridden };
}

/** Translate `Infinity` → wire-safe `null`. */
function toWireLimit(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function toWireRemaining(limit: number, used: number): number | null {
  if (!Number.isFinite(limit)) return null;
  return Math.max(0, limit - used);
}

/**
 * Pluck a per-bucket value via explicit switch — works around
 * TS noUncheckedIndexedAccess + structural-vs-keyof divergence
 * between LimitKind and `keyof PlanLimits`.
 */
interface OverriddenFlags {
  report_generate: boolean;
  voice_transcribe: boolean;
  voice_summarize: boolean;
  ai_input_tokens: boolean;
  ai_output_tokens: boolean;
}

function assertUnreachable(x: never): never {
  throw new Error(`[usage-limits] unexpected limit kind: ${String(x)}`);
}

function planLimitValue(limits: PlanLimits, kind: LimitKind): number {
  switch (kind) {
    case 'report_generate':
      return limits.report_generate;
    case 'voice_transcribe':
      return limits.voice_transcribe;
    case 'voice_summarize':
      return limits.voice_summarize;
    case 'ai_input_tokens':
      return limits.ai_input_tokens;
    case 'ai_output_tokens':
      return limits.ai_output_tokens;
    default:
      return assertUnreachable(kind);
  }
}

function usageValue(counts: UsageCounts, kind: LimitKind): number {
  switch (kind) {
    case 'report_generate':
      return counts.report_generate;
    case 'voice_transcribe':
      return counts.voice_transcribe;
    case 'voice_summarize':
      return counts.voice_summarize;
    case 'ai_input_tokens':
      return counts.ai_input_tokens;
    case 'ai_output_tokens':
      return counts.ai_output_tokens;
    default:
      return assertUnreachable(kind);
  }
}

function overriddenValue(flags: OverriddenFlags, kind: LimitKind): boolean {
  switch (kind) {
    case 'report_generate':
      return flags.report_generate;
    case 'voice_transcribe':
      return flags.voice_transcribe;
    case 'voice_summarize':
      return flags.voice_summarize;
    case 'ai_input_tokens':
      return flags.ai_input_tokens;
    case 'ai_output_tokens':
      return flags.ai_output_tokens;
    default:
      return assertUnreachable(kind);
  }
}

export interface EffectiveLimits {
  plan: Plan;
  buckets: LimitState[];
}

/**
 * Load `auth.users.plan` + any `app.user_limit_overrides` row + the
 * current-month used counts/sums for every bucket. Returns the wire
 * shape for `/me/limits` + the `limits` extension of `/me/usage`.
 *
 * Runs against the scoped DB so RLS pins reads to the caller. The
 * `auth.users.plan` column is readable via the existing
 * `users_self_select` policy. The override row read uses the new
 * `user_limit_overrides_self_select` policy.
 */
export async function getEffectiveLimits(
  db: ScopedDb,
  userId: string,
  now: Date = new Date(),
): Promise<EffectiveLimits> {
  const { plan, overrideRow } = await loadPlanAndOverride(db, userId);
  const { limits, overridden } = mergeLimits(plan, overrideRow, now);
  const usage = await loadMonthUsage(db, userId, now);
  const resetAt = nextMonthResetAt(now).toISOString();
  const mk = (kind: LimitKind, limit: number, used: number): LimitState => ({
    kind,
    limit: toWireLimit(limit),
    used,
    remaining: toWireRemaining(limit, used),
    resetAt,
    plan,
    overridden: overridden[kind],
  });
  const buckets: LimitState[] = [
    mk('report_generate', limits.report_generate, usage.report_generate),
    mk('voice_transcribe', limits.voice_transcribe, usage.voice_transcribe),
    mk('voice_summarize', limits.voice_summarize, usage.voice_summarize),
    mk('ai_input_tokens', limits.ai_input_tokens, usage.ai_input_tokens),
    mk('ai_output_tokens', limits.ai_output_tokens, usage.ai_output_tokens),
  ];
  return { plan, buckets };
}

/**
 * Throw `UsageLimitExceededError` if the requested side-effect would
 * push `used` past `limit`. Returns the post-check state for callers
 * that want to populate response headers (e.g. `X-Usage-Warning`).
 *
 * Only **count buckets** (`report_generate`, `voice_transcribe`,
 * `voice_summarize`) are enforced pre-hoc — those are the gateable
 * units of work the route knows about up-front. Token buckets are
 * meaningful only post-hoc (we can't know the response length in
 * advance) and are checked at the `services/ai.ts` chokepoint after
 * the row is written. See docs/v4/arch-usage-limits.md §4.1.
 */
export async function enforceUsageLimit(
  db: ScopedDb,
  userId: string,
  check: LimitCheck,
  now: Date = new Date(),
): Promise<LimitState> {
  if (!COUNT_BUCKETS.has(check.kind)) {
    throw new Error(
      `[usage-limits] enforceUsageLimit is for count buckets only; got ${check.kind}. Token buckets are enforced in services/ai.ts.`,
    );
  }
  const amount = check.amount ?? 1;
  if (amount < 1) {
    throw new Error(`[usage-limits] amount must be >= 1 (got ${amount}).`);
  }
  const { plan, overrideRow } = await loadPlanAndOverride(db, userId);
  const { limits, overridden } = mergeLimits(plan, overrideRow, now);
  const usage = await loadMonthUsage(db, userId, now);
  const limit = planLimitValue(limits, check.kind);
  const used = usageValue(usage, check.kind);
  const isOverridden = overriddenValue(overridden, check.kind);
  const resetAt = nextMonthResetAt(now).toISOString();
  const state: LimitState = {
    kind: check.kind,
    limit: toWireLimit(limit),
    used,
    remaining: toWireRemaining(limit, used),
    resetAt,
    plan,
    overridden: isOverridden,
  };
  if (Number.isFinite(limit) && used + amount > limit) {
    throw new UsageLimitExceededError(state);
  }
  return state;
}

/**
 * Phase 2 — token bucket pre-hoc check.
 *
 * Token spend isn't knowable until the provider responds, so we can't
 * gate the *cost* of a single call. What we CAN gate is: "this user
 * is already over their monthly token cap, refuse further calls until
 * the next reset". Called from inside `services/ai.ts::withUsageAccounting`
 * BEFORE the provider call; the previous call's `recordLlmUsage`
 * write has already moved `used` past `limit`, so this call trips.
 *
 * Design rationale: docs/v4/arch-usage-limits.md §4.1 "we already paid
 * the provider — you can't refund a token. The current call already
 * happened and is billed; the **next** call from this user is the one
 * that fails." That's exactly what this function implements.
 *
 * Throws `UsageLimitExceededError` for the *first* exceeded bucket
 * (input checked before output to keep behaviour deterministic).
 * Returns the post-check state of both token buckets so the caller
 * can render a near-limit header without a second round-trip.
 */
export async function enforceTokenLimits(
  db: ScopedDb,
  userId: string,
  now: Date = new Date(),
): Promise<{ inputState: LimitState; outputState: LimitState }> {
  const { plan, overrideRow } = await loadPlanAndOverride(db, userId);
  const { limits, overridden } = mergeLimits(plan, overrideRow, now);
  const usage = await loadMonthUsage(db, userId, now);
  const resetAt = nextMonthResetAt(now).toISOString();
  const mk = (kind: 'ai_input_tokens' | 'ai_output_tokens'): LimitState => {
    const limit = planLimitValue(limits, kind);
    const used = usageValue(usage, kind);
    return {
      kind,
      limit: toWireLimit(limit),
      used,
      remaining: toWireRemaining(limit, used),
      resetAt,
      plan,
      overridden: overriddenValue(overridden, kind),
    };
  };
  const inputState = mk('ai_input_tokens');
  const outputState = mk('ai_output_tokens');
  // Strictly `used >= limit`: any further call would record more
  // tokens, so the post-condition `used > limit` is unavoidable.
  // No `amount` parameter — see function-level comment.
  const inputLimit = planLimitValue(limits, 'ai_input_tokens');
  if (Number.isFinite(inputLimit) && inputState.used >= inputLimit) {
    throw new UsageLimitExceededError(inputState);
  }
  const outputLimit = planLimitValue(limits, 'ai_output_tokens');
  if (Number.isFinite(outputLimit) && outputState.used >= outputLimit) {
    throw new UsageLimitExceededError(outputState);
  }
  return { inputState, outputState };
}

/**
 * Render the `X-Usage-Warning` header value for a list of buckets, or
 * return `null` if none are ≥ 80% utilised.
 *
 * Format: `near-limit; bucket=<kind>; pct=<int 0-100>` — chooses the
 * single highest-utilisation bucket so mobile only needs to parse one
 * tuple. Unbounded buckets (limit=null) are skipped.
 *
 * Wire shape pinned by docs/v4/arch-usage-limits.md §4.2.
 */
export function nearLimitWarning(states: readonly LimitState[]): string | null {
  let best: { kind: LimitKind; pct: number } | null = null;
  for (const s of states) {
    if (s.limit === null || s.limit <= 0) continue;
    const pct = s.used / s.limit;
    if (pct < NEAR_LIMIT_THRESHOLD) continue;
    if (!best || pct > best.pct) {
      best = { kind: s.kind, pct };
    }
  }
  if (!best) return null;
  // Cap at 100 — over-usage (post-hoc token over-spend) shouldn't
  // leak >100% into the header; the next call's enforceTokenLimits
  // will 403 anyway.
  const pctInt = Math.min(100, Math.round(best.pct * 100));
  return `near-limit; bucket=${best.kind}; pct=${pctInt}`;
}

/**
 * Helper for route handlers: after AI work succeeds, attach the
 * near-limit header (if any). Best-effort — accounting failures must
 * never bubble (Pitfall 13 style — usage telemetry never blocks the
 * happy path), so we swallow errors and log instead. Returns the
 * warning string for tests.
 */
export async function attachUsageWarning(
  db: ScopedDb,
  userId: string,
  setHeader: (name: string, value: string) => void,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const { buckets } = await getEffectiveLimits(db, userId, now);
    const warning = nearLimitWarning(buckets);
    if (warning) setHeader('X-Usage-Warning', warning);
    return warning;
  } catch (err) {
    console.error('[usage-limits] attachUsageWarning failed', err);
    return null;
  }
}

/**
 * Internal: load plan + override row for one user. Uses two queries
 * against the scoped DB — RLS pins both to the caller. Override row
 * is optional (returns null if absent).
 */
async function loadPlanAndOverride(
  db: ScopedDb,
  userId: string,
): Promise<{ plan: Plan; overrideRow: OverrideRow | null }> {
  const planRes = await db.execute<{ plan: Plan }>(sql`
    SELECT plan FROM "user" WHERE id = ${userId} LIMIT 1
  `);
  const planRow = planRes.rows[0];
  if (!planRow) {
    throw new Error(`[usage-limits] user ${userId} not found`);
  }
  const overrideRes = await db.execute<{
    report_generate: number | null;
    voice_transcribe: number | null;
    voice_summarize: number | null;
    ai_input_tokens: string | null;
    ai_output_tokens: string | null;
    expires_at: Date | null;
  }>(sql`
    SELECT report_generate, voice_transcribe, voice_summarize,
           ai_input_tokens, ai_output_tokens, expires_at
    FROM app.user_limit_overrides
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  const row = overrideRes.rows[0] ?? null;
  const overrideRow: OverrideRow | null = row
    ? {
        report_generate: row.report_generate,
        voice_transcribe: row.voice_transcribe,
        voice_summarize: row.voice_summarize,
        // bigint columns come back as strings via node-postgres; coerce.
        ai_input_tokens: row.ai_input_tokens === null ? null : Number(row.ai_input_tokens),
        ai_output_tokens: row.ai_output_tokens === null ? null : Number(row.ai_output_tokens),
        expires_at: row.expires_at,
      }
    : null;
  return { plan: planRow.plan, overrideRow };
}

interface UsageCounts {
  report_generate: number;
  voice_transcribe: number;
  voice_summarize: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
}

/**
 * Internal: count/sum used-this-month per bucket. One round trip — a
 * single SQL with conditional aggregates over the partial index.
 */
async function loadMonthUsage(
  db: ScopedDb,
  userId: string,
  now: Date,
): Promise<UsageCounts> {
  const monthStart = currentMonthStart(now).toISOString();
  const res = await db.execute<{
    report_generate: string;
    voice_transcribe: string;
    voice_summarize: string;
    ai_input_tokens: string;
    ai_output_tokens: string;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE operation = 'generate_report')::text AS report_generate,
      count(*) FILTER (WHERE operation = 'transcribe')::text       AS voice_transcribe,
      count(*) FILTER (WHERE operation = 'chat')::text             AS voice_summarize,
      coalesce(sum(input_tokens) FILTER (WHERE operation IN ('chat', 'generate_report')), 0)::text
        AS ai_input_tokens,
      coalesce(sum(output_tokens) FILTER (WHERE operation IN ('chat', 'generate_report')), 0)::text
        AS ai_output_tokens
    FROM app.llm_usage_events
    WHERE user_id = ${userId}
      AND status = 'ok'
      AND created_at >= ${monthStart}::timestamptz
  `);
  const row = res.rows[0];
  return {
    report_generate: Number(row?.report_generate ?? 0),
    voice_transcribe: Number(row?.voice_transcribe ?? 0),
    voice_summarize: Number(row?.voice_summarize ?? 0),
    ai_input_tokens: Number(row?.ai_input_tokens ?? 0),
    ai_output_tokens: Number(row?.ai_output_tokens ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Admin path (unscoped — acts on another user's row).
// ---------------------------------------------------------------------------

export interface OverrideUpsertInput {
  report_generate?: number | null;
  voice_transcribe?: number | null;
  voice_summarize?: number | null;
  ai_input_tokens?: number | null;
  ai_output_tokens?: number | null;
  reason: string;
  expiresAt?: Date | null;
}

/**
 * Admin-only: upsert one user's override row. Runs against the
 * unscoped pool because the admin acts on someone else's row — same
 * model as the waitlist export. `grantedBy` is the admin's own id.
 *
 * Per-column semantics:
 *   - omitted → leave existing column unchanged
 *   - null    → drop the override for that column (fall through to plan)
 *   - number  → set the override
 */
export async function upsertUserLimitOverride(
  targetUserId: string,
  grantedBy: string,
  input: OverrideUpsertInput,
): Promise<void> {
  const fields = [
    'report_generate',
    'voice_transcribe',
    'voice_summarize',
    'ai_input_tokens',
    'ai_output_tokens',
  ] as const;
  // Build a values map of "what to write" — undefined means "no
  // change", so we read the existing row and preserve those columns.
  const existing = await rawDb().execute<{
    report_generate: number | null;
    voice_transcribe: number | null;
    voice_summarize: number | null;
    ai_input_tokens: string | null;
    ai_output_tokens: string | null;
  }>(sql`
    SELECT report_generate, voice_transcribe, voice_summarize,
           ai_input_tokens, ai_output_tokens
    FROM app.user_limit_overrides
    WHERE user_id = ${targetUserId}
    LIMIT 1
  `);
  const prev = existing.rows[0] ?? null;
  const merged: Record<(typeof fields)[number], number | null> = {
    report_generate:
      input.report_generate === undefined
        ? prev?.report_generate ?? null
        : input.report_generate,
    voice_transcribe:
      input.voice_transcribe === undefined
        ? prev?.voice_transcribe ?? null
        : input.voice_transcribe,
    voice_summarize:
      input.voice_summarize === undefined
        ? prev?.voice_summarize ?? null
        : input.voice_summarize,
    ai_input_tokens:
      input.ai_input_tokens === undefined
        ? prev?.ai_input_tokens === null || prev?.ai_input_tokens === undefined
          ? null
          : Number(prev.ai_input_tokens)
        : input.ai_input_tokens,
    ai_output_tokens:
      input.ai_output_tokens === undefined
        ? prev?.ai_output_tokens === null || prev?.ai_output_tokens === undefined
          ? null
          : Number(prev.ai_output_tokens)
        : input.ai_output_tokens,
  };
  await rawDb().execute(sql`
    INSERT INTO app.user_limit_overrides (
      user_id, report_generate, voice_transcribe, voice_summarize,
      ai_input_tokens, ai_output_tokens, reason, granted_by, granted_at, expires_at
    ) VALUES (
      ${targetUserId},
      ${merged.report_generate},
      ${merged.voice_transcribe},
      ${merged.voice_summarize},
      ${merged.ai_input_tokens},
      ${merged.ai_output_tokens},
      ${input.reason},
      ${grantedBy},
      now(),
      ${input.expiresAt ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      report_generate  = EXCLUDED.report_generate,
      voice_transcribe = EXCLUDED.voice_transcribe,
      voice_summarize  = EXCLUDED.voice_summarize,
      ai_input_tokens  = EXCLUDED.ai_input_tokens,
      ai_output_tokens = EXCLUDED.ai_output_tokens,
      reason           = EXCLUDED.reason,
      granted_by       = EXCLUDED.granted_by,
      granted_at       = EXCLUDED.granted_at,
      expires_at       = EXCLUDED.expires_at
  `);
}

export async function deleteUserLimitOverride(targetUserId: string): Promise<void> {
  await rawDb().execute(sql`
    DELETE FROM app.user_limit_overrides WHERE user_id = ${targetUserId}
  `);
}

export async function updateUserPlan(targetUserId: string, plan: Plan): Promise<void> {
  await rawDb().execute(sql`
    UPDATE "user" SET plan = ${plan}, updated_at = now() WHERE id = ${targetUserId}
  `);
}
