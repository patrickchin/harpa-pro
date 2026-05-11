import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProvider,
  hashRequest,
  redact,
  FixtureMissError,
  LiveModeForbiddenError,
} from './index.js';

describe('hashRequest', () => {
  it('is order-independent for object keys', () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
  });
  it('differs by value', () => {
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
  });
});

describe('redact', () => {
  it('strips phone, email, uuid, openai keys, bearer tokens', () => {
    const out = redact({
      phone: '+447777777777',
      email: 'alice@example.com',
      id: 'b3a1b8c8-1234-4abc-8def-0123456789ab',
      headers: { Authorization: 'Bearer abcdef', 'x-api-key': 'sk-live-1' },
      body: 'sk-test_AAAAAAAAAAAAAAAAAAAAA',
    }) as Record<string, unknown>;
    expect(out.phone).toBe('+10000000000');
    expect(out.email).toBe('redacted@example.com');
    expect(out.id).toBe('00000000-0000-0000-0000-000000000000');
    expect((out.headers as Record<string, string>).Authorization).toBe('<redacted>');
    expect(out.body).toBe('sk-redacted');
  });
});

describe('createProvider replay', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aifx-'));
    const requestHash = hashRequest({
      kind: 'transcribe',
      vendor: 'openai',
      audioUrl: 'https://example/x.m4a',
    });
    writeFileSync(
      join(dir, 'transcribe.test.json'),
      JSON.stringify({
        vendor: 'openai',
        model: 'whisper-1',
        fixtureName: 'transcribe.test',
        recordedAt: '2026-05-12T00:00:00.000Z',
        requestHash,
        request: {},
        response: { text: 'hello world', durationSec: 1 },
      }),
    );
  });

  it('replays a matching fixture', async () => {
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'transcribe.test',
      fixturesDir: dir,
    });
    const r = await p.transcribe({ audioUrl: 'https://example/x.m4a' });
    expect(r.text).toBe('hello world');
  });

  it('throws FixtureMissError on hash mismatch', async () => {
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'transcribe.test',
      fixturesDir: dir,
    });
    await expect(p.transcribe({ audioUrl: 'https://example/different.m4a' })).rejects.toBeInstanceOf(
      FixtureMissError,
    );
  });

  it('throws on missing fixture', async () => {
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'does-not-exist',
      fixturesDir: dir,
    });
    await expect(p.transcribe({ audioUrl: 'x' })).rejects.toBeInstanceOf(FixtureMissError);
  });
});

describe('createProvider record', () => {
  it('writes fixtures via the realProviderFactory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aifx-rec-'));
    const p = createProvider(
      { vendor: 'openai', fixtureMode: 'record', fixtureName: 'recme', fixturesDir: dir },
      () => ({
        vendor: 'openai',
        async chat() {
          throw new Error('not used');
        },
        async transcribe() {
          return { text: 'recorded', durationSec: 0.5 };
        },
      }),
    );
    const r = await p.transcribe({ audioUrl: 'https://example/r.m4a' });
    expect(r.text).toBe('recorded');
    const written = JSON.parse(readFileSync(join(dir, 'recme.json'), 'utf8'));
    expect(written.response.text).toBe('recorded');
    expect(written.requestHash).toMatch(/^sha256:/);
  });
});

describe('createProvider live', () => {
  it('refuses without AI_LIVE=1', () => {
    const old = process.env.AI_LIVE;
    delete process.env.AI_LIVE;
    expect(() =>
      createProvider({ vendor: 'openai', fixtureMode: 'live' }, () => ({}) as never),
    ).toThrow(LiveModeForbiddenError);
    if (old) process.env.AI_LIVE = old;
  });
});
