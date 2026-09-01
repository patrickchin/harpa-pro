/**
 * Kimi (Moonshot) provider adapter — chat completions only.
 *
 * Moonshot exposes an OpenAI-compatible REST surface at
 * `https://api.moonshot.cn/v1` — the request/response shape mirrors
 * OpenAI's `/v1/chat/completions`, including `usage.prompt_tokens` /
 * `usage.completion_tokens` and (for cache-eligible accounts)
 * `usage.prompt_tokens_details.cached_tokens`. The adapters share only
 * that HTTP transport; Kimi keeps its own request and response handling
 * so Moonshot-only quirks can remain local.
 *
 * Transcription is not offered by Moonshot — `transcribe()` throws
 * `LiveAdapterMissingError`. Audio still routes through the Groq
 * adapter.
 *
 * Uses the global `fetch` — no SDK dependency, same rationale as
 * the OpenAI adapter (cold-start cost, install time, supply-chain
 * surface). See docs/v4/arch-ai-fixtures.md §Live mode.
 */
import {
  type AiProvider,
  type ChatRequest,
  type ChatResponse,
  LiveAdapterMissingError,
} from '../index.js';
import { AdapterError } from './error.js';
import { createOpenAiCompatibleTransport } from './openai-compatible-transport.js';

export interface KimiAdapterConfig {
  apiKey: string;
  /** Override base URL — defaults to `https://api.moonshot.cn/v1`. */
  baseUrl?: string;
  /** Override the global fetch (test-only). */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export function createKimiProvider(cfg: KimiAdapterConfig): AiProvider {
  const requestChatCompletion = createOpenAiCompatibleTransport({
    vendor: 'kimi',
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? 'https://api.moonshot.cn/v1',
    ...(cfg.fetchImpl ? { fetchImpl: cfg.fetchImpl } : {}),
  });

  return {
    vendor: 'kimi',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
      messages.push({ role: 'user', content: req.userPrompt });

      const body = {
        model: req.model,
        messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.responseFormat === 'json_object'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      };

      const json = (await requestChatCompletion(body)) as ChatCompletionResponse;

      const text = json.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new AdapterError('kimi', 'missing choices[0].message.content');
      }

      return {
        text,
        usage:
          json.usage?.prompt_tokens != null && json.usage?.completion_tokens != null
            ? {
                input: json.usage.prompt_tokens,
                output: json.usage.completion_tokens,
                ...(json.usage.prompt_tokens_details?.cached_tokens != null
                  ? { cached: json.usage.prompt_tokens_details.cached_tokens }
                  : {}),
              }
            : undefined,
      };
    },
    transcribe() {
      throw new LiveAdapterMissingError('kimi', 'transcribe');
    },
  };
}
