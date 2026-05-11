import { describe, it, expect } from 'vitest';
import * as schemas from './schemas/index.js';

describe('api-contract', () => {
  it('exports all resource schema namespaces', () => {
    expect(schemas.auth).toBeDefined();
    expect(schemas.projects).toBeDefined();
    expect(schemas.reports).toBeDefined();
    expect(schemas.notes).toBeDefined();
    expect(schemas.files).toBeDefined();
    expect(schemas.voice).toBeDefined();
    expect(schemas.settings).toBeDefined();
  });

  it('isoDateTime accepts ISO-8601 and rejects garbage', () => {
    expect(schemas.isoDateTime.parse('2026-05-12T00:00:00Z')).toBe('2026-05-12T00:00:00.000Z');
    expect(() => schemas.isoDateTime.parse('not-a-date')).toThrow();
  });

  it('phone enforces E.164', () => {
    const { phone } = schemas;
    expect(phone.parse('+447777777777')).toBe('+447777777777');
    expect(() => phone.parse('07777 777777')).toThrow();
  });

  it('errorEnvelope shape', () => {
    schemas.errorEnvelope.parse({ error: { code: 'X', message: 'y' } });
  });
});
