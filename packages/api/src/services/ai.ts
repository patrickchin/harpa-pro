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
  type AiProvider,
  type FixtureMode,
  type Vendor,
} from '@harpa/ai-fixtures';
import { reports as reportSchemas } from '@harpa/api-contract';
import type { z } from 'zod';

export class AiProviderError extends Error {
  readonly code = 'ai_provider_error';
  readonly inner?: unknown;
  constructor(message: string, inner?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.inner = inner;
  }
}

/**
 * System prompt for the `generateReport` chat call. Ported verbatim
 * from canonical
 * `../haru3-reports/supabase/functions/generate-report/index.ts`
 * (`SYSTEM_PROMPT`). v4-specific schema diffs are intentionally NOT
 * applied here — the canonical prompt produces a `report` envelope
 * that we parse + validate against `reportBody` in `generateReport()`.
 * If we ever diverge from the canonical contract, update this prompt
 * AND re-record every generate-report.* fixture (see refresh-hashes
 * script).
 */
export const REPORT_SYSTEM_PROMPT =
  `You are a construction site report assistant. You convert numbered site notes from a construction site into a structured JSON report.

INPUT
- NOTES: numbered site notes captured on site. Each note is one input item — text, voice transcript, image, video, or document. Non-text items appear as numbered placeholders (e.g. "[image 1]", "[image 2]", "[video 1]", "[document 1]") at their position. You cannot see their contents, but you should acknowledge that the attachment exists.

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired" }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown" }]

RULES
- Populate "meta.title" with a short, human-readable title (e.g. "Site Visit — Wet Weather") and "meta.summary" with a one-sentence overview.
- Use sections to capture work progress, observations, and narrative detail. Materials list everything mentioned (concrete, steel, timber, pipes, etc.) — do NOT extract cost/price information; that's handled outside this flow.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.

EXAMPLE
{ "report": { "meta": { "title": "Site Visit — Wet Weather", "reportType": "daily", "summary": "Wet conditions delayed concrete pour", "visitDate": null }, "weather": { "conditions": "wet", "temperature": "20C", "wind": null, "impact": "Pour delayed by 1 hour" }, "workers": null, "materials": [{ "name": "Concrete", "quantity": "50", "quantityUnit": "m³", "condition": null, "status": "delivered", "notes": null }], "issues": [], "nextSteps": ["Order rebar"], "sections": [{ "title": "Foundation Work", "content": "Concrete pour started in zone A despite wet weather." }] } }`;

/**
 * Canonical inputs for the checked-in default fixtures. Replay-mode
 * normalisation rewrites caller-supplied values to these so that the
 * fixture request-hash always matches. Update if/when fixtures are
 * re-recorded with different canonicals.
 *
 * Source of truth: packages/ai-fixtures/fixtures/{transcribe,summarize}.basic.json
 *
 * Per-vendor fixture variants are stored as
 * `<base>.<vendor>.json` (e.g. `summarize.basic.anthropic`,
 * `generate-report.full.kimi`). Each vendor has its own canonical
 * model — these are the model ids `getAiSettings()` may persist for
 * a user. The OpenAI fixture keeps the un-suffixed name for
 * backwards compatibility with existing callers + tests.
 */
export const FIXTURE_CANONICALS = {
  transcribe: {
    name: 'transcribe.basic',
    vendor: 'openai' as Vendor,
    audioUrl: 'https://fixtures.harpa.example/voice.fixture.m4a',
  },
  summarize: {
    name: 'summarize.basic',
    vendor: 'openai' as Vendor,
    model: 'gpt-4o-mini',
    systemPrompt: 'Summarise the following transcript into a concise site-note body.',
    userPrompt: 'Site arrival 8:15. Crew of three on rebar...',
  },
  /**
   * Two report fixtures cover the success matrix:
   *   - `full`: rich notes → fully populated structured body.
   *   - `incomplete`: sparse notes → mostly-null body with a single
   *     summary section explaining the gap.
   * Source of truth:
   *   packages/ai-fixtures/fixtures/generate-report.{full,incomplete}.json
   */
  report: {
    vendor: 'openai' as Vendor,
    model: 'gpt-4o',
    // Source: ../haru3-reports/supabase/functions/generate-report/index.ts
    // (canonical `SYSTEM_PROMPT`). Kept verbatim so the Debug tab in
    // mobile surfaces the same instructions the model actually gets.
    // NOTE: changing this string changes the request hash — re-record
    // every generate-report.* fixture via
    // `pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`
    // (or use the record script for fresh model responses).
    systemPrompt: REPORT_SYSTEM_PROMPT,
    fixtures: {
      full: { name: 'generate-report.full', userPrompt: '<notes payload>' },
      incomplete: { name: 'generate-report.incomplete', userPrompt: '<sparse notes>' },
    },
  },
} as const;

/**
 * Canonical models per vendor — what `chat()` / `generateReport()`
 * use in replay mode when routing to a per-vendor fixture. Mirrors
 * the user-settings UI options. Source of truth for the per-vendor
 * fixture files in `packages/ai-fixtures/fixtures/`.
 */
const VENDOR_MODELS: Record<Vendor, { summarize: string; report: string }> = {
  openai:    { summarize: 'gpt-4o-mini',         report: 'gpt-4o' },
  kimi:      { summarize: 'moonshot-v1-8k',      report: 'moonshot-v1-32k' },
  anthropic: { summarize: 'claude-3-5-haiku',    report: 'claude-3-5-sonnet' },
  google:    { summarize: 'gemini-1.5-flash',    report: 'gemini-1.5-pro' },
  zai:       { summarize: 'glm-4-flash',         report: 'glm-4-plus' },
  deepseek:  { summarize: 'deepseek-chat',       report: 'deepseek-reasoner' },
};

