/**
 * AI provider wrapper.
 *
 * Thin layer over @harpa/ai-fixtures. Selects fixture mode from env
 * (AI_LIVE=1 → 'live', otherwise 'replay') and, in replay mode,
 * normalises the request body to the canonical inputs that the
 * checked-in fixtures were recorded against — so route handlers can
 * forward whatever the caller supplied (a real signed audio URL, a
 * client-supplied transcript) without breaking the request-hash
 * lookup in `@harpa/ai-fixtures`.
 *
 * In live mode (future) the inputs flow through unchanged.
 *
 * `FixtureMissError` (or any other provider-side failure) is wrapped
 * in `AiProviderError` so the route layer / errorMapper can map it to
 * a 502 + code=ai_provider_error without leaking provider internals.
 *
 * Refs: docs/v4/arch-ai-fixtures.md, plan-p1-api-core.md §P1.6.
 */
import {
  createProvider,
  FixtureMissError,
  FixtureStore,
  realProviderFactoryFromEnv,
  type AiProvider,
  type FixtureMode,
  type Vendor,
} from '@harpa/ai-fixtures';
import { reports as reportSchemas } from '@harpa/api-contract';
import type { z } from 'zod';
import type { ScopedDb } from '../db/scope.js';
import { env } from '../env.js';
import {
  REPORT_SYSTEM_PROMPT,
  REPORT_UPDATE_SYSTEM_PROMPT,
} from '../prompts/reportGeneration.js';
import { VOICE_SUMMARY_SYSTEM_PROMPT } from '../prompts/voiceSummary.js';
import { recordLlmUsage, type LlmOperation } from './ai-usage.js';
import { enforceTokenLimits } from './usage-limits.js';

/**
 * Context the route passes when it wants the call recorded in
 * `app.llm_usage_events`. The `db` field is the same scoped accessor
 * routes get from `c.get('db')` — passing the accessor (not a raw
 * handle) keeps RLS per-request scoping intact: the INSERT runs under
 * the caller's `app.user_id`, and `llm_usage_events_self_insert`
 * enforces the user_id claim independently of the chokepoint.
 *
 * Optional everywhere — fixture-driven unit tests can still call
 * chat/transcribe/generateReport without it. The default-wiring
 * integration test (Pitfall 13) is what keeps us honest: if a route
 * stops passing the context, that test goes red because the expected
 * row never lands.
 */
export interface LlmUsageContext {
  db: <T>(fn: (db: ScopedDb) => Promise<T>) => Promise<T>;
  userId: string;
  projectId?: string | null;
  reportId?: string | null;
}

export class AiProviderError extends Error {
  readonly code = 'ai_provider_error';
  readonly inner?: unknown;
  constructor(message: string, inner?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.inner = inner;
  }
}

// Re-export for callers that import prompts from this module.
export { REPORT_SYSTEM_PROMPT, REPORT_UPDATE_SYSTEM_PROMPT };

/**
 * Canonical inputs for the checked-in voice-note fixtures. Replay-mode
 * normalisation rewrites caller-supplied values to these so that the
 * fixture request-hash always matches. Update if/when fixtures are
 * re-recorded with different canonicals.
 *
 * Five scenarios — `voice-1` … `voice-5` — each backed by a real
 * site-walk transcript. Source of truth:
 *   packages/ai-fixtures/fixtures/{transcribe,summarize,generate-report}.voice-N.json
 *
 * Per-vendor fixture variants have been removed: a single set of OpenAI
 * fixtures covers every scenario. The per-user `AiVendor` preference is
 * still tracked for live-mode routing and accounting, but replay always
 * resolves through these canonicals.
 */
type ScenarioKey = 'voice-1' | 'voice-2' | 'voice-3' | 'voice-4' | 'voice-5';

export const DEFAULT_SCENARIO: ScenarioKey = 'voice-1';
const SCENARIOS: readonly ScenarioKey[] = ['voice-1', 'voice-2', 'voice-3', 'voice-4', 'voice-5'];

/**
 * Read the canonical transcript for a scenario from the recorded transcribe
 * fixture. The transcript is stored as `response.text` in
 * `transcribe.voice-N.json` and is identical to the `request.userPrompt`
 * in `summarize.voice-N.json` — the fixture files are the single source of
 * truth; we no longer duplicate these strings inline.
 */
const fixtureStore = new FixtureStore();

