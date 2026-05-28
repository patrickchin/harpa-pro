/**
 * Unit tests for storage abstraction.
 *
 * Two angles:
 *   1. FixtureStorage — already exercised by /files integration tests;
 *      we cover the deterministic-key shape directly here for speed.
 *   2. R2Storage — wired with an in-memory S3-compatible mock so we
 *      exercise the *default* code path (Pitfall 13). The mock honors
 *      enough of the S3 contract that `getSignedUrl` produces a
 *      well-formed signed URL and `PutObjectCommand` round-trips.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { FixtureStorage, R2Storage } from './storage.js';

describe('FixtureStorage', () => {
  const fx = new FixtureStorage();

  it('builds keys under users/<id>/<kind>/ with a kind-appropriate extension', async () => {
    const out = await fx.presign({
      scope: { kind: 'scratch', userId: 'usr-1abc234d', fileKind: 'voice' },
      contentType: 'audio/m4a',
      sizeBytes: 100,
    });
    expect(out.fileKey).toMatch(
      /^users\/usr-1abc234d\/scratch\/fil_[0-9a-hjkmnp-tv-z]+\.m4a$/,
    );
    expect(out.uploadUrl).toContain(encodeURIComponent(out.fileKey));
  });

  it('signGet returns a URL that references the supplied key', async () => {
    const out = await fx.signGet('users/usr-1abc234d/scratch/abc.jpg');
    expect(out.url).toContain(encodeURIComponent('users/usr-1abc234d/scratch/abc.jpg'));
  });

  it('putObject builds a server-side key and reports byte length', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const out = await fx.putObject({
      scope: {
        kind: 'project',
        userId: 'usr-2abc234d',
        projectId: 'prj-1abc234d',
        reportId: 'rpt-1abc234d',
        fileKind: 'pdf',
      },
      contentType: 'application/pdf',
      bytes,
    });
    expect(
      out.fileKey.startsWith('projects/prj-1abc234d/reports/rpt-1abc234d/'),
    ).toBe(true);
    expect(out.fileKey.endsWith('.pdf')).toBe(true);
    expect(out.sizeBytes).toBe(4);
  });
});

describe('R2Storage (with injected S3 client)', () => {
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://test.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'AKIATEST', secretAccessKey: 'secret' },
    forcePathStyle: true,
  });

  it('presign mints a signed URL referencing the server-built key', async () => {
    const r2 = new R2Storage({ client, bucket: 'harpa-test', ttlSec: 120 });
    const out = await r2.presign({
      scope: { kind: 'scratch', userId: 'usr-1abc234d', fileKind: 'image' },
      contentType: 'image/jpeg',
      sizeBytes: 4096,
    });
    expect(out.fileKey).toMatch(
      /^users\/usr-1abc234d\/scratch\/fil_[0-9a-hjkmnp-tv-z]+\.jpg$/,
    );
    // Path-style URL is `/<bucket>/<key>`.
    const url = new URL(out.uploadUrl);
    expect(url.hostname).toBe('test.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/harpa-test/${out.fileKey}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('signGet mints a signed GET URL', async () => {
    const r2 = new R2Storage({ client, bucket: 'harpa-test', ttlSec: 60 });
    const out = await r2.signGet('users/usr-1abc234d/scratch/foo.m4a');
    const url = new URL(out.url);
    expect(url.pathname).toBe('/harpa-test/users/usr-1abc234d/scratch/foo.m4a');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('putObject issues a PutObjectCommand carrying the bytes', async () => {
    // Spy on client.send rather than fronting a real http server. Per
    // Pitfall 13 we still exercise the *real* R2Storage code — only the
    // network boundary is stubbed.
    const send = vi.spyOn(client, 'send').mockResolvedValue({} as never);
    const r2 = new R2Storage({ client, bucket: 'harpa-test' });
    const out = await r2.putObject({
      scope: {
        kind: 'project',
        userId: 'usr-3abc234d',
        projectId: 'prj-2abc234d',
        reportId: 'rpt-2abc234d',
        fileKind: 'pdf',
      },
      contentType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(out.sizeBytes).toBe(3);
    expect(out.fileKey).toMatch(
      /^projects\/prj-2abc234d\/reports\/rpt-2abc234d\/.+\.pdf$/,
    );
    const cmd = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Bucket).toBe('harpa-test');
    expect(cmd.input.Key).toBe(out.fileKey);
    expect(cmd.input.ContentType).toBe('application/pdf');
    expect(cmd.input.ContentLength).toBe(3);
    send.mockRestore();
  });
});

describe('pickStorage()', () => {
  // pickStorage now reads `env.R2_FIXTURE_MODE` (Zod-parsed at boot,
  // per Pitfall 13) instead of poking raw process.env. To toggle the
  // mode in unit tests we have to reset the module graph so env.ts
  // reparses against the temporary `process.env` shape.
  const original = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.R2_FIXTURE_MODE;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it('returns FixtureStorage when R2_FIXTURE_MODE=replay (env default)', async () => {
    process.env.R2_FIXTURE_MODE = 'replay';
    const { pickStorage: fresh, FixtureStorage: FS } = await import('./storage.js');
    expect(fresh()).toBeInstanceOf(FS);
  });

  it('returns FixtureStorage when R2_FIXTURE_MODE is unset (default replay)', async () => {
    const { pickStorage: fresh, FixtureStorage: FS } = await import('./storage.js');
    expect(fresh()).toBeInstanceOf(FS);
  });

  it('returns R2Storage when R2_FIXTURE_MODE=live + R2 creds present', async () => {
    process.env.R2_FIXTURE_MODE = 'live';
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    const { pickStorage: fresh, R2Storage: R2 } = await import('./storage.js');
    expect(fresh()).toBeInstanceOf(R2);
  });
});
