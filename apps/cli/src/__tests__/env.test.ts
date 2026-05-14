import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseEnv, formatEnvError } from '../lib/env.js';

describe('parseEnv', () => {
  it('parses a minimal valid env', () => {
    const env = parseEnv({
      HARPA_API_URL: 'http://localhost:8787',
    } as NodeJS.ProcessEnv);
    expect(env.HARPA_API_URL).toBe('http://localhost:8787');
    expect(env.HARPA_TOKEN).toBeUndefined();
    expect(env.HARPA_DEBUG).toBe('0');
    expect(env.HARPA_IDEMPOTENCY_KEY).toBeUndefined();
  });

  it('threads optional vars through', () => {
    const env = parseEnv({
      HARPA_API_URL: 'https://api.harpapro.com',
      HARPA_TOKEN: 'tok_abc',
      HARPA_DEBUG: '1',
      HARPA_IDEMPOTENCY_KEY: 'idem-key-1',
    } as NodeJS.ProcessEnv);
    expect(env.HARPA_TOKEN).toBe('tok_abc');
    expect(env.HARPA_DEBUG).toBe('1');
    expect(env.HARPA_IDEMPOTENCY_KEY).toBe('idem-key-1');
  });

  it('rejects when HARPA_API_URL is missing', () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow();
  });

  it('rejects when HARPA_API_URL is not a URL', () => {
    expect(() => parseEnv({ HARPA_API_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('rejects when HARPA_DEBUG is invalid', () => {
    expect(() =>
      parseEnv({
        HARPA_API_URL: 'http://localhost:8787',
        HARPA_DEBUG: 'yes',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('rejects empty HARPA_TOKEN', () => {
    expect(() =>
      parseEnv({
        HARPA_API_URL: 'http://localhost:8787',
        HARPA_TOKEN: '',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});

describe('formatEnvError', () => {
  it('produces a human-readable summary', () => {
    let caught: z.ZodError | undefined;
    try {
      parseEnv({} as NodeJS.ProcessEnv);
    } catch (err) {
      if (err instanceof z.ZodError) caught = err;
    }
    expect(caught).toBeDefined();
    const msg = formatEnvError(caught!);
    expect(msg).toMatch(/Invalid CLI environment/);
    expect(msg).toMatch(/HARPA_API_URL/);
    expect(msg).toMatch(/Required: HARPA_API_URL/);
  });

  it('lists every offending field', () => {
    let caught: z.ZodError | undefined;
    try {
      parseEnv({ HARPA_API_URL: 'bad', HARPA_DEBUG: 'maybe' } as NodeJS.ProcessEnv);
    } catch (err) {
      if (err instanceof z.ZodError) caught = err;
    }
    const msg = formatEnvError(caught!);
    expect(msg).toMatch(/HARPA_API_URL/);
    expect(msg).toMatch(/HARPA_DEBUG/);
  });
});
