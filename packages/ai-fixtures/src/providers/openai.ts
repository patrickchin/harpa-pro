/**
 * OpenAI provider adapter — chat completions only.
 *
 * Transcription is routed via the Groq adapter (whisper-large-v3-turbo)
 * so this file intentionally throws `LiveAdapterMissingError` if
 * `transcribe()` is called. See docs/v4/arch-ai-fixtures.md §Live mode.
 *
 * Uses the global `fetch` — no SDK dependency. Keeping the package
 * SDK-free means we don't ship the OpenAI SDK on the Fly machine just
 * to make one HTTPS call (cold-start cost, install time, supply-chain
 * surface). The request shape is the documented `/v1/chat/completions`
 * REST contract; we don't need streaming.
 */
import {
  type AiProvider,
  type ChatRequest,
  type ChatResponse,
  LiveAdapterMissingError,
} from '../index.js';
import { AdapterError } from './error.js';

export interface OpenAiAdapterConfig {
  apiKey: string;
  /** Override base URL — defaults to `https://api.openai.com/v1`. */
  baseUrl?: string;
  /** Override the global fetch (test-only). */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenAiProvider(cfg: OpenAiAdapterConfig): AiProvider {
  const baseUrl = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const fetchFn = cfg.fetchImpl ?? fetch;

  return {
    vendor: 'openai',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
      messages.push({ role: 'user', content: req.userPrompt });

      const body = {
        model: req.model,
        messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
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
        throw new AdapterError('openai', 'network error', err);
      }

      if (!res.ok) {
        const detail = await safeText(res);
        throw new AdapterError('openai', `HTTP ${res.status}`, detail);
      }

      let json: ChatCompletionResponse;
      try {
        json = (await res.json()) as ChatCompletionResponse;
      } catch (err) {
        throw new AdapterError('openai', 'malformed JSON response', err);
      }

      const text = json.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new AdapterError('openai', 'missing choices[0].message.content');
      }

      return {
        text,
        usage:
          json.usage?.prompt_tokens != null && json.usage?.completion_tokens != null
            ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens }
            : undefined,
      };
    },
    transcribe() {
      throw new LiveAdapterMissingError('openai', 'transcribe');
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
