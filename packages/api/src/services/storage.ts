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
 * R2Storage stub. Will be wired with @aws-sdk/client-s3 + S3RequestPresigner
 * in P1 follow-up; not on the critical path for P1 since CI runs in
 * fixture mode (arch-storage.md §Fixture mode → "no R2 calls in CI").
 */
export class R2Storage implements Storage {
  async presign(_input: PresignInput): Promise<PresignResult> {
    throw new Error('R2Storage.presign not yet implemented — use R2_FIXTURE_MODE=replay in this env');
  }
  async signGet(_fileKey: string): Promise<SignedUrl> {
    throw new Error('R2Storage.signGet not yet implemented — use R2_FIXTURE_MODE=replay in this env');
  }
  async putObject(_input: PutObjectInput): Promise<PutObjectResult> {
    throw new Error('R2Storage.putObject not yet implemented — use R2_FIXTURE_MODE=replay in this env');
  }
}

export function pickStorage(): Storage {
  if (process.env.R2_FIXTURE_MODE === 'replay' || process.env.NODE_ENV === 'test') {
    return new FixtureStorage();
  }
  return new R2Storage();
}
