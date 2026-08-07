/**
 * OpenAI adapter unit tests — `fetch` is stubbed; no network.
 */
import { describe, it, expect, vi } from 'vitest';
import { createOpenAiProvider } from './openai.js';
import { LiveAdapterMissingError } from '../index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createOpenAiProvider — chat', () => {
  it('POSTs /chat/completions with bearer auth + parses content', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'hello world' } }],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      }),
    );
    const p = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });

    const out = await p.chat({
      model: 'gpt-4o-mini',
      systemPrompt: 'be brief',
      userPrompt: 'hi',
      temperature: 0.2,
      maxTokens: 32,
    });

    expect(out.text).toBe('hello world');
    expect(out.usage).toEqual({ input: 4, output: 2 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init?.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature: number;
      max_tokens: number;
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(32);
  });

  it('parses cached_tokens from prompt_tokens_details', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'cached!' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 75 },
        },
      }),
    );
    const p = createOpenAiProvider({ apiKey: 'sk', fetchImpl });
    const out = await p.chat({ model: 'gpt-4o', userPrompt: 'u' });
    expect(out.usage).toEqual({ input: 100, output: 20, cached: 75 });
  });

  it('omits cached when prompt_tokens_details absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'no-cache' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );
    const p = createOpenAiProvider({ apiKey: 'sk', fetchImpl });
    const out = await p.chat({ model: 'm', userPrompt: 'u' });
    expect(out.usage).toEqual({ input: 10, output: 3 });
    expect(out.usage).not.toHaveProperty('cached');
  });

  it('respects baseUrl override', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: 'x' } }] }));
    const p = createOpenAiProvider({
      apiKey: 'sk',
      baseUrl: 'https://proxy.example.com/v1/',
      fetchImpl,
    });
    await p.chat({ model: 'm', userPrompt: 'u' });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('normalizes adversarial base URLs without polynomial backtracking', () => {
    const baseUrl = `https://proxy.example.com/${'/'.repeat(20_000)}x`;
    const started = performance.now();

    createOpenAiProvider({ apiKey: 'sk', baseUrl, fetchImpl: vi.fn() });

    expect(performance.now() - started).toBeLessThan(250);
  });

  it('throws on 4xx with truncated body in detail', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('bad key', { status: 401 }));
    const p = createOpenAiProvider({ apiKey: 'bad', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/HTTP 401/);
  });

  it('throws on 5xx', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('boom', { status: 502 }));
    const p = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/HTTP 502/);
  });

  it('throws on network failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const p = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/network/);
  });

  it('throws on malformed JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const p = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/malformed/);
  });

  it('throws on missing choices content', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { choices: [] }));
    const p = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    await expect(p.chat({ model: 'm', userPrompt: 'u' })).rejects.toThrow(/missing choices\[0\]/);
  });
});

describe('createOpenAiProvider — transcribe', () => {
  it('throws LiveAdapterMissingError (groq owns transcription)', () => {
    const p = createOpenAiProvider({ apiKey: 'k' });
    expect(() => p.transcribe({ audioUrl: 'https://x' })).toThrow(LiveAdapterMissingError);
  });
});
