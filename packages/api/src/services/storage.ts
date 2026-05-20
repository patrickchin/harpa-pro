/**
 * Storage abstraction. The API talks to one of:
 *
 *   - FixtureStorage  (used in tests + `:mock`): mints deterministic
 *     URLs that point at packages/ai-fixtures or local fixture
 *     assets; never touches R2. Selected when R2_FIXTURE_MODE=replay.
 *   - R2Storage       (production): @aws-sdk/client-s3 against
 *     Cloudflare R2 with signed PUT/GET.
 *
 * The selection is made per-request via `pickStorage()` so tests can
 * force fixture mode regardless of the surrounding env.
 *
 * Server constructs the object key (`users/<userId>/<kind>/<uuid>.<ext>`)
 * — the client never specifies it (Pitfall 8 / arch-storage.md §Security).
 */
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

export type FileKind = 'voice' | 'image' | 'document' | 'pdf';

export interface PresignInput {
  userId: string;
  kind: FileKind;
  contentType: string;
  sizeBytes: number;
}

export interface PresignResult {
  uploadUrl: string;
  fileKey: string;
  expiresAt: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

export interface PutObjectInput {
  userId: string;
  kind: FileKind;
  contentType: string;
  bytes: Uint8Array;
}

export interface PutObjectResult {
  fileKey: string;
  sizeBytes: number;
}

export interface Storage {
  presign(input: PresignInput): Promise<PresignResult>;
  signGet(fileKey: string): Promise<SignedUrl>;
  /**
   * Server-side upload (used by the report PDF render path: the API
   * builds the bytes itself rather than handing the client a presigned
   * PUT). Server constructs the key — never trust client input.
   */
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
}

const DEFAULT_TTL_SEC = 300; // 5 minutes per arch-storage.md

function extFor(contentType: string, kind: FileKind): string {
  if (kind === 'voice') return 'm4a';
  if (kind === 'image') return contentType === 'image/png' ? 'png' : 'jpg';
  if (kind === 'pdf') return 'pdf';
  if (contentType === 'application/pdf') return 'pdf';
  return 'bin';
}

function buildKey(userId: string, kind: FileKind, contentType: string): string {
  return `users/${userId}/${kind}/${randomUUID()}.${extFor(contentType, kind)}`;
}

export class FixtureStorage implements Storage {
  constructor(private readonly base = 'https://fixtures.harpa.local') {}

  async presign(input: PresignInput): Promise<PresignResult> {
    const fileKey = buildKey(input.userId, input.kind, input.contentType);
    return {
      uploadUrl: `${this.base}/put/${encodeURIComponent(fileKey)}?expires=${Date.now() + DEFAULT_TTL_SEC * 1000}`,
      fileKey,
      expiresAt: new Date(Date.now() + DEFAULT_TTL_SEC * 1000).toISOString(),
    };
  }

  async signGet(fileKey: string): Promise<SignedUrl> {
    return {
      url: `${this.base}/get/${encodeURIComponent(fileKey)}?expires=${Date.now() + DEFAULT_TTL_SEC * 1000}`,
      expiresAt: new Date(Date.now() + DEFAULT_TTL_SEC * 1000).toISOString(),
    };
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    // Fixture mode keeps PDF rendering deterministic + network-free in
    // CI: we mint a server-built key but don't touch any blob store.
    // Tests verify the resulting signed GET URL points at the same key.
    const fileKey = buildKey(input.userId, input.kind, input.contentType);
    return { fileKey, sizeBytes: input.bytes.length };
  }
}

/**
 * R2Storage — production storage backed by Cloudflare R2 via the
 * S3-compatible API.
 *
 * R2 enforces presigned PUT constraints loosely: we still embed the
 * server-built object key, content-type, and content-length in the
 * signed URL (Pitfall 8 / arch-storage.md §Security) so a stolen URL
 * can't be repurposed for arbitrary uploads.
 *
 * Selected at runtime by `pickStorage()` when `R2_FIXTURE_MODE !==
 * 'replay'`. CI always runs in fixture mode (arch-storage.md
 * §"Fixture mode" → "no R2 calls in CI").
 */
export class R2Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttlSec: number;

  constructor(opts?: {
    client?: S3Client;
    bucket?: string;
    ttlSec?: number;
  }) {
    this.bucket = opts?.bucket ?? env.R2_BUCKET;
    this.ttlSec = opts?.ttlSec ?? env.R2_PRESIGN_TTL_SEC;
    this.client = opts?.client ?? buildR2Client();
  }

  async presign(input: PresignInput): Promise<PresignResult> {
    const fileKey = buildKey(input.userId, input.kind, input.contentType);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.ttlSec,
      // Sign Content-Type / Content-Length so the client can't swap
      // payload types after the URL is minted.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      uploadUrl,
      fileKey,
      expiresAt: new Date(Date.now() + this.ttlSec * 1000).toISOString(),
    };
  }

  async signGet(fileKey: string): Promise<SignedUrl> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: fileKey });
    const url = await getSignedUrl(this.client, command, { expiresIn: this.ttlSec });
    return {
      url,
      expiresAt: new Date(Date.now() + this.ttlSec * 1000).toISOString(),
    };
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const fileKey = buildKey(input.userId, input.kind, input.contentType);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: input.bytes,
        ContentType: input.contentType,
        ContentLength: input.bytes.length,
      }),
    );
    return { fileKey, sizeBytes: input.bytes.length };
  }
}

function buildR2Client(): S3Client {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || (!accountId && !env.R2_ENDPOINT)) {
    throw new Error(
      'R2_FIXTURE_MODE=live but R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / (R2_ACCOUNT_ID or R2_ENDPOINT) missing',
    );
  }
  const endpoint = env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    // R2 ignores region but the SDK requires one.
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // R2 requires path-style addressing.
    forcePathStyle: true,
  });
}

export function pickStorage(): Storage {
  if (process.env.R2_FIXTURE_MODE === 'replay' || process.env.NODE_ENV === 'test') {
    return new FixtureStorage();
  }
  return new R2Storage();
}
