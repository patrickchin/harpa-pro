import { describe, expect, it } from 'vitest';

import * as schemas from './index.js';

const MIB = 1024 * 1024;

describe('billing schemas', () => {
  it('parses a verified Pro entitlement sync response', () => {
    const billing = (
      schemas as typeof schemas & {
        billing?: {
          billingSyncResponse: {
            parse: (input: unknown) => unknown;
          };
        };
      }
    ).billing;

    expect(billing).toBeDefined();
    expect(
      billing!.billingSyncResponse.parse({
        plan: 'pro',
        entitlement: {
          entitlementId: 'pro',
          productId: 'harpa_pro_monthly',
          store: 'app_store',
          active: true,
          expiresAt: '2026-08-01T00:00:00Z',
          managementUrl: 'https://apps.apple.com/account/subscriptions',
          syncedAt: '2026-07-05T01:02:03Z',
        },
      }),
    ).toEqual({
      plan: 'pro',
      entitlement: {
        entitlementId: 'pro',
        productId: 'harpa_pro_monthly',
        store: 'app_store',
        active: true,
        expiresAt: '2026-08-01T00:00:00.000Z',
        managementUrl: 'https://apps.apple.com/account/subscriptions',
        syncedAt: '2026-07-05T01:02:03.000Z',
      },
    });
  });

  it('parses a Free sync response without an entitlement', () => {
    const billing = (
      schemas as typeof schemas & {
        billing?: {
          billingSyncResponse: {
            parse: (input: unknown) => unknown;
          };
        };
      }
    ).billing;

    expect(billing).toBeDefined();
    expect(
      billing!.billingSyncResponse.parse({ plan: 'free', entitlement: null }),
    ).toEqual({ plan: 'free', entitlement: null });
  });
});

describe('plan file-size contracts', () => {
  it('preserves the effective file-size limit on limits responses', () => {
    const parsed = schemas.usageLimits.limitsResponse.parse({
      plan: 'free',
      buckets: [],
      fileSizeLimitBytes: 5 * MIB,
    });

    expect(parsed.fileSizeLimitBytes).toBe(5 * MIB);
  });

  it('parses stable oversized-file error details', () => {
    const fileSchemas = schemas.files as typeof schemas.files & {
      fileSizeLimitExceededDetails?: {
        parse: (input: unknown) => unknown;
      };
    };

    expect(fileSchemas.fileSizeLimitExceededDetails).toBeDefined();
    expect(
      fileSchemas.fileSizeLimitExceededDetails!.parse({
        sizeBytes: 5 * MIB + 1,
        limitBytes: 5 * MIB,
        plan: 'free',
      }),
    ).toEqual({
      sizeBytes: 5 * MIB + 1,
      limitBytes: 5 * MIB,
      plan: 'free',
    });
  });

  it('accepts exactly 50 MiB for presign and registration', () => {
    const presign = schemas.files.presignRequest.parse({
      scope: 'scratch',
      kind: 'voice',
      contentType: 'audio/m4a',
      sizeBytes: 50 * MIB,
    });
    const register = schemas.files.registerFileRequest.parse({
      scope: 'scratch',
      kind: 'voice',
      fileKey: 'users/usr_test/scratch/fil_test.m4a',
      contentType: 'audio/m4a',
      sizeBytes: 50 * MIB,
    });

    expect(presign.sizeBytes).toBe(50 * MIB);
    expect(register.sizeBytes).toBe(50 * MIB);
  });

  it('rejects values over 50 MiB for presign and registration', () => {
    const oversizedPresign = {
      scope: 'scratch',
      kind: 'document',
      contentType: 'application/pdf',
      sizeBytes: 50 * MIB + 1,
    };
    const oversizedRegister = {
      scope: 'scratch',
      kind: 'document',
      fileKey: 'users/usr_test/scratch/fil_test.pdf',
      contentType: 'application/pdf',
      sizeBytes: 50 * MIB + 1,
    };

    expect(() => schemas.files.presignRequest.parse(oversizedPresign)).toThrow();
    expect(() => schemas.files.registerFileRequest.parse(oversizedRegister)).toThrow();
  });
});
