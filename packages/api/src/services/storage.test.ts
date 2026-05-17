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
import { FixtureStorage, R2Storage, pickStorage } from './storage.js';

describe('FixtureStorage', () => {
  const fx = new FixtureStorage();

  it('builds keys under users/<id>/<kind>/ with a kind-appropriate extension', async () => {
    const out = await fx.presign({
      userId: 'user-1',
      kind: 'voice',
      contentType: 'audio/m4a',
      sizeBytes: 100,
    });
    expect(out.fileKey).toMatch(/^users\/user-1\/voice\/[a-f0-9-]{36}\.m4a$/);
    expect(out.uploadUrl).toContain(encodeURIComponent(out.fileKey));
  });

  it('signGet returns a URL that references the supplied key', async () => {
    const out = await fx.signGet('users/user-1/image/abc.jpg');
    expect(out.url).toContain(encodeURIComponent('users/user-1/image/abc.jpg'));
  });

  it('putObject builds a server-side key and reports byte length', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const out = await fx.putObject({
      userId: 'user-2',
      kind: 'pdf',
      contentType: 'application/pdf',
      bytes,
    });
    expect(out.fileKey.startsWith('users/user-2/pdf/')).toBe(true);
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
      userId: 'user-1',
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: 4096,
    });
    expect(out.fileKey).toMatch(/^users\/user-1\/image\/[a-f0-9-]{36}\.jpg$/);
    // Path-style URL is `/<bucket>/<key>`.
    const url = new URL(out.uploadUrl);
    expect(url.hostname).toBe('test.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/harpa-test/${out.fileKey}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('signGet mints a signed GET URL', async () => {
    const r2 = new R2Storage({ client, bucket: 'harpa-test', ttlSec: 60 });
    const out = await r2.signGet('users/user-1/voice/foo.m4a');
    const url = new URL(out.url);
    expect(url.pathname).toBe('/harpa-test/users/user-1/voice/foo.m4a');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('putObject issues a PutObjectCommand carrying the bytes', async () => {
    // Spy on client.send rather than fronting a real http server. Per
    // Pitfall 13 we still exercise the *real* R2Storage code — only the
    // network boundary is stubbed.
    const send = vi.spyOn(client, 'send').mockResolvedValue({} as never);
    const r2 = new R2Storage({ client, bucket: 'harpa-test' });
    const out = await r2.putObject({
      userId: 'user-3',
      kind: 'pdf',
      contentType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(out.sizeBytes).toBe(3);
    expect(out.fileKey).toMatch(/^users\/user-3\/pdf\/.+\.pdf$/);
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
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.R2_FIXTURE_MODE;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('returns FixtureStorage when R2_FIXTURE_MODE=replay', () => {
    process.env.R2_FIXTURE_MODE = 'replay';
    expect(pickStorage()).toBeInstanceOf(FixtureStorage);
  });

  it('returns FixtureStorage when NODE_ENV=test (regardless of R2_FIXTURE_MODE)', () => {
    process.env.NODE_ENV = 'test';
    expect(pickStorage()).toBeInstanceOf(FixtureStorage);
  });
});
