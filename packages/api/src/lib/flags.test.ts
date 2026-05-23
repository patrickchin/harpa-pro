import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryFlagSource,
  PostHogFlagSource,
  createFlagSource,
  systemDistinctId,
  __resetFlagSourceForTests,
  getFlagSource,
} from './flags.js';
import { BOOLEAN_FLAGS, VARIANT_FLAGS } from '@harpa/analytics-events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('InMemoryFlagSource', () => {
  it('returns set boolean values', () => {
    const s = new InMemoryFlagSource().setBoolean(BOOLEAN_FLAGS.TWILIO_LIVE, true);
    expect(s.getBooleanFlag(BOOLEAN_FLAGS.TWILIO_LIVE)).toBe(true);
  });

  it('returns failsafe default when not set', () => {
    const s = new InMemoryFlagSource();
    expect(s.getBooleanFlag(BOOLEAN_FLAGS.TWILIO_LIVE)).toBe(false);
    expect(s.getBooleanFlag(BOOLEAN_FLAGS.AI_LIVE)).toBe(false);
  });

  it('honours explicit caller default over failsafe', () => {
    const s = new InMemoryFlagSource();
    expect(s.getBooleanFlag(BOOLEAN_FLAGS.AI_LIVE, true)).toBe(true);
  });

  it('returns set variant', () => {
    const s = new InMemoryFlagSource().setVariant(VARIANT_FLAGS.AI_FIXTURE_MODE, 'live');
    expect(s.getVariantFlag(VARIANT_FLAGS.AI_FIXTURE_MODE, 'replay')).toBe('live');
  });

  it('returns default variant when unset', () => {
    const s = new InMemoryFlagSource();
    expect(s.getVariantFlag(VARIANT_FLAGS.R2_FIXTURE_MODE, 'replay')).toBe('replay');
  });
});

describe('systemDistinctId', () => {
  it('namespaces by env', () => {
    expect(systemDistinctId('production')).toBe('system:harpa-api-production');
    expect(systemDistinctId('development')).toBe('system:harpa-api-development');
  });
});

describe('createFlagSource', () => {
  beforeEach(() => __resetFlagSourceForTests());

  it('returns an in-memory stub in NODE_ENV=test', () => {
    const s = createFlagSource();
    expect(s.isStub()).toBe(true);
  });

  it('getFlagSource memoises', () => {
    const a = getFlagSource();
    const b = getFlagSource();
    expect(a).toBe(b);
  });
});

describe('PostHogFlagSource disk cache hydration', () => {
  it('seeds in-memory cache from disk on construction', () => {
    const file = path.join(os.tmpdir(), `harpa-flags-test-${Date.now()}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        booleans: { 'twilio-live': true },
        variants: { 'ai-fixture-mode': 'live' },
        updatedAt: Date.now(),
      }),
    );

    const src = new PostHogFlagSource({
      apiKey: 'phc_test',
      personalApiKey: 'phx_test',
      cachePath: file,
      host: 'http://127.0.0.1:1', // unreachable; we only care about the seed
    });

    // The first read may also fire a fire-and-forget refresh that fails;
    // we just want the seeded value to win.
    expect(src.getBooleanFlag(BOOLEAN_FLAGS.TWILIO_LIVE)).toBe(true);
    expect(src.getVariantFlag(VARIANT_FLAGS.AI_FIXTURE_MODE, 'replay')).toBe('live');

    // Should always return some value, never throw, even if PostHog is dead.
    expect(src.getBooleanFlag(BOOLEAN_FLAGS.AI_LIVE)).toBe(false); // failsafe
    expect(src.getVariantFlag(VARIANT_FLAGS.R2_FIXTURE_MODE, 'replay')).toBe('replay');

    fs.unlinkSync(file);
    // Don't await shutdown — we don't want flaky tests if PostHog timeouts
    void src.shutdown().catch(() => {});
  });

  it('returns failsafe defaults when no cache exists and PostHog unreachable', () => {
    const file = path.join(os.tmpdir(), `harpa-flags-missing-${Date.now()}.json`);
    const src = new PostHogFlagSource({
      apiKey: 'phc_test',
      personalApiKey: 'phx_test',
      cachePath: file,
      host: 'http://127.0.0.1:1',
    });

    expect(src.getBooleanFlag(BOOLEAN_FLAGS.TWILIO_LIVE)).toBe(false);
    expect(src.getBooleanFlag(BOOLEAN_FLAGS.AI_LIVE)).toBe(false);
    expect(src.getVariantFlag(VARIANT_FLAGS.AI_FIXTURE_MODE, 'replay')).toBe('replay');

    void src.shutdown().catch(() => {});
  });
});
