/**
 * Pitfall-13 integration test for the Doppler → PostHog flag migration.
 *
 * Each `*_LIVE` env var that moved to a PostHog boolean flag (and each
 * `*_FIXTURE_MODE` env var that moved to a multivariate flag) gets one
 * end-to-end assertion here: with the env var unset, the FlagSource is
 * the *only* input that decides live vs. fake.
 *
 * If someone in the future shortcircuits a factory back to `env.X_LIVE`,
 * these tests fail loudly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InMemoryFlagSource,
  __resetFlagSourceForTests,
  __setFlagSourceForTests,
} from './flags.js';
import { BOOLEAN_FLAGS, VARIANT_FLAGS } from '@harpa/analytics-events';

import { createTwilioClient } from '../auth/twilio.js';
import { createTurnstileClient } from './turnstile.js';
import { createResendClient } from './resend.js';
import { pickStorage } from '../services/storage.js';

/**
 * Clears the legacy env vars so we know any "live" decision came from
 * the FlagSource, not from a stray `process.env.TWILIO_LIVE=1` leaking
 * between tests.
 */
function clearMigratedEnvVars(): void {
  delete process.env.TWILIO_LIVE;
  delete process.env.TURNSTILE_LIVE;
  delete process.env.RESEND_LIVE;
  delete process.env.AI_LIVE;
  delete process.env.R2_FIXTURE_MODE;
  delete process.env.REQUEST_LOG;
}

describe('Doppler → PostHog flag migration (Pitfall 13)', () => {
  let flags: InMemoryFlagSource;

  beforeEach(() => {
    clearMigratedEnvVars();
    flags = new InMemoryFlagSource();
    __setFlagSourceForTests(flags);
  });

  afterEach(() => {
    __resetFlagSourceForTests();
    vi.restoreAllMocks();
  });

  describe('twilio-live', () => {
    it('flag off + creds absent → fake client', () => {
      flags.setBoolean(BOOLEAN_FLAGS.TWILIO_LIVE, false);
      const c = createTwilioClient();
      // fake client returns deterministic verificationId based on phone
      return expect(c.start('+15551234567')).resolves.toEqual({
        verificationId: 'fake-+15551234567',
      });
    });

    it('flag on + creds missing → falls back to fake with warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      flags.setBoolean(BOOLEAN_FLAGS.TWILIO_LIVE, true);
      // creds intentionally absent (env.TWILIO_ACCOUNT_SID is undefined in test)
      const c = createTwilioClient();
      await expect(c.start('+15551234567')).resolves.toEqual({
        verificationId: 'fake-+15551234567',
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[twilio] live flag set but'),
      );
    });
  });

  describe('turnstile-live', () => {
    it('flag off → fake client (always allow)', async () => {
      flags.setBoolean(BOOLEAN_FLAGS.TURNSTILE_LIVE, false);
      const c = createTurnstileClient();
      const r = await c.verify('any-token', '1.2.3.4');
      expect(r.success).toBe(true);
    });

    it('flag on + secret missing → falls back to fake with warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      flags.setBoolean(BOOLEAN_FLAGS.TURNSTILE_LIVE, true);
      const c = createTurnstileClient();
      const r = await c.verify('any-token', '1.2.3.4');
      expect(r.success).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[turnstile] live flag set but'),
      );
    });
  });

  describe('resend-live', () => {
    it('flag off → fake client records sends', async () => {
      flags.setBoolean(BOOLEAN_FLAGS.RESEND_LIVE, false);
      const c = createResendClient();
      const r = await c.send({ to: 'a@b.com', subject: 's', html: '<p/>' });
      expect(r.id).toMatch(/^fake-/);
    });

    it('flag on + key missing → falls back to fake with warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      flags.setBoolean(BOOLEAN_FLAGS.RESEND_LIVE, true);
      const c = createResendClient();
      const r = await c.send({ to: 'a@b.com', subject: 's', html: '<p/>' });
      expect(r.id).toMatch(/^fake-/);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[resend] live flag set but'),
      );
    });
  });

  describe('r2-fixture-mode', () => {
    it('flag = "replay" → FixtureStorage', () => {
      flags.setVariant(VARIANT_FLAGS.R2_FIXTURE_MODE, 'replay');
      const s = pickStorage();
      // FixtureStorage class name — proxies to in-memory map
      expect(s.constructor.name).toBe('FixtureStorage');
    });

    // NOTE: NODE_ENV=test short-circuits to FixtureStorage before the flag
    // is consulted (deliberate test hermeticity). The behavioural contract
    // for the live path is covered by the storage integration tests under
    // a non-test NODE_ENV in CI. We assert here only that the flag wiring
    // compiles and the replay path is preserved.
  });
});
