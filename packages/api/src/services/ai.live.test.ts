/**
 * Pitfall 13 default-wiring test for AI live mode.
 *
 * Asserts that with `AI_LIVE=1` and the API keys set, the real provider
 * factory from `@harpa/ai-fixtures` is wired by default — chat routes
 * to api.openai.com, transcribe routes to api.groq.com. Stubs
 * `globalThis.fetch` only; the rest of the wiring (env parsing,
 * realProviderFactoryFromEnv, buildProvider) runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function okBytes(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'audio/m4a' },
  });
}

async function loadAi() {
  vi.resetModules();
  return await import('./ai.js');
}

describe('AI live default wiring', () => {
  const env = {
    AI_LIVE: process.env.AI_LIVE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  };

  beforeEach(() => {
    vi.stubEnv('AI_LIVE', '1');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test-groq');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    // Restore original env we stubbed so other tests in the same file
    // aren't affected (vitest doesn't always reset between files).
    if (env.AI_LIVE === undefined) delete process.env.AI_LIVE;
    if (env.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    if (env.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
  });

  it('summarize() with no caller fixtureName hits api.openai.com', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        okJson({ choices: [{ message: { content: 'hi' } }] }) as Response,
      );

    const { summarize } = await loadAi();
    const out = await summarize({ userPrompt: 'hello' });

    expect(out.text).toBe('hi');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(
      (init?.headers as Record<string, string> | undefined)?.['authorization'],
    ).toBe('Bearer sk-test-openai');
  });

  it('transcribe() with no caller fixtureName hits api.groq.com', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okBytes())   // fetch audio from R2
      .mockResolvedValueOnce(
        okJson({ task: 'transcribe', language: 'English', duration: 10, text: 'hello groq', segments: [] }),
      ); // Groq transcription API

    const { transcribe } = await loadAi();
    const out = await transcribe({ audioUrl: 'https://r2.example/voice.m4a?sig=abc' });

    expect(out.text).toBe('hello groq');
    expect(out.vendor).toBe('groq');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url] = fetchSpy.mock.calls[1] as FetchArgs;
    expect(String(url)).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
  });

  it('caller-supplied fixtureName forces replay even with AI_LIVE=1', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { summarize } = await loadAi();
    const out = await summarize({
      userPrompt: 'whatever',
      fixtureName: 'summarize.voice-1',
    });

    expect(typeof out.text).toBe('string');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
