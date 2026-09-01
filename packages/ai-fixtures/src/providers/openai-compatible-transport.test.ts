import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdapterError } from './error.js';
import { createOpenAiCompatibleTransport } from './openai-compatible-transport.js';

describe('createOpenAiCompatibleTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts JSON to chat/completions with bearer authentication', async () => {
    const responseBody = { choices: [{ message: { content: 'hello' } }] };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://proxy.example.test/v1/',
      fetchImpl,
    });
    const body = { model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] };

    await expect(requestChatCompletion(body)).resolves.toEqual(responseBody);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('https://proxy.example.test/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  });

  it('captures the global fetch implementation when the transport is created', async () => {
    const originalFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const replacementFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', originalFetch);

    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
    });
    vi.stubGlobal('fetch', replacementFetch);

    await requestChatCompletion({ model: 'gpt-test' });
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(replacementFetch).not.toHaveBeenCalled();
  });

  it('throws one vendor-tagged network error without retrying', async () => {
    const cause = new TypeError('offline');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(cause);
    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'kimi',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
      fetchImpl,
    });

    await expect(requestChatCompletion({ model: 'kimi-test' })).rejects.toMatchObject({
      name: 'AdapterError',
      vendor: 'kimi',
      reason: 'network error',
      detail: cause,
    } satisfies Partial<AdapterError>);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws a vendor-tagged HTTP error with at most 500 response characters', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('x'.repeat(600), { status: 429 }));
    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'kimi',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
      fetchImpl,
    });

    await expect(requestChatCompletion({ model: 'kimi-test' })).rejects.toMatchObject({
      name: 'AdapterError',
      vendor: 'kimi',
      reason: 'HTTP 429',
      detail: 'x'.repeat(500),
    } satisfies Partial<AdapterError>);
  });

  it('uses a fixed fallback when the error response body cannot be read', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockRejectedValue(new Error('stream failed')),
    } as unknown as Response);
    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
      fetchImpl,
    });

    await expect(requestChatCompletion({ model: 'gpt-test' })).rejects.toMatchObject({
      name: 'AdapterError',
      vendor: 'openai',
      reason: 'HTTP 502',
      detail: '<no body>',
    } satisfies Partial<AdapterError>);
  });

  it('wraps JSON parsing failures with the provider vendor', async () => {
    const cause = new SyntaxError('bad JSON');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(cause),
    } as unknown as Response);
    const requestChatCompletion = createOpenAiCompatibleTransport({
      vendor: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
      fetchImpl,
    });

    await expect(requestChatCompletion({ model: 'gpt-test' })).rejects.toMatchObject({
      name: 'AdapterError',
      vendor: 'openai',
      reason: 'malformed JSON response',
      detail: cause,
    } satisfies Partial<AdapterError>);
  });
});