function canonicalTranscript(scenario: ScenarioKey): string {
  const fixture = fixtureStore.read(`transcribe.${scenario}`);
  if (!fixture) {
    throw new Error(`[ai] transcribe fixture not found for scenario "${scenario}"`);
  }
  return (fixture.response as { text: string }).text;
}

export const FIXTURE_CANONICALS = {
  transcribe: {
    vendor: 'groq' as Vendor,
    model: 'whisper-large-v3-turbo',
    defaultScenario: DEFAULT_SCENARIO,
    audioUrl: (scenario: ScenarioKey) =>
      `https://fixtures.harpa.example/${scenario}.fixture.m4a`,
    name: (scenario: ScenarioKey) => `transcribe.${scenario}`,
  },
  summarize: {
    vendor: 'openai' as Vendor,
    model: 'gpt-4o-mini',
    // Must match `VOICE_SUMMARY_SYSTEM_PROMPT` (imported above) so
    // replay-mode hashes line up with the fixture files. Sharing the
    // string means changing the prompt in one place forces fixtures
    // to be re-recorded (`refresh-hashes.ts`) in lock-step.
    systemPrompt: VOICE_SUMMARY_SYSTEM_PROMPT,
    defaultScenario: DEFAULT_SCENARIO,
    userPrompt: (scenario: ScenarioKey) => canonicalTranscript(scenario),
    name: (scenario: ScenarioKey) => `summarize.${scenario}`,
  },
  /**
   * Report fixtures cover the five voice-note scenarios end-to-end.
   * Each `generate-report.voice-N.json` is hashed against a placeholder
   * `<notes payload voice-N>` user prompt — the actual concatenated
   * notes flow through only in live mode.
   *
   * Source: ../haru3-reports/supabase/functions/generate-report/index.ts
   * (canonical `SYSTEM_PROMPT`). NOTE: changing the system prompt
   * changes the request hash — re-record every generate-report.* fixture
   * via `pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`.
   */
  report: {
    vendor: 'kimi' as Vendor,
    model: 'kimi-k2.6',
    systemPrompt: REPORT_SYSTEM_PROMPT,
    // Distinct system prompt for the *update* path. See
    // REPORT_UPDATE_SYSTEM_PROMPT — instructs the model to preserve
    // hand-edited fields while integrating new notes. No update
    // fixtures are checked in yet (would need a separate recording
    // pass); the system prompt is wired through for completeness.
    updateSystemPrompt: REPORT_UPDATE_SYSTEM_PROMPT,
    defaultScenario: DEFAULT_SCENARIO,
    userPrompt: (scenario: ScenarioKey) => `<notes payload ${scenario}>`,
    name: (scenario: ScenarioKey) => `generate-report.${scenario}`,
  },
} as const;

/**
 * Resolve a caller-supplied fixture name to a scenario key. Returns
 * `null` if the name does not match a known scenario suffix — callers
 * fall back to the default scenario for prompt normalisation, which
 * causes the underlying FixtureStore lookup to surface a clear
 * FixtureMissError if the requested file does not exist.
 */
function scenarioFromName(name: string): ScenarioKey | null {
  for (const s of SCENARIOS) {
    if (name.endsWith(s)) return s;
  }
  return null;
}

function pickMode(fixtureName?: string): FixtureMode {
  if (process.env.AI_LIVE === '1' && !fixtureName) return 'live';
  return 'replay';
}

function buildProviderWithMode(
  vendor: Vendor,
  fixtureName: string,
  mode: FixtureMode,
): AiProvider {
  const realFactory =
    mode === 'replay'
      ? undefined
      : realProviderFactoryFromEnv({
          openaiApiKey: env.OPENAI_API_KEY,
          openaiBaseUrl: env.OPENAI_BASE_URL,
          groqApiKey: env.GROQ_API_KEY,
          groqBaseUrl: env.GROQ_BASE_URL,
          kimiApiKey: env.KIMI_API_KEY,
          kimiBaseUrl: env.KIMI_BASE_URL,
        });
  return createProvider({ vendor, fixtureMode: mode, fixtureName }, realFactory);
}

async function withErrorWrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FixtureMissError) {
      // Surface the provider-level message so test failures are debuggable,
      // but route handlers map AiProviderError to a generic 502 envelope —
      // the FixtureMissError details never reach the wire.
      throw new AiProviderError(`${label}: ${err.message}`, err);
    }
    if (err instanceof AiProviderError) throw err;
    throw new AiProviderError(`${label} failed`, err);
  }
}

