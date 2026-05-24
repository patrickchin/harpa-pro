/**
 * Kimi (Moonshot) provider adapter — chat completions only.
 *
 * Moonshot exposes an OpenAI-compatible REST surface at
 * `https://api.moonshot.cn/v1` — the request/response shape mirrors
 * OpenAI's `/v1/chat/completions`, including `usage.prompt_tokens` /
 * `usage.completion_tokens` and (for cache-eligible accounts)
 * `usage.prompt_tokens_details.cached_tokens`. We model the adapter
 * on `openai.ts` rather than reusing it so that future Moonshot-only
 * quirks (model id rewrites, vendor-specific error shapes, request
 * pricing headers) can land here without touching OpenAI.
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
  const baseUrl = (cfg.baseUrl ?? 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
  const fetchFn = cfg.fetchImpl ?? fetch;

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

      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${cfg.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new AdapterError('kimi', 'network error', err);
      }

      if (!res.ok) {
        const detail = await safeText(res);
        throw new AdapterError('kimi', `HTTP ${res.status}`, detail);
      }

      let json: ChatCompletionResponse;
      try {
        json = (await res.json()) as ChatCompletionResponse;
      } catch (err) {
        throw new AdapterError('kimi', 'malformed JSON response', err);
      }

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

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
