/**
 * Per-account usage limits — wire contract. See
 * docs/v4/arch-usage-limits.md.
 *
 * Wire shape rule: `limit` and `remaining` are nullable; `null` means
 * "unbounded" (the service represents that internally as
 * `Number.POSITIVE_INFINITY` and translates at the wire boundary —
 * never serialise Infinity, JSON.stringify produces `null` anyway but
 * we want the type system to know).
 */
import { z } from 'zod';
import { isoDateTime } from './_shared.js';
import { userId } from './ids.js';

export const limitKind = z.enum([
  'report_generate',
  'voice_transcribe',
  'voice_summarize',
  'ai_input_tokens',
  'ai_output_tokens',
]);
export type LimitKind = z.infer<typeof limitKind>;

export const plan = z.enum(['free', 'pro', 'enterprise']);
export type Plan = z.infer<typeof plan>;

export const limitState = z.object({
  kind: limitKind,
  limit: z.number().int().nullable(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nullable(),
  resetAt: isoDateTime,
  plan,
  overridden: z.boolean(),
});
export type LimitState = z.infer<typeof limitState>;

export const limitsResponse = z.object({
  plan,
  buckets: z.array(limitState),
});
export type LimitsResponse = z.infer<typeof limitsResponse>;

/**
 * Error envelope `details` payload when a request is blocked. The
 * outer envelope is the shared one from `_shared.ts`; this is what
 * lands at `error.details`.
 */
export const limitExceededDetails = z.object({
  kind: limitKind,
  limit: z.number().int().nullable(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nullable(),
  resetAt: isoDateTime,
  plan,
  overridden: z.boolean(),
});
export type LimitExceededDetails = z.infer<typeof limitExceededDetails>;

/**
 * Admin upsert body. Per-bucket value semantics:
 *   - omitted   → leave existing override unchanged (or absent)
 *   - `null`    → drop the override for this bucket (fall through to plan)
 *   - `number`  → set the override; `-1` means explicitly unbounded
 */
const overrideValue = z.number().int().min(-1).nullable().optional();

export const limitOverrideRequest = z.object({
  report_generate: overrideValue,
  voice_transcribe: overrideValue,
  voice_summarize: overrideValue,
  ai_input_tokens: overrideValue,
  ai_output_tokens: overrideValue,
  reason: z.string().min(3).max(500),
  expiresAt: isoDateTime.nullable().optional(),
});
export type LimitOverrideRequest = z.infer<typeof limitOverrideRequest>;

export const limitOverrideRow = z.object({
  userId,
  report_generate: z.number().int().nullable(),
  voice_transcribe: z.number().int().nullable(),
  voice_summarize: z.number().int().nullable(),
  ai_input_tokens: z.number().int().nullable(),
  ai_output_tokens: z.number().int().nullable(),
  reason: z.string(),
  grantedBy: userId,
  grantedAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
});
export type LimitOverrideRow = z.infer<typeof limitOverrideRow>;

export const planUpdateRequest = z.object({ plan });
export type PlanUpdateRequest = z.infer<typeof planUpdateRequest>;
