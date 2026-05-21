/**
 * @harpa/ai-fixtures — record / replay / live for every LLM call.
 *
 * Modes (chosen by AI_FIXTURE_MODE):
 *   replay — read fixture, return canned response (default in CI + tests + :mock)
 *   record — hit real provider, redact, write fixture
 *   live   — hit real provider, no fixture interaction (only when AI_LIVE=1)
 *
 * See docs/v4/arch-ai-fixtures.md.
 */
export type FixtureMode = 'replay' | 'record' | 'live';

export type Vendor = 'kimi' | 'openai' | 'groq';

export interface ProviderConfig {
  vendor: Vendor;
  fixtureMode?: FixtureMode;
  fixtureName?: string;
  /** Override fixtures dir (defaults to packages/ai-fixtures/fixtures). */
  fixturesDir?: string;
}

export interface ChatRequest {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  usage?: { input: number; output: number };
}

export interface TranscribeRequest {
  audioUrl: string;
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  durationSec?: number;
}

export interface AiProvider {
  vendor: Vendor;
  chat(req: ChatRequest): Promise<ChatResponse>;
  transcribe(req: TranscribeRequest): Promise<TranscribeResponse>;
}

export class FixtureMissError extends Error {
  constructor(
    public fixtureName: string,
    public requestHash: string,
    detail: string,
  ) {
    super(`[ai-fixtures] missing or stale fixture "${fixtureName}" (${requestHash}): ${detail}`);
    this.name = 'FixtureMissError';
  }
}

export class LiveModeForbiddenError extends Error {
  constructor() {
    super('[ai-fixtures] live mode requires AI_LIVE=1');
    this.name = 'LiveModeForbiddenError';
  }
}

/**
 * Thrown when a real-provider adapter is invoked for a (vendor, kind)
 * pair that has no implementation. Today:
 *   - openai.transcribe — transcription is groq-only
 *   - groq.chat         — chat is openai-only
 *   - kimi.*            — live adapter pending (replay-only)
 */
export class LiveAdapterMissingError extends Error {
  constructor(public vendor: string, public kind: 'chat' | 'transcribe') {
    super(`[ai-fixtures] no live adapter for vendor="${vendor}" kind="${kind}"`);
    this.name = 'LiveAdapterMissingError';
  }
}

export { createProvider } from './factory.js';
export { redact } from './redact.js';
export { hashRequest } from './hash.js';
export { createOpenAiProvider } from './providers/openai.js';
export { createGroqProvider } from './providers/groq.js';
export { realProviderFactoryFromEnv } from './providers/factory-from-env.js';
