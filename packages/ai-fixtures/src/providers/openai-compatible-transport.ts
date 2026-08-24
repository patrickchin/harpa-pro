import { stripTrailingSlashes } from './base-url.js';
import { AdapterError } from './error.js';

interface OpenAiCompatibleTransportConfig {
  vendor: 'openai' | 'kimi';
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAiCompatibleTransport(cfg: OpenAiCompatibleTransportConfig) {
  const baseUrl = stripTrailingSlashes(cfg.baseUrl);
  const fetchFn = cfg.fetchImpl ?? fetch;

  return async (body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AdapterError(cfg.vendor, 'network error', error);
    }

    if (!response.ok) {
      throw new AdapterError(cfg.vendor, `HTTP ${response.status}`, await safeText(response));
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AdapterError(cfg.vendor, 'malformed JSON response', error);
    }
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