/**
 * Build the on-disk fixture name for a (base, vendor) pair. OpenAI
 * keeps the un-suffixed name so existing callers + recorded fixtures
 * continue to work without modification.
 */
function fixtureNameFor(base: string, vendor: Vendor): string {
  return vendor === 'openai' ? base : `${base}.${vendor}`;
}

function pickMode(fixtureName?: string): FixtureMode {
  if (fixtureName) return 'replay';
  if (process.env.AI_LIVE === '1') return 'live';
  return 'replay';
}

function buildProvider(vendor: Vendor, fixtureName: string): AiProvider {
  return createProvider({ vendor, fixtureMode: pickMode(fixtureName), fixtureName });
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

export interface TranscribeInput {
  /**
   * The real (signed) audio URL the provider would fetch. In replay
   * mode this is ignored and the canonical fixture URL is used.
   */
  audioUrl: string;
  fixtureName?: string;
  language?: string;
}

export interface TranscribeOutput {
  text: string;
  durationSec?: number;
}

export async function transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
  const fixtureName = input.fixtureName ?? FIXTURE_CANONICALS.transcribe.name;
  const mode = pickMode(fixtureName);
  const audioUrl =
    mode === 'replay' ? FIXTURE_CANONICALS.transcribe.audioUrl : input.audioUrl;
  const provider = buildProvider(FIXTURE_CANONICALS.transcribe.vendor, fixtureName);
  return withErrorWrap('transcribe', () => provider.transcribe({ audioUrl }));
}

export interface ChatInput {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  fixtureName?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional vendor override. In replay mode, selects a per-vendor
   * fixture (e.g. `summarize.basic.anthropic`). Defaults to `openai`
   * for backwards compatibility with existing fixture-less callers.
   */
  vendor?: Vendor;
}

export interface ChatOutput {
  text: string;
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const vendor: Vendor = input.vendor ?? FIXTURE_CANONICALS.summarize.vendor;
  const canonicalModel = VENDOR_MODELS[vendor].summarize;
  const fixtureName =
    input.fixtureName ?? fixtureNameFor(FIXTURE_CANONICALS.summarize.name, vendor);
  const mode = pickMode(fixtureName);
  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: FIXTURE_CANONICALS.summarize.systemPrompt,
          userPrompt: FIXTURE_CANONICALS.summarize.userPrompt,
        }
      : {
          model: input.model ?? canonicalModel,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        };
  const provider = buildProvider(vendor, fixtureName);
  const out = await withErrorWrap('chat', () => provider.chat(req));
  return { text: out.text };
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
  fixtureName?: string;
  /**
   * Optional vendor override. In replay mode, selects a per-vendor
   * fixture (e.g. `generate-report.full.anthropic`). Defaults to
   * `openai`.
   */
  vendor?: Vendor;
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
  const canonicalModel = VENDOR_MODELS[vendor].report;
  const defaultName = fixtureNameFor(canonicals.fixtures.full.name, vendor);
  const incompleteName = fixtureNameFor(canonicals.fixtures.incomplete.name, vendor);
  // Callers may pass an OpenAI-style fixture name (e.g. "generate-report.incomplete")
  // OR a fully-qualified per-vendor name. Normalise: if the caller gave a base
  // name and the vendor is non-default, suffix it.
  const fixtureName = (() => {
    if (!input.fixtureName) return defaultName;
    if (vendor === 'openai') return input.fixtureName;
    // Already vendor-suffixed?
    if (input.fixtureName.endsWith(`.${vendor}`)) return input.fixtureName;
    return `${input.fixtureName}.${vendor}`;
  })();
  const mode = pickMode(fixtureName);

  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: canonicals.systemPrompt,
          // Map the requested fixture name to its recorded canonical user
          // prompt. Unknown names fall through to the `full` prompt — they
          // will FixtureMiss against the on-disk store and surface as a
          // generic 502, matching the voice route's behaviour.
          userPrompt:
            fixtureName === incompleteName
              ? canonicals.fixtures.incomplete.userPrompt
              : canonicals.fixtures.full.userPrompt,
        }
      : {
          model: canonicalModel,
          systemPrompt: canonicals.systemPrompt,
          userPrompt: input.notes,
        };

  const provider = buildProvider(vendor, fixtureName);
  const out = await withErrorWrap('generateReport', () => provider.chat(req));

  let parsed: unknown;
  try {
    parsed = JSON.parse(out.text);
  } catch (err) {
    throw new AiProviderError('generateReport: provider response was not valid JSON', err);
  }
  const result = reportSchemas.reportBody.safeParse(parsed);
  if (!result.success) {
    // Don't leak the failing payload — keep the error surface generic.
    throw new AiProviderError('generateReport: provider response did not match report schema');
  }
  return {
    body: result.data,
    text: out.text,
    systemPrompt: req.systemPrompt,
    // Always surface the real (formatted) notes input to the caller so
    // the mobile Debug tab shows what the operator actually fed in. The
    // provider request itself uses `req.userPrompt`, which is the
    // canonical placeholder in replay mode (so the recorded hash
    // matches) — but that's not what we want operators to see.
    userPrompt: input.notes.length > 0 ? input.notes : req.userPrompt,
    model: req.model,
    vendor,
  };
}
