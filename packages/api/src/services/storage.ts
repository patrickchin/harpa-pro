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
 * Server constructs the object key — clients never specify it
 * (Pitfall 8 / arch-storage.md §Security). Layout (migration 0011):
 *
 *   project:  projects/<projectId>/reports/<reportId>/<fileId>.<ext>
 *   avatar:   users/<userId>/avatar/<fileId>.<ext>
 *   scratch:  users/<userId>/scratch/<fileId>.<ext>
 *
 * The `<fileId>` segment is the pre-minted `fil_…` slug that the
 * route will persist as the row PK in `registerFile`, so key + DB id
 * share identity.
 */
import {
  DeleteObjectsCommand,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';
import { newId } from '../lib/ids.js';

export type FileKind = 'voice' | 'image' | 'document' | 'pdf';

export type PresignScope =
  | {
      kind: 'project';
      userId: string;
      projectId: string;
      reportId: string;
      fileKind: FileKind;
    }
  | { kind: 'avatar'; userId: string }
  | { kind: 'scratch'; userId: string; fileKind: FileKind };

export interface PresignInput {
  scope: PresignScope;
  contentType: string;
  sizeBytes: number;
}

export interface PresignResult {
  uploadUrl: string;
  fileKey: string;
  /** Pre-minted `fil_…` id embedded in the key — caller persists as the row PK. */
  fileId: string;
  expiresAt: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

export interface PutObjectInput {
  scope: PresignScope;
  contentType: string;
  bytes: Uint8Array;
  /** Preallocated by buildStorageKey() before the durable write intent. */
  fileKey: string;
  fileId: string;
}

export interface PutObjectResult {
  fileKey: string;
  fileId: string;
  sizeBytes: number;
}

export interface ListPrefixResult {
  keys: string[];
  nextCursor: string | null;
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
  /** Idempotently delete objects; missing keys count as success. */
  deleteObjects(fileKeys: string[]): Promise<void>;
  /** List one bounded page under a server-selected safe prefix. */
  listPrefix(
    prefix: string,
    cursor?: string,
    limit?: number,
  ): Promise<ListPrefixResult>;
}

const DEFAULT_TTL_SEC = 300; // 5 minutes per arch-storage.md

function extFor(contentType: string, kind: FileKind): string {
  if (kind === 'voice') return 'm4a';
  if (kind === 'image') return contentType === 'image/png' ? 'png' : 'jpg';
  if (kind === 'pdf') return 'pdf';
  if (contentType === 'application/pdf') return 'pdf';
  return 'bin';
}

function scopeFileKind(scope: PresignScope): FileKind {
  return scope.kind === 'avatar' ? 'image' : scope.fileKind;
}

export interface BuiltStorageKey {
  fileKey: string;
  fileId: string;
}

export function buildStorageKey(
  scope: PresignScope,
  contentType: string,
): BuiltStorageKey {
  const fileId = newId('fil');
  const fileKind = scopeFileKind(scope);
  const ext = extFor(contentType, fileKind);
  let fileKey: string;
  switch (scope.kind) {
    case 'project':
      fileKey = `projects/${scope.projectId}/reports/${scope.reportId}/${fileId}.${ext}`;
      break;
    case 'avatar':
      fileKey = `users/${scope.userId}/avatar/${fileId}.${ext}`;
      break;
    case 'scratch':
      fileKey = `users/${scope.userId}/scratch/${fileId}.${ext}`;
      break;
  }
  return { fileKey, fileId };
}

/**
 * Inverse of `buildStorageKey` — reads the scope back out of an R2 object
 * key. Used by `POST /files` (register) to verify the claimed scope
 * matches the embedded prefix + ids before persisting the row.
 *
 * Returns `null` for keys that don't match any known prefix layout.
 */
export type ParsedKeyScope =
  | {
      scope: 'project';
      projectId: string;
      reportId: string;
      fileId: string;
    }
  | { scope: 'avatar'; userId: string; fileId: string }
  | { scope: 'scratch'; userId: string; fileId: string };

const PROJECT_KEY_RE =
  /^projects\/(prj_[0-9a-hjkmnp-tv-z]{8,16})\/reports\/(rpt_[0-9a-hjkmnp-tv-z]{8,16})\/(fil_[0-9a-hjkmnp-tv-z]{8,16})\.[a-z0-9]+$/i;
const AVATAR_KEY_RE =
  /^users\/(usr_[0-9a-hjkmnp-tv-z]{8,16})\/avatar\/(fil_[0-9a-hjkmnp-tv-z]{8,16})\.[a-z0-9]+$/i;
const SCRATCH_KEY_RE =
  /^users\/(usr_[0-9a-hjkmnp-tv-z]{8,16})\/scratch\/(fil_[0-9a-hjkmnp-tv-z]{8,16})\.[a-z0-9]+$/i;

export function parseKeyScope(key: string): ParsedKeyScope | null {
  const proj = PROJECT_KEY_RE.exec(key);
  if (proj) {
    return {
      scope: 'project',
      projectId: proj[1]!.toLowerCase(),
      reportId: proj[2]!.toLowerCase(),
      fileId: proj[3]!.toLowerCase(),
    };
  }
  const avatar = AVATAR_KEY_RE.exec(key);
  if (avatar) {
    return {
      scope: 'avatar',
      userId: avatar[1]!.toLowerCase(),
      fileId: avatar[2]!.toLowerCase(),
    };
  }
  const scratch = SCRATCH_KEY_RE.exec(key);
  if (scratch) {
    return {
      scope: 'scratch',
      userId: scratch[1]!.toLowerCase(),
      fileId: scratch[2]!.toLowerCase(),
    };
  }
  return null;
}

export class FixtureStorage implements Storage {
  constructor(private readonly base = 'https://fixtures.harpa.local') {}

  async presign(input: PresignInput): Promise<PresignResult> {
    const { fileKey, fileId } = buildStorageKey(
      input.scope,
      input.contentType,
    );
    return {
      uploadUrl: `${this.base}/put/${encodeURIComponent(fileKey)}?expires=${Date.now() + DEFAULT_TTL_SEC * 1000}`,
      fileKey,
      fileId,
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
    return {
      fileKey: input.fileKey,
      fileId: input.fileId,
      sizeBytes: input.bytes.length,
    };
  }

  async deleteObjects(_fileKeys: string[]): Promise<void> {
    // Replay mode has no backing object store.
  }

  async listPrefix(
    _prefix: string,
    _cursor?: string,
    _limit?: number,
  ): Promise<ListPrefixResult> {
    return { keys: [], nextCursor: null };
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
  private readonly signingClient: S3Client;
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
    // Presigned URLs must be signed with the *public* endpoint so the
    // Host header the client sends matches what was signed. Otherwise
    // MinIO/R2 reject with SignatureDoesNotMatch. In production
    // R2_PUBLIC_ENDPOINT is unset and we sign with R2_ENDPOINT (or
    // the default R2 URL) — same as before.
    this.signingClient = env.R2_PUBLIC_ENDPOINT
      ? buildR2Client(env.R2_PUBLIC_ENDPOINT)
      : this.client;
  }

  async presign(input: PresignInput): Promise<PresignResult> {
    const { fileKey, fileId } = buildStorageKey(
      input.scope,
      input.contentType,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.signingClient, command, {
      expiresIn: this.ttlSec,
      // Sign Content-Type / Content-Length so the client can't swap
      // payload types after the URL is minted.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      uploadUrl,
      fileKey,
      fileId,
      expiresAt: new Date(Date.now() + this.ttlSec * 1000).toISOString(),
    };
  }

  async signGet(fileKey: string): Promise<SignedUrl> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: fileKey });
    const url = await getSignedUrl(this.signingClient, command, { expiresIn: this.ttlSec });
    return {
      url,
      expiresAt: new Date(Date.now() + this.ttlSec * 1000).toISOString(),
    };
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.fileKey,
        Body: input.bytes,
        ContentType: input.contentType,
        ContentLength: input.bytes.length,
      }),
    );
    return {
      fileKey: input.fileKey,
      fileId: input.fileId,
      sizeBytes: input.bytes.length,
    };
  }

  async deleteObjects(fileKeys: string[]): Promise<void> {
    const uniqueKeys = [...new Set(fileKeys)].filter(Boolean);
    for (let offset = 0; offset < uniqueKeys.length; offset += 1_000) {
      const chunk = uniqueKeys.slice(offset, offset + 1_000);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      if (result.Errors && result.Errors.length > 0) {
        throw new Error(
          `R2 delete failed for ${result.Errors.length} of ${chunk.length} object(s)`,
        );
      }
    }
  }

  async listPrefix(
    prefix: string,
    cursor?: string,
    limit = 500,
  ): Promise<ListPrefixResult> {
    const boundedLimit = Math.max(1, Math.min(1_000, Math.trunc(limit)));
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: boundedLimit,
      }),
    );
    return {
      keys: (result.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key)),
      nextCursor: result.NextContinuationToken ?? null,
    };
  }
}

function buildR2Client(endpointOverride?: string): S3Client {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || (!accountId && !env.R2_ENDPOINT)) {
    throw new Error(
      'R2_FIXTURE_MODE=live but R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / (R2_ACCOUNT_ID or R2_ENDPOINT) missing',
    );
  }
  const endpoint =
    endpointOverride ?? env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
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
  // Read from the parsed `env` (Zod-validated at boot) instead of
  // poking raw `process.env`. The previous `process.env.NODE_ENV ===
  // 'test'` short-circuit was a Pitfall 13 trapdoor: it silently
  // forced fixture mode in every integration test, so the real
  // R2Storage default-wiring was never exercised by *any* test in
  // CI. Now the only way to enter fixture mode in tests is to set
  // `R2_FIXTURE_MODE=replay` (which the integration-test bootstrap
  // does explicitly — see setup-pg.ts + scope tests).
  if (env.R2_FIXTURE_MODE === 'replay') {
    return new FixtureStorage();
  }
  return new R2Storage();
}
