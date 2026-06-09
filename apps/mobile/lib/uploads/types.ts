/**
 * Upload pipeline types.
 *
 * The contract (Pitfall 8) is:
 *
 *   enqueue(input)
 *     → presign        (POST /files/presign)
 *     → PUT to R2      (direct to signed URL)
 *     → registerFile   (POST /files)
 *     → createNote     (POST /reports/{report}/notes) — for any input
 *                       that targets a report timeline, including
 *                       documents. Always create the note so the
 *                       upload appears in the report.
 *
 * Every kind (image / voice / document / pdf) round-trips through the
 * same state machine; new kinds add a row to the integration test.
 */
import type { ResponseBody } from '@/lib/api/client';

/** Server-shaped file record returned from `POST /files`. */
export type FileRecord = ResponseBody<'/files', 'post'>;
/** Server-shaped note returned from `POST /reports/{report}/notes`. */
export type NoteRecord = ResponseBody<'/reports/{report}/notes', 'post'>;

/** Logical upload kinds we surface to the UI. */
export type UploadKind = 'image' | 'voice' | 'document' | 'pdf';

/** Note kind that should be created on the report timeline. */
export type NoteKind = 'image' | 'voice' | 'document';

/** Maps an UploadKind to the note timeline kind the API expects. */
export function noteKindForUpload(kind: UploadKind): NoteKind {
  return kind === 'pdf' ? 'document' : kind;
}

/** Caller-supplied input for a single enqueue. */
export interface EnqueueInput {
  /**
   * Phase F: optional caller-supplied dedupe key. When the queue
   * rehydrates from AsyncStorage on app boot, jobs whose `clientId`
   * matches one already enqueued are dropped. Mobile callers (voice
   * recorder, photo picker) derive this from `sourceUri + sizeBytes`
   * so re-tapping "save" never enqueues the same file twice.
   */
  clientId?: string;
  /** Local source URI (file://, ph://, content://). */
  sourceUri: string;
  kind: UploadKind;
  /** Original filename — surfaced by the UI; not sent to R2. */
  filename: string;
  /** MIME type; forwarded to presign and used as the PUT Content-Type. */
  contentType: string;
  /** File size in bytes. Asserted ≤ 50 MB by the API. */
  sizeBytes: number;
  /**
   * When set, the queue also creates a timeline note (Pitfall 8). For
   * out-of-report uploads (e.g. avatar) leave it undefined and the
   * queue stops after registerFile.
   */
  reportId?: string;
  /**
   * Project the upload belongs to. Required for project-scope uploads
   * (must be set whenever `reportId` is set — the new `app.files` RLS
   * keys on project membership, not just owner). Leave undefined for
   * personal-scope uploads (avatar, scratch).
   */
  projectId?: string;
  /**
   * Personal-scope discriminator for uploads that don't belong to a
   * project. `'avatar'` mints an `users/<userId>/avatar/<fileId>` key
   * and forces `image` kind server-side. Anything else (omitted or
   * `'scratch'`) routes to the `users/<userId>/scratch/<fileId>`
   * prefix and preserves the caller's `kind`.
   *
   * When `projectId` + `reportId` are set this is ignored — the queue
   * always prefers project scope.
   */
  uploadScope?: 'avatar' | 'scratch';
  /** Optional transcript for voice notes; ignored for other kinds. */
  transcript?: string;
  /** Origin stored on the created timeline note when this upload creates one. */
  noteSource?: 'camera' | 'gallery' | 'upload';
  /** When set, groups this upload into a batch. First-to-complete creates the note; others append. */
  batchKey?: string;
  /**
   * Paired thumbnail for image uploads. When present the queue runs a
   * second presign + PUT + registerFile cycle in parallel with the
   * main image and passes the resulting `fileId` as `thumbnailFileId`
   * into createNote so grid surfaces fetch the small variant.
   *
   * On terminal thumb-pipeline failure the queue creates the note
   * with `thumbnailFileId: null` — the photo is never lost; tiles
   * fall back to the full file id.
   */
  thumbnail?: {
    sourceUri: string;
    contentType: string;
    sizeBytes: number;
  };
}

export type JobStatus =
  | 'pending'
  | 'presigning'
  | 'uploading'
  | 'registering'
  | 'creating_note'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UploadJob {
  /** Local correlation id (NOT the server `fil_…` id; that is `fileId` below). */
  id: string;
  input: EnqueueInput;
  status: JobStatus;
  /** Bytes-uploaded progress in [0, 1]. 0 before PUT begins, 1 after. */
  progress: number;
  /** Attempt counter (1 on first run; bumped on every retry). */
  attempt: number;
  /** Set once the R2 PUT + register completes. */
  fileId?: string;
  /** Set once the thumbnail R2 PUT + register completes (image jobs only). */
  thumbnailFileId?: string;
  /** Batch key this job belongs to (for UI grouping). */
  batchKey?: string;
  /**
   * Server-side note id this job is bound to, once the queue resolves
   * it during the `creating_note` phase. Surfaced on the snapshot so
   * synthetic timeline entries can adopt the eventual `not_…` id the
   * moment it's known — keeping the React key stable across the
   * pending → saved transition and eliminating remount flicker.
   */
  noteId?: string;
  /** Set when status === 'failed'. */
  error?: string;
}

export const MAX_ATTEMPTS = 3;

/** Initial backoff (ms). Doubled per attempt. */
export const BACKOFF_BASE_MS = 400;

export function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

/** Result returned to enqueue() callers via a promise. */
export interface UploadResult {
  file: FileRecord;
  /** Thumbnail file record (image jobs with `input.thumbnail` only). */
  thumbnailFile?: FileRecord;
  noteId?: string;
}
