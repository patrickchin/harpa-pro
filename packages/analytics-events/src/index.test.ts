import { describe, it, expect } from 'vitest';
import {
  API_EVENTS,
  MARKETING_EVENTS,
  MOBILE_EVENTS,
  baseEventPropsSchema,
  eventSchemas,
  type EventName,
} from './index.js';
import {
  BOOLEAN_FLAGS,
  FLAG_FAILSAFE_DEFAULTS,
  VARIANT_FLAGS,
} from './flags.js';

describe('event taxonomy', () => {
  it('all event names have a matching schema entry', () => {
    const allNames: EventName[] = [
      ...Object.values(MARKETING_EVENTS),
      ...Object.values(MOBILE_EVENTS),
      ...Object.values(API_EVENTS),
    ];
    for (const name of allNames) {
      expect(eventSchemas[name], `missing schema for ${name}`).toBeDefined();
    }
  });

  it('event names are snake_case and globally unique', () => {
    const allNames = [
      ...Object.values(MARKETING_EVENTS),
      ...Object.values(MOBILE_EVENTS),
      ...Object.values(API_EVENTS),
    ];
    const seen = new Set<string>();
    for (const name of allNames) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(seen.has(name), `duplicate event name ${name}`).toBe(false);
      seen.add(name);
    }
  });

  it('baseEventPropsSchema rejects unknown surface', () => {
    const result = baseEventPropsSchema.safeParse({
      surface: 'desktop',
      env: 'production',
    });
    expect(result.success).toBe(false);
  });

  it('schemas reject invalid payloads', () => {
    const r = eventSchemas[MOBILE_EVENTS.OTP_VERIFIED].safeParse({ attempts: 0 });
    expect(r.success).toBe(false);
  });

  it('schemas accept valid payloads', () => {
    const r = eventSchemas[API_EVENTS.REPORT_GENERATED].safeParse({
      report_id: 'rpt_1',
      provider: 'openai',
      duration_ms: 1200,
    });
    expect(r.success).toBe(true);
  });
});

describe('flag taxonomy', () => {
  it('every flag has a fail-safe default', () => {
    const allKeys = [
      ...Object.values(BOOLEAN_FLAGS),
      ...Object.values(VARIANT_FLAGS),
    ];
    for (const key of allKeys) {
      expect(
        FLAG_FAILSAFE_DEFAULTS[key as keyof typeof FLAG_FAILSAFE_DEFAULTS],
        `missing failsafe for ${key}`,
      ).toBeDefined();
    }
  });

  it('boolean kill-switches default to false (never bill on outage)', () => {
    for (const key of Object.values(BOOLEAN_FLAGS)) {
      expect(FLAG_FAILSAFE_DEFAULTS[key]).toBe(false);
    }
  });

  it('fixture-mode variants default to replay', () => {
    expect(FLAG_FAILSAFE_DEFAULTS[VARIANT_FLAGS.AI_FIXTURE_MODE]).toBe('replay');
    expect(FLAG_FAILSAFE_DEFAULTS[VARIANT_FLAGS.R2_FIXTURE_MODE]).toBe('replay');
  });
});