/**
 * Run the provider call and (best-effort) record a usage row. The
 * recorder swallows its own failures so accounting bugs never surface
 * to the user-facing request. On provider failure we still record an
 * `error` row so cost postmortems include attempted calls.
 *
 * Vendors return `{ input, output, cached? }` for chat. Transcribe
 * returns `{ inputSeconds }` instead — Whisper-class endpoints bill
 * by audio duration, not tokens, and the `llm_usage_events` schema
 * stores it in a dedicated `input_seconds` column. Both paths flow
 * through this chokepoint so every call lands a row. See
 * docs/v4/arch-ai-fixtures.md §Usage accounting for the full
 * per-vendor / per-operation convention.
 */
async function withUsageAccounting<T>(
  ctx: LlmUsageContext | undefined,
  meta: { vendor: Vendor; model: string; operation: LlmOperation; fixtureMode: FixtureMode },
  label: string,
  fn: () => Promise<
    T & { usage?: { input?: number; output?: number; cached?: number; inputSeconds?: number } }
  >,
): Promise<
  T & { usage?: { input?: number; output?: number; cached?: number; inputSeconds?: number } }
> {
  const start = Date.now();
  const record = async (
    status: 'ok' | 'error',
    usage?: { input?: number; output?: number; cached?: number; inputSeconds?: number },
  ) => {
    if (!ctx) return;
    try {
      await ctx.db((d) =>
        recordLlmUsage(d, {
          userId: ctx.userId,
          projectId: ctx.projectId ?? null,
          reportId: ctx.reportId ?? null,
          vendor: meta.vendor,
          model: meta.model,
          operation: meta.operation,
          inputTokens: usage?.input ?? 0,
          outputTokens: usage?.output ?? 0,
          cachedTokens: usage?.cached ?? 0,
          inputSeconds: usage?.inputSeconds ?? null,
          latencyMs: Date.now() - start,
          fixtureMode: meta.fixtureMode,
          status,
        }),
      );
    } catch (err) {
      // Accounting failures must never bubble to the caller. Log so
      // CI surfaces a regression without breaking the request.
      console.error('[ai-usage] recordLlmUsage failed', err);
    }
  };
  let out: T & {
    usage?: { input?: number; output?: number; cached?: number; inputSeconds?: number };
  };
  // Phase 2 — token-bucket pre-hoc check. If the user is ALREADY over
  // their monthly token cap from previous calls' recorded rows, refuse
  // before talking to the provider. Errors propagate as
  // UsageLimitExceededError → errorMapper renders 403 +
  // code=usage_limit_exceeded. See docs/v4/arch-usage-limits.md §4.1.
  //
  // Skipped when ctx is absent: fixture-driven unit tests still call
  // chat/transcribe/generateReport without a user context and must not
  // pay the DB roundtrip.
  if (ctx) {
    await ctx.db((d) => enforceTokenLimits(d, ctx.userId));
  }
  try {
    out = await withErrorWrap(label, fn);
  } catch (err) {
    await record('error');
    throw err;
  }
  await record('ok', out.usage);
  return out;
}

export interface TranscribeInput {
  /**
   * The real (signed) audio URL the provider would fetch. In replay
   * mode this is ignored and the canonical fixture URL is used.
   */
  audioUrl: string;
  fixtureName?: string;
  language?: string;
  usageContext?: LlmUsageContext;
}

export interface TranscribeOutput {
  text: string;
  durationSec?: number;
  vendor: Vendor;
  model: string;
}

export async function transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
  const mode = pickMode(input.fixtureName);
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    FIXTURE_CANONICALS.transcribe.defaultScenario;
  const fixtureName =
    input.fixtureName ?? FIXTURE_CANONICALS.transcribe.name(scenario);
  const audioUrl =
    mode === 'replay'
      ? FIXTURE_CANONICALS.transcribe.audioUrl(scenario)
      : input.audioUrl;
  const vendor = FIXTURE_CANONICALS.transcribe.vendor;
  const model = FIXTURE_CANONICALS.transcribe.model;
  const provider = buildProviderWithMode(vendor, fixtureName, mode);
  const result = await withUsageAccounting(
    input.usageContext,
    { vendor, model, operation: 'transcribe', fixtureMode: mode },
    'transcribe',
    async () => {
      const r = await provider.transcribe({ audioUrl });
      // Whisper-class transcription bills by audio seconds, not by
      // token counts the way chat does. Persist seconds in the
      // dedicated `input_seconds` column (see migration
      // `0008_llm_usage_input_seconds.sql`); `input_tokens` stays 0
      // so downstream `sum(input_tokens)` aggregates only ever mix
      // like units. Convention is documented in
      // `services/ai-usage.ts::RecordLlmUsageParams` and
      // `docs/v4/arch-ai-fixtures.md §Usage accounting`.
      const inputSeconds =
        typeof r.durationSec === 'number' && r.durationSec > 0 ? r.durationSec : 0;
      return {
        ...r,
        usage: { input: 0, output: 0, inputSeconds },
      };
    },
  );
  return { ...result, vendor, model };
}

