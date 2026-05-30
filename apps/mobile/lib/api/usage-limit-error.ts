/**
 * Usage-limit error mapping — extracts the structured `LimitState`
 * from a 403 `usage_limit_exceeded` ApiError envelope, returning
 * `null` when the error isn't a usage-limit error.
 *
 * Wire shape from the API (mapped by middleware/errorMapper.ts):
 *   { error: { code: 'usage_limit_exceeded', message, details:
 *      { kind, limit, used, remaining, resetAt, plan, overridden }
 *   } }
 *
 * The contract is asymmetric on purpose: we only enforce the fields
 * the dialog renders. New fields added server-side flow through as
 * unknowns rather than tripping a parse error.
 *
 * Phase 3 of per-account usage limits — see
 * docs/v4/arch-usage-limits.md §5.
 */
import type { ApiError } from './errors';

export type UsageLimitKind =
  | 'report_generate'
  | 'voice_transcribe'
  | 'voice_summarize'
  | 'ai_input_tokens'
  | 'ai_output_tokens';

export interface UsageLimitDetails {
  kind: UsageLimitKind;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string;
  plan: 'free' | 'pro' | 'enterprise';
  overridden: boolean;
}

const KINDS = new Set<UsageLimitKind>([
  'report_generate',
  'voice_transcribe',
  'voice_summarize',
  'ai_input_tokens',
  'ai_output_tokens',
]);

function isKind(v: unknown): v is UsageLimitKind {
  return typeof v === 'string' && KINDS.has(v as UsageLimitKind);
}

function isPlan(v: unknown): v is 'free' | 'pro' | 'enterprise' {
  return v === 'free' || v === 'pro' || v === 'enterprise';
}

/**
 * Returns the structured usage-limit payload when `err` is a 403
 * `usage_limit_exceeded` envelope; null otherwise. Tolerant of
 * partial / unexpected payloads — only fields with matching types
 * are surfaced.
 */
export function usageLimitFromError(err: unknown): UsageLimitDetails | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as ApiError;
  if (e.code !== 'usage_limit_exceeded') return null;
  const d = (e.details ?? {}) as Record<string, unknown>;
  if (!isKind(d.kind)) return null;
  if (!isPlan(d.plan)) return null;
  return {
    kind: d.kind,
    limit: typeof d.limit === 'number' ? d.limit : null,
    used: typeof d.used === 'number' ? d.used : 0,
    remaining: typeof d.remaining === 'number' ? d.remaining : null,
    resetAt: typeof d.resetAt === 'string' ? d.resetAt : '',
    plan: d.plan,
    overridden: d.overridden === true,
  };
}

/**
 * Parse an `X-Usage-Warning: near-limit; bucket=…; pct=…` header
 * value. Returns null when the header is absent or unparseable.
 * Phase 2 server-side; Phase 3 client-side surfacing.
 */
export interface NearLimitWarning {
  bucket: UsageLimitKind;
  pct: number;
}

export function parseUsageWarning(header: string | null | undefined): NearLimitWarning | null {
  if (!header) return null;
  if (!header.startsWith('near-limit')) return null;
  const parts = header.split(';').map((s) => s.trim());
  let bucket: UsageLimitKind | null = null;
  let pct: number | null = null;
  for (const p of parts) {
    const [k, v] = p.split('=').map((s) => s.trim());
    if (k === 'bucket' && isKind(v)) bucket = v;
    if (k === 'pct' && v !== undefined) {
      const n = Number(v);
      if (Number.isFinite(n)) pct = n;
    }
  }
  if (bucket === null || pct === null) return null;
  return { bucket, pct };
}
