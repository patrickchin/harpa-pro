/**
 * Kimi adapter unit tests — `fetch` is stubbed; no network.
 *
 * Mirrors `openai.test.ts` because the Moonshot API is OpenAI-compatible;
 * the divergent surface today is just the base URL + vendor tag, but
 * keeping a separate test file means vendor-specific quirks land here
 * later without entangling OpenAI coverage.
 */
import { describe, it, expect, vi } from 'vitest';
import { createKimiProvider } from './kimi.js';
import { LiveAdapterMissingError } from '../index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createKimiProvider — chat', () => {
  it('POSTs /chat/completions to Moonshot with bearer auth + parses content', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'hi from kimi' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    );
    const p = createKimiProvider({ apiKey: 'sk-kimi', fetchImpl });

    const out = await p.chat({
      model: 'kimi-k2-instruct',
      systemPrompt: 'be brief',
      userPrompt: 'hi',
      temperature: 0.2,
      maxTokens: 32,
    });

    expect(out.text).toBe('hi from kimi');
    expect(out.usage).toEqual({ input: 5, output: 3 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.moonshot.cn/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-kimi');
    const body = JSON.parse(init?.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature: number;
      max_tokens: number;
    };
    expect(body.model).toBe('kimi-k2-instruct');
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(32);
  });

  it('parses cached_tokens when Moonshot returns prompt_tokens_details', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'cached!' } }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 40,
          prompt_tokens_details: { cached_tokens: 150 },
        },
      }),
    );
    const p = createKimiProvider({ apiKey: 'k', fetchImpl });
    const out = await p.chat({ model: 'kimi-k2-instruct', userPrompt: 'u' });
    expect(out.usage).toEqual({ input: 200, output: 40, cached: 150 });
  });

  it('respects baseUrl override', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: 'x' } }] }),
    );
    const p = createKimiProvider({
      apiKey: 'sk',
      baseUrl: 'https://proxy.example.com/v1/',
      fetchImpl,
    });
    await p.chat({ model: 'm', userPrompt: 'u' });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('forwards response_format: json_object', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: '{}' } }] }),
    );
    const p = createKimiProvider({ apiKey: 'sk', fetchImpl });
    await p.chat({ model: 'm', userPrompt: 'u', responseFormat: 'json_object' });
    const init = fetchImpl.mock.calls[0]![1];
    const body = JSON.parse(init!.body as string) as {
      response_format: { type: string };
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on 4xx with truncated body in detail', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('bad key', { status: 401 }));
    const p = createKimiProvider({ apiKey: 'bad', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/HTTP 401/);
  });

  it('throws on network failure', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'));
    const p = createKimiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/network/);
  });

  it('throws on malformed JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const p = createKimiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/malformed/);
  });

  it('throws on missing choices content', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { choices: [] }));
    const p = createKimiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(
      /missing choices\[0\]/,
    );
  });
});

describe('createKimiProvider — transcribe', () => {
  it('throws LiveAdapterMissingError (groq owns transcription)', () => {
    const p = createKimiProvider({ apiKey: 'k' });
    expect(() => p.transcribe({ audioUrl: 'https://x' })).toThrow(LiveAdapterMissingError);
  });
});
