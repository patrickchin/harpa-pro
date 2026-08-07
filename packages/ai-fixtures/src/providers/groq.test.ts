/**
 * Groq adapter unit tests — `fetch` is stubbed; no network.
 */
import { describe, it, expect, vi } from 'vitest';
import { createGroqProvider } from './groq.js';
import { LiveAdapterMissingError } from '../index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function audioResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'audio/m4a' },
  });
}

describe('createGroqProvider — transcribe', () => {
  it('fetches audio from URL then POSTs multipart to /audio/transcriptions', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(jsonResponse(200, { text: 'site arrival 8:15', duration: 22.4 }));
    const p = createGroqProvider({ apiKey: 'gsk-test', fetchImpl });

    const out = await p.transcribe({ audioUrl: 'https://r2.example/audio.m4a' });

    expect(out.text).toBe('site arrival 8:15');
    expect(out.durationSec).toBe(22.4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // First call: fetch the audio URL (no auth).
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://r2.example/audio.m4a');

    // Second call: POST multipart to Groq.
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer gsk-test');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('passes language through when provided', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(jsonResponse(200, { text: 'hola' }));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await p.transcribe({ audioUrl: 'https://r2/x', language: 'es' });
    const form = fetchImpl.mock.calls[1]![1]?.body as FormData;
    expect(form.get('language')).toBe('es');
  });

  it('respects baseUrl + model overrides', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(jsonResponse(200, { text: 'x' }));
    const p = createGroqProvider({
      apiKey: 'k',
      baseUrl: 'https://groq.proxy/v1/',
      model: 'distil-whisper-large-v3-en',
      fetchImpl,
    });
    await p.transcribe({ audioUrl: 'https://r2/x' });
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://groq.proxy/v1/audio/transcriptions');
    const form = fetchImpl.mock.calls[1]![1]?.body as FormData;
    expect(form.get('model')).toBe('distil-whisper-large-v3-en');
  });

  it('normalizes adversarial base URLs without polynomial backtracking', () => {
    const baseUrl = `https://groq.proxy/${'/'.repeat(20_000)}x`;
    const started = performance.now();

    createGroqProvider({ apiKey: 'k', baseUrl, fetchImpl: vi.fn() });

    expect(performance.now() - started).toBeLessThan(250);
  });

  it('throws when the audio URL itself returns non-OK', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(
      /audio source HTTP 404/,
    );
  });

  it('throws on 4xx from Groq', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(new Response('bad key', { status: 401 }));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(/HTTP 401/);
  });

  it('throws on 5xx from Groq', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(/HTTP 503/);
  });

  it('throws on network failure when calling Groq', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(/network/);
  });

  it('throws on malformed JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(
        new Response('not json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(/malformed/);
  });

  it('throws when text field missing', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(jsonResponse(200, { duration: 1 }));
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    await expect(p.transcribe({ audioUrl: 'https://r2/x' })).rejects.toThrow(/missing `text`/);
  });
});

describe('createGroqProvider — chat', () => {
  it('throws LiveAdapterMissingError (openai owns chat)', () => {
    const p = createGroqProvider({ apiKey: 'k' });
    expect(() => p.chat({ model: 'm', userPrompt: 'x' })).toThrow(LiveAdapterMissingError);
  });
});