export interface SummarizeInput {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  fixtureName?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional vendor override. Tracked for usage accounting only —
   * fixture selection no longer depends on vendor (a single set of
   * OpenAI fixtures covers every scenario in replay mode).
   */
  vendor?: Vendor;
  usageContext?: LlmUsageContext;
}

export interface SummarizeOutput {
  text: string;
  vendor: Vendor;
  model: string;
}

export async function summarize(input: SummarizeInput): Promise<SummarizeOutput> {
  const vendor: Vendor = input.vendor ?? FIXTURE_CANONICALS.summarize.vendor;
  const mode = pickMode(input.fixtureName);
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    FIXTURE_CANONICALS.summarize.defaultScenario;
  const fixtureName =
    input.fixtureName ?? FIXTURE_CANONICALS.summarize.name(scenario);
  const canonicalModel = FIXTURE_CANONICALS.summarize.model;
  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: FIXTURE_CANONICALS.summarize.systemPrompt,
          userPrompt: FIXTURE_CANONICALS.summarize.userPrompt(scenario),
        }
      : {
          model: input.model ?? canonicalModel,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        };
  const provider = buildProviderWithMode(vendor, fixtureName, mode);
  const out = await withUsageAccounting(
    input.usageContext,
    { vendor, model: req.model, operation: 'chat', fixtureMode: mode },
    'summarize',
    () => provider.chat(req),
  );
  return { text: out.text, vendor, model: req.model };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export type ReportBody = z.infer<typeof reportSchemas.reportBody>;

export interface GenerateReportInput {
  /**
   * Concatenated note content to feed the model. Ignored in replay mode
   * (the canonical user prompt is substituted so the request hash matches
   * the recorded fixture).
   */
  notes: string;
  /**
   * Optional existing report body. When provided, switches to the
   * UPDATE path: uses `REPORT_UPDATE_SYSTEM_PROMPT` and prepends an
   * `EXISTING REPORT:` block to the user prompt so the model preserves
   * manual edits rather than regenerating from scratch.
   *
   * In replay mode the contents of `existingBody` are replaced with
   * the canonical update payload so the request hash matches the
   * recorded fixture. A non-null value selects the update fixture
   * (`generate-report.update.*`); pass `null` (or omit) for the
   * cold-start path.
   */
  existingBody?: ReportBody | null;
  fixtureName?: string;
  /**
   * Optional vendor override. Tracked for usage accounting only —
   * fixture selection no longer depends on vendor. Defaults to
   * `openai`.
   */
  vendor?: Vendor;
  usageContext?: LlmUsageContext;
}

export interface GenerateReportOutput {
  /** Parsed + schema-validated body, ready to persist. */
  body: ReportBody;
  /** Raw model text (the JSON it returned, before parsing). */
  text: string;
  /** System prompt used in the request. Surfaced for the mobile Debug tab. */
  systemPrompt: string;
  /** User prompt sent to the provider (notes payload or replay canonical). */
  userPrompt: string;
  /** Model identifier used. */
  model: string;
  /** Vendor used. */
  vendor: Vendor;
  /** Whether this response came from live providers, recorded fixtures, or a record-mode mix. */
  fixtureMode: 'live' | 'replay' | 'record';
}

/**
 * Generate a structured report body from notes via the AI provider.
 *
 * The model returns a JSON string matching `api-contract.reports.reportBody`.
 * We parse + validate here so the route handler can persist a known-good
 * shape; any parse/schema mismatch is wrapped as `AiProviderError` so it
 * surfaces as a 502 (provider misbehaviour) rather than a 500.
 */
