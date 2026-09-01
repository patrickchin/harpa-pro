import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { operations } from './index.js';
import * as schemas from './schemas/index.js';

interface PackageManifest {
  exports?: Record<string, string>;
}

describe('api-contract', () => {
  it('exports all resource schema namespaces', () => {
    expect(schemas.auth).toBeDefined();
    expect(schemas.projects).toBeDefined();
    expect(schemas.reports).toBeDefined();
    expect(schemas.notes).toBeDefined();
    expect(schemas.files).toBeDefined();
    expect(schemas.voice).toBeDefined();
    expect(schemas.settings).toBeDefined();
    expect(operations.neonInventoryObservation).toBeDefined();
    expect(operations.sentryObservation).toBeDefined();
    expect(schemas.operations.sentryObservation).toBe(operations.sentryObservation);
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
    expect(
      schemas.errorEnvelope.parse({
        error: { code: 'X', message: 'y' },
        requestId: 'req-contract-1',
      }),
    ).toEqual({
      error: { code: 'X', message: 'y' },
      requestId: 'req-contract-1',
    });

    expect(() =>
      schemas.errorEnvelope.parse({
        error: { code: 'X', message: 'y' },
      }),
    ).toThrow();

    expect(() =>
      schemas.errorEnvelope.parse({
        error: { code: 'X', message: 'y', requestId: 'nested-wrongly' },
        requestId: 'req-contract-1',
      }),
    ).toThrow();

    expect(() =>
      schemas.errorEnvelope.parse({
        error: { code: 'X', message: 'y' },
        requestId: 'req-contract-1',
        unexpected: true,
      }),
    ).toThrow();
  });

  it('only exports files that exist', () => {
    const packageRoot = new URL('../', import.meta.url);
    const manifest = JSON.parse(
      readFileSync(new URL('package.json', packageRoot), 'utf8'),
    ) as PackageManifest;

    for (const target of Object.values(manifest.exports ?? {})) {
      expect(existsSync(new URL(target, packageRoot)), target).toBe(true);
    }
  });
});
