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
 * Canonical inputs for the checked-in default fixtures. Replay-mode
 * normalisation rewrites caller-supplied values to these so that the
 * fixture request-hash always matches. Update if/when fixtures are
 * re-recorded with different canonicals.
 *
 * Source of truth: packages/ai-fixtures/fixtures/{transcribe,summarize}.basic.json
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
} as const;

function pickMode(): FixtureMode {
  if (process.env.AI_LIVE === '1') return 'live';
  return 'replay';
}

function buildProvider(vendor: Vendor, fixtureName: string): AiProvider {
  return createProvider({ vendor, fixtureMode: pickMode(), fixtureName });
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
  const mode = pickMode();
  const fixtureName = input.fixtureName ?? FIXTURE_CANONICALS.transcribe.name;
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
}

export interface ChatOutput {
  text: string;
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const mode = pickMode();
  const fixtureName = input.fixtureName ?? FIXTURE_CANONICALS.summarize.name;
  const req =
    mode === 'replay'
      ? {
          model: FIXTURE_CANONICALS.summarize.model,
          systemPrompt: FIXTURE_CANONICALS.summarize.systemPrompt,
          userPrompt: FIXTURE_CANONICALS.summarize.userPrompt,
        }
      : {
          model: input.model ?? FIXTURE_CANONICALS.summarize.model,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        };
  const provider = buildProvider(FIXTURE_CANONICALS.summarize.vendor, fixtureName);
  const out = await withErrorWrap('chat', () => provider.chat(req));
  return { text: out.text };
}