export async function generateReport(input: GenerateReportInput): Promise<GenerateReportOutput> {
  const canonicals = FIXTURE_CANONICALS.report;
  const vendor: Vendor = input.vendor ?? canonicals.vendor;
  const canonicalModel = canonicals.model;
  const isUpdate = input.existingBody != null;
  const mode = pickMode(input.fixtureName);
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    canonicals.defaultScenario;
  const fixtureName = input.fixtureName ?? canonicals.name(scenario);

  // Reports are pinned to canonicals.vendor / canonicalModel in BOTH
  // live and replay modes:
  //   - replay: the fixture hash was recorded with canonicals.vendor,
  //     so the provider MUST match for the hash to land.
  //   - live:   `canonicalModel` is vendor-specific (e.g. `kimi-k2.6`);
  //     routing it to the caller's `settings.vendor` (which defaults to
  //     `openai`) sends a Kimi model name to OpenAI and 502s with
  //     `[ai-fixtures:openai] HTTP 404`. See docs/bugs/2026-05-29-report-vendor-canonical-mismatch.md.
  // The caller-supplied `input.vendor` is preserved on the response (so
  // the Debug tab still shows what the user picked) but is intentionally
  // not honoured for routing until per-vendor canonical models exist.
  const providerVendor: Vendor = canonicals.vendor;

  // Build the LIVE user prompt — what we'd send the real provider.
  // In replay mode this is overridden with the canonical string so the
  // request hash matches the recorded fixture, but it's still surfaced
  // back to the caller via the response so the Debug tab shows what
  // the operator actually fed in.
  const liveUserPrompt = isUpdate
    ? `EXISTING REPORT:\n${JSON.stringify(input.existingBody)}\n\nNEW NOTES:\n${input.notes}`
    : input.notes;

  // Pick the right system prompt for the LIVE path. Update prompt
  // preserves manual edits; cold-start prompt generates from scratch.
  // Replay mode always uses REPORT_SYSTEM_PROMPT because that's the
  // prompt the checked-in voice fixtures were recorded with (no
  // update-flavour fixtures exist on disk).
  const liveSystemPrompt = isUpdate
    ? canonicals.updateSystemPrompt
    : canonicals.systemPrompt;

  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: canonicals.systemPrompt,
          // Map the requested fixture name to its recorded canonical user
          // prompt. Unknown names fall through to the default scenario —
          // they will FixtureMiss against the on-disk store and surface
          // as a generic 502, matching the voice route's behaviour.
          userPrompt: canonicals.userPrompt(scenario),
          responseFormat: 'json_object' as const,
        }
      : {
          model: canonicalModel,
          systemPrompt: liveSystemPrompt,
          userPrompt: liveUserPrompt,
          responseFormat: 'json_object' as const,
        };

  const provider = buildProviderWithMode(providerVendor, fixtureName, mode);
  const out = await withUsageAccounting(
    input.usageContext,
    { vendor: providerVendor, model: req.model, operation: 'generate_report', fixtureMode: mode },
    'generateReport',
    () => provider.chat(req),
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(out.text);
  } catch (err) {
    throw new AiProviderError('generateReport: provider response was not valid JSON', err);
  }
  const result = reportSchemas.reportBody.safeParse(parsed);
  if (!result.success) {
    // Don't leak the failing payload — keep the error surface generic.
    // BUT do attach Zod issue paths (not values) to the inner cause so
    // Fly logs can pinpoint which field drifted from the schema. This
    // is what unblocked the v3→v4 prompt-drift bug; see
    // docs/bugs/README.md "Prompt/schema drift in generateReport".
    const issues = result.error.issues
      .slice(0, 8) // cap to keep the log line bounded
      .map((i) => `${i.path.join('.') || '<root>'}:${i.code}`)
      .join(', ');
    throw new AiProviderError(
      `generateReport: provider response did not match report schema (issues=${issues})`,
    );
  }
  return {
    body: result.data,
    text: out.text,
    systemPrompt: req.systemPrompt,
    // Always surface the real (formatted) live prompt to the caller so
    // the mobile Debug tab shows what the operator actually fed in. The
    // provider request itself uses `req.userPrompt`, which is the
    // canonical placeholder in replay mode (so the recorded hash
    // matches) — but that's not what we want operators to see.
    userPrompt: liveUserPrompt.length > 0 ? liveUserPrompt : req.userPrompt,
    model: req.model,
    // Report the vendor we actually routed to, not the caller's
    // preference — they may differ while reports are pinned to the
    // canonical vendor (see providerVendor above).
    vendor: providerVendor,
    fixtureMode: mode,
  };
}
