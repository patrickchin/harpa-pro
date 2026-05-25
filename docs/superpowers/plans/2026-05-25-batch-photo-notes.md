# Batch Photo Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One note = many photos. Gallery picks and camera sessions create a single note with a `note_files` join table, rendered as a 3×3 thumbnail grid card.

**Architecture:** New `app.note_files` table holds photos per note. The upload queue gains batch coordination (first file creates the note, later files append via `POST /notes/{id}/files`). UI cards render a grid of thumbnails with `+N` overflow.

**Tech Stack:** Postgres migration, Hono API routes, Zod contract schemas, React Native (NativeWind), upload queue state machine.

---

## File Structure

### API / Backend
| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/api/migrations/0010_note_files.sql` | DDL + backfill |
| Modify | `packages/api-contract/src/schemas/ids.ts` | Add `nfl` prefix for note-file ids |
| Modify | `packages/api-contract/src/schemas/notes.ts` | `noteFile` schema, update `createNoteRequest`, add `appendFilesRequest` |
| Modify | `packages/api/src/services/notes.ts` | `listNotes` joins `note_files`; `createNote` writes `note_files`; new `appendFiles` |
| Modify | `packages/api/src/routes/notes.ts` | New `POST /reports/{report}/notes/{note}/files` route |
| Create | `packages/api/src/__tests__/note-files.integration.test.ts` | Integration tests |

### Mobile — Upload Queue
| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/mobile/lib/uploads/types.ts` | Add `batchKey` to `EnqueueInput` |
| Create | `apps/mobile/lib/uploads/batch-coordinator.ts` | Batch state + create-vs-append logic |
| Create | `apps/mobile/lib/uploads/batch-coordinator.test.ts` | Unit tests |
| Modify | `apps/mobile/lib/uploads/run-upload.ts` | Batch-aware `createNote` step |
| Modify | `apps/mobile/lib/uploads/queue.ts` | `enqueueBatch()` method |
| Modify | `apps/mobile/lib/uploads/index.ts` | Re-export `enqueueBatch` |
| Modify | `apps/mobile/lib/uploads/useFileUpload.ts` | Expose `enqueueBatch` |
| Modify | `apps/mobile/lib/camera/use-camera-uploads.ts` | Switch to `enqueueBatch` |
| Modify | `apps/mobile/lib/camera/pick-and-enqueue-gallery-images.ts` | Pass through batch |

### Mobile — Data Layer
| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/mobile/lib/note-entry.ts` | Add `files[]` + `pendingFiles[]` |
| Modify | `apps/mobile/lib/uploads/usePhotoUploadEntries.ts` | Group by `batchKey` |

### Mobile — UI Components
| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/mobile/components/notes/PhotoBatchGrid.tsx` | 3×3 grid with +N overflow |
| Create | `apps/mobile/components/notes/PhotoBatchGrid.test.tsx` | Snapshot tests |
| Modify | `apps/mobile/components/notes/PhotoNoteCard.tsx` | Use `PhotoBatchGrid` for `files[]` |
| Create | `apps/mobile/components/notes/PendingPhotoBatchCard.tsx` | In-flight batch card |
| Modify | `apps/mobile/components/reports/detail/PhotoNoteRow.tsx` | Batch-aware saved-report row |
| Modify | `apps/mobile/components/reports/detail/ReportPhotos.tsx` | Group-by-note with stack badge |
| Modify | `apps/mobile/components/reports/detail/ReportNotesPane.tsx` | Pass `files[]` to `PhotoNoteRow` |
| Modify | `apps/mobile/components/reports/generate/GenerateReportProvider.tsx` | Wire batch photo gallery |
| Modify | `apps/mobile/components/notes/NoteTimeline.tsx` | Render batch cards + pending batches |

---

## Task 1: Migration — `app.note_files` table

**Files:**
- Create: `packages/api/migrations/0010_note_files.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0010_note_files.sql
--
-- Batch photo notes: one note → many files via a join table.
-- See docs/superpowers/specs/2026-05-25-batch-photo-notes-design.md.
--
-- Expand-only: new table + backfill existing single-file image notes
-- into the join table, then clear legacy columns on image rows.

CREATE TABLE app.note_files (
  id                  text PRIMARY KEY,
  note_id             text NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
  file_id             text NOT NULL REFERENCES app.files(id),
  thumbnail_file_id   text REFERENCES app.files(id) ON DELETE SET NULL,
  position            integer NOT NULL DEFAULT 0,
  caption             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, position)
);

CREATE INDEX note_files_note_id_idx ON app.note_files (note_id, position);

-- Backfill: every existing image note that has a file_id → one note_files row
INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position, created_at)
SELECT
  'nfl_' || substr(md5(random()::text || id), 1, 10),
  id,
  file_id,
  thumbnail_file_id,
  0,
  created_at
FROM app.notes
WHERE kind = 'image' AND file_id IS NOT NULL;

-- Clear legacy columns on image notes (voice/document keep theirs)
UPDATE app.notes
SET file_id = NULL, thumbnail_file_id = NULL
WHERE kind = 'image' AND file_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/migrations/0010_note_files.sql
git commit -m "feat(api): add note_files table + backfill migration

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Contract — `noteFile` schema + request updates

**Files:**
- Modify: `packages/api-contract/src/schemas/ids.ts`
- Modify: `packages/api-contract/src/schemas/notes.ts`

- [ ] **Step 1: Add `nfl` prefix to ID_SPEC**

In `packages/api-contract/src/schemas/ids.ts`, add after the `lue` entry:

```ts
nfl: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'NoteFileId' },
```

Add the type export and schema:

```ts
export type NoteFileId = Id<'nfl'>;
export const noteFileId = idSchema('nfl');
```

- [ ] **Step 2: Add `noteFile` schema and update note schemas**

In `packages/api-contract/src/schemas/notes.ts`:

```ts
export const noteFile = z.object({
  id: noteFileId,
  fileId: fileId,
  thumbnailFileId: fileId.nullable(),
  position: z.number().int().min(0),
  caption: z.string().nullable(),
});
export type NoteFile = z.infer<typeof noteFile>;
```

Update `note` schema — add:
```ts
/** Present for image kind; empty array for non-image. */
files: z.array(noteFile).default([]),
```

Update `createNoteRequest` — add:
```ts
/** Required for image kind: at least one file entry. */
files: z.array(z.object({
  fileId: fileId,
  thumbnailFileId: fileId.nullable().optional(),
})).optional(),
```

Add new request schema:
```ts
export const appendFilesRequest = z.object({
  files: z.array(z.object({
    fileId: fileId,
    thumbnailFileId: fileId.nullable().optional(),
  })).min(1),
});
export type AppendFilesRequest = z.infer<typeof appendFilesRequest>;
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-contract/src/schemas/ids.ts packages/api-contract/src/schemas/notes.ts
git commit -m "feat(api-contract): noteFile schema + appendFiles request

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Service — `listNotes` joins `note_files`, `createNote` writes batch, new `appendFiles`

**Files:**
- Modify: `packages/api/src/services/notes.ts`

- [ ] **Step 1: Add `NoteFileRow` type and mapping**

```ts
interface RawNoteFile {
  id: string;
  note_id: string;
  file_id: string;
  thumbnail_file_id: string | null;
  position: number;
  caption: string | null;
}

export interface NoteFileRow {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
  position: number;
  caption: string | null;
}

function mapNoteFile(r: RawNoteFile): NoteFileRow {
  return {
    id: r.id,
    fileId: r.file_id,
    thumbnailFileId: r.thumbnail_file_id,
    position: r.position,
    caption: r.caption,
  };
}
```

Add `files: NoteFileRow[]` to `NoteRow` interface and update `mapNote` to default it to `[]`.

- [ ] **Step 2: Update `listNotes` to fetch note_files**

After fetching the note rows, do a second query for the page's note ids:

```ts
const noteIds = slice.map((r) => r.id);
const filesResult = noteIds.length > 0
  ? await db.execute<RawNoteFile>(sql`
      SELECT id, note_id, file_id, thumbnail_file_id, position, caption
      FROM app.note_files
      WHERE note_id = ANY(${noteIds}::text[])
      ORDER BY position ASC
    `)
  : { rows: [] };

const filesByNote = new Map<string, NoteFileRow[]>();
for (const r of filesResult.rows) {
  const list = filesByNote.get(r.note_id) ?? [];
  list.push(mapNoteFile(r));
  filesByNote.set(r.note_id, list);
}
```

Then in `mapNote`, merge: `files: filesByNote.get(r.id) ?? []`.

- [ ] **Step 3: Update `createNote` — image kind writes to `note_files`**

When `input.kind === 'image'` and `input.files` is provided:
- Don't write `file_id`/`thumbnail_file_id` on the note row
- After inserting the note, insert into `app.note_files` for each file entry

```ts
if (input.kind === 'image' && input.files?.length) {
  for (let i = 0; i < input.files.length; i++) {
    const f = input.files[i];
    const nfId = newId('nfl');
    await db.execute(sql`
      INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position)
      VALUES (${nfId}, ${id}, ${f.fileId}, ${f.thumbnailFileId ?? null}, ${i})
    `);
  }
}
```

- [ ] **Step 4: Add `appendFiles` function**

```ts
export async function appendFiles(
  db: Db,
  noteId: string,
  files: Array<{ fileId: string; thumbnailFileId?: string | null }>,
): Promise<NoteRow | null> {
  // Get current max position
  const maxPos = await db.execute<{ max_pos: number | null }>(sql`
    SELECT MAX(position) as max_pos FROM app.note_files WHERE note_id = ${noteId}
  `);
  let nextPos = (maxPos.rows[0]?.max_pos ?? -1) + 1;

  for (const f of files) {
    const nfId = newId('nfl');
    await db.execute(sql`
      INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position)
      VALUES (${nfId}, ${noteId}, ${f.fileId}, ${f.thumbnailFileId ?? null}, ${nextPos})
    `);
    nextPos++;
  }

  // Return the updated note with all files
  const r = await db.execute<RawNote>(sql`
    SELECT ${NOTE_COLUMNS} FROM app.notes WHERE id = ${noteId}
  `);
  const row = r.rows[0];
  if (!row) return null;

  const filesResult = await db.execute<RawNoteFile>(sql`
    SELECT id, note_id, file_id, thumbnail_file_id, position, caption
    FROM app.note_files WHERE note_id = ${noteId} ORDER BY position ASC
  `);

  return { ...mapNote(row), files: filesResult.rows.map(mapNoteFile) };
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/notes.ts
git commit -m "feat(api): note_files in listNotes/createNote + appendFiles service

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Route — `POST /reports/{report}/notes/{note}/files`

**Files:**
- Modify: `packages/api/src/routes/notes.ts`

- [ ] **Step 1: Add the append-files route**

```ts
import { appendFiles } from '../services/notes.js';

// --------- append files to image note ----------
noteRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{report}/notes/{note}/files',
    tags: ['notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: z.object({
        report: reportId.openapi({ param: { name: 'report', in: 'path' } }),
        note: noteId.openapi({ param: { name: 'note', in: 'path' } }),
      }),
      body: { content: { 'application/json': { schema: noteSchemas.appendFilesRequest } } },
    },
    responses: {
      200: { description: 'Files appended.', content: { 'application/json': { schema: noteSchemas.note } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { note: nId } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await db((d) => appendFiles(d, nId, body.files));
    if (!updated) throw new HTTPException(404, { message: 'Note not found or not author.' });
    return c.json(updated, 200);
  },
);
```

- [ ] **Step 2: Update the create-note handler to pass `files` through**

The existing handler already passes `body` to `createNote(d, reportId, userId, body)`. Since `body` now may contain `files`, the service function receives it automatically (step 3 above already handles it).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/notes.ts
git commit -m "feat(api): POST /notes/{note}/files append endpoint

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: API integration tests

**Files:**
- Create: `packages/api/src/__tests__/note-files.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Tests should cover:
1. `POST /reports/{report}/notes` with `kind: 'image', files: [{fileId, thumbnailFileId}]` → 201, response has `files[0]`
2. `POST /reports/{report}/notes/{note}/files` appends → 200, response has all files in position order
3. `GET /reports/{report}/notes` → image notes have `files[]` populated, `fileId` is null
4. `DELETE /notes/{note}` → cascades to note_files (no orphans)
5. Non-image note creation still works with top-level `fileId`

Follow existing test patterns in `packages/api/src/__tests__/` (Testcontainers, scoped DB).

- [ ] **Step 2: Run tests, verify pass**

```bash
cd packages/api && pnpm test -- --grep "note-files"
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/__tests__/note-files.integration.test.ts
git commit -m "test(api): note_files integration tests

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Upload queue — batch coordinator

**Files:**
- Create: `apps/mobile/lib/uploads/batch-coordinator.ts`
- Create: `apps/mobile/lib/uploads/batch-coordinator.test.ts`

- [ ] **Step 1: Write the batch coordinator**

```ts
// batch-coordinator.ts
import type { NoteRecord } from './types';

export interface BatchState {
  batchKey: string;
  reportId: string;
  noteId?: string;
  /** Promise that resolves to the note id. First job to reach createNote
   *  initialises this; later jobs await it and then append. */
  createNotePromise?: Promise<string>;
  pendingJobIds: Set<string>;
  completedFileIds: Set<string>;
}

export interface BatchCoordinator {
  getOrCreateBatch(batchKey: string, reportId: string): BatchState;
  getBatch(batchKey: string): BatchState | undefined;
  registerJob(batchKey: string, jobId: string): void;
  markJobDone(batchKey: string, jobId: string): void;
  removeBatch(batchKey: string): void;
}

export function createBatchCoordinator(): BatchCoordinator {
  const batches = new Map<string, BatchState>();

  return {
    getOrCreateBatch(batchKey, reportId) {
      let batch = batches.get(batchKey);
      if (!batch) {
        batch = {
          batchKey,
          reportId,
          pendingJobIds: new Set(),
          completedFileIds: new Set(),
        };
        batches.set(batchKey, batch);
      }
      return batch;
    },
    getBatch: (key) => batches.get(key),
    registerJob(batchKey, jobId) {
      const batch = batches.get(batchKey);
      if (batch) batch.pendingJobIds.add(jobId);
    },
    markJobDone(batchKey, jobId) {
      const batch = batches.get(batchKey);
      if (batch) {
        batch.pendingJobIds.delete(jobId);
        if (batch.pendingJobIds.size === 0) {
          batches.delete(batchKey);
        }
      }
    },
    removeBatch: (key) => batches.delete(key),
  };
}
```

- [ ] **Step 2: Write unit tests**

Test: create batch, register jobs, first job gets `createNotePromise === undefined` (it creates), second awaits and appends, markJobDone cleans up.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/uploads/batch-coordinator.ts apps/mobile/lib/uploads/batch-coordinator.test.ts
git commit -m "feat(mobile): batch coordinator for grouped photo uploads

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Upload queue — `enqueueBatch` + batch-aware `createNote` step

**Files:**
- Modify: `apps/mobile/lib/uploads/types.ts`
- Modify: `apps/mobile/lib/uploads/run-upload.ts`
- Modify: `apps/mobile/lib/uploads/queue.ts`
- Modify: `apps/mobile/lib/uploads/useFileUpload.ts`
- Modify: `apps/mobile/lib/uploads/index.ts`

- [ ] **Step 1: Add `batchKey` to `EnqueueInput`**

In `types.ts`, add to `EnqueueInput`:
```ts
/** Batch key. All jobs in the same batch contribute files to one note. */
batchKey?: string;
```

- [ ] **Step 2: Add `appendFiles` to `UploadDeps`**

In `run-upload.ts`, add to `UploadDeps`:
```ts
appendFiles: (args: {
  reportId: string;
  noteId: string;
  fileId: string;
  thumbnailFileId?: string;
  signal?: AbortSignal;
}) => Promise<NoteRecord>;
```

- [ ] **Step 3: Update `runUploadJob` — batch-aware createNote**

When `input.batchKey` is set, instead of calling `deps.createNote` directly:
- Accept an optional `batchNoteId?: string` parameter
- If `batchNoteId` is provided → call `deps.appendFiles` instead
- If not → call `deps.createNote` as before

The queue is responsible for resolving whether to create or append (via the coordinator). Pass `batchNoteId` into `runUploadJob` via a new optional field on `RunHandlers`.

- [ ] **Step 4: Add `enqueueBatch` to the queue**

In `queue.ts`, add a new export function on the queue:

```ts
enqueueBatch(
  inputs: EnqueueInput[],
  opts: { reportId: string },
): { batchKey: string; settled: Promise<PromiseSettledResult<UploadResult>[]> }
```

Implementation:
- Mint a `batchKey` (ulid or similar)
- Stamp `batchKey` + `reportId` onto each input
- Enqueue each via the existing `enqueue()` path
- The `processJob` function checks: if the job has a `batchKey`, consult the coordinator to determine create-vs-append
- Return `{ batchKey, settled: Promise.allSettled(promises) }`

- [ ] **Step 5: Expose in `useFileUpload` and `index.ts`**

Add `enqueueBatch` to `UseFileUploadApi` and the barrel export.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/uploads/
git commit -m "feat(mobile): enqueueBatch + batch-aware upload pipeline

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Camera uploads — switch to `enqueueBatch`

**Files:**
- Modify: `apps/mobile/lib/camera/use-camera-uploads.ts`
- Modify: `apps/mobile/lib/camera/pick-and-enqueue-gallery-images.ts`

- [ ] **Step 1: Update `useCameraUploads`**

Change `enqueueCameraUris` to call `enqueueBatch` instead of N individual `enqueue()` calls:

```ts
const enqueueCameraUris = useCallback(
  async (uris, opts) => {
    if (uris.length === 0) return [];
    const inputs = await Promise.all(
      uris.map(async (uri, idx) => {
        const [processed, thumbnail] = await Promise.all([
          processImageForUpload(uri),
          processImageThumbnail(uri).catch(() => null),
        ]);
        if (processed.sizeBytes > SERVER_MAX_BYTES) {
          throw new Error(`Image exceeds 50 MB`);
        }
        return {
          sourceUri: processed.uri,
          kind: 'image' as const,
          filename: filenameFromUri(uri, idx),
          contentType: 'image/jpeg',
          sizeBytes: processed.sizeBytes,
          reportId: opts.reportId,
          ...(thumbnail ? { thumbnail: { sourceUri: thumbnail.uri, contentType: 'image/jpeg', sizeBytes: thumbnail.sizeBytes } } : {}),
        };
      }),
    );
    const { settled } = enqueueBatch(inputs, { reportId: opts.reportId });
    return settled;
  },
  [enqueueBatch],
);
```

- [ ] **Step 2: Update `pick-and-enqueue-gallery-images.ts` type**

The type of `enqueueCameraUris` in `PickAndEnqueueOptions` already returns `Promise<ReadonlyArray<PromiseSettledResult<UploadResult>>>` — `settled` matches. No change needed beyond the caller.

- [ ] **Step 3: Run existing camera upload tests**

```bash
cd apps/mobile && pnpm test -- --grep "camera-uploads|pick-and-enqueue"
```

Fix any type errors from the refactor.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/camera/
git commit -m "feat(mobile): camera/gallery uploads use enqueueBatch

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Data layer — `NoteEntry` + `usePhotoUploadEntries` batch grouping

**Files:**
- Modify: `apps/mobile/lib/note-entry.ts`
- Modify: `apps/mobile/lib/uploads/usePhotoUploadEntries.ts`

- [ ] **Step 1: Extend `NoteEntry`**

Add to `NoteEntry` interface:

```ts
/** Present for image kind — the photos belonging to this note. */
files?: ReadonlyArray<{
  fileId: string;
  thumbnailFileId?: string | null;
  caption?: string | null;
}>;
/** Synthetic: pending file uploads for a batch card. */
pendingFiles?: ReadonlyArray<{
  jobId: string;
  sourceUri: string;
  status: import('@/lib/uploads/types').JobStatus;
  progress: number;
  error?: string;
}>;
/** Batch key — used to correlate pending entries with real notes. */
batchKey?: string;
```

- [ ] **Step 2: Update `usePhotoUploadEntries` — group by batchKey**

Instead of emitting one entry per job, group jobs by `batchKey`:

```ts
const entries = useMemo<readonly NoteEntry[]>(() => {
  if (!reportId) return [];
  const visible = jobs.filter((j) => isVisibleImageJob(j, reportId));

  // Group by batchKey; unbatched jobs get a synthetic batch-of-1
  const batches = new Map<string, UploadJob[]>();
  for (const job of visible) {
    const key = job.input.batchKey ?? job.id;
    const list = batches.get(key) ?? [];
    list.push(job);
    batches.set(key, list);
  }

  return Array.from(batches.entries()).map(([key, batchJobs]) => ({
    id: `__batch-${key}`,
    authorId,
    text: '',
    addedAt: Math.min(...batchJobs.map((j) => parseJobCreatedAt(j.id))),
    source: 'image' as const,
    isPending: true,
    batchKey: key,
    pendingFiles: batchJobs.map((j) => ({
      jobId: j.id,
      sourceUri: j.input.sourceUri,
      status: j.status,
      progress: j.progress,
      error: j.error,
    })),
  }));
}, [jobs, reportId, authorId]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/note-entry.ts apps/mobile/lib/uploads/usePhotoUploadEntries.ts
git commit -m "feat(mobile): NoteEntry files[] + batch-grouped upload entries

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: UI — `PhotoBatchGrid` component

**Files:**
- Create: `apps/mobile/components/notes/PhotoBatchGrid.tsx`
- Create: `apps/mobile/components/notes/PhotoBatchGrid.test.tsx`

- [ ] **Step 1: Build the grid component**

```tsx
import { Text, View } from 'react-native';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';

export interface PhotoBatchGridProps {
  files: ReadonlyArray<{
    fileId: string;
    thumbnailFileId?: string | null;
  }>;
  tileSize?: number;
  onPressTile?: (index: number) => void;
}

const MAX_VISIBLE = 9;
const COLUMNS = 3;
const GAP = 4;

export function PhotoBatchGrid({ files, tileSize = 90, onPressTile }: PhotoBatchGridProps) {
  if (files.length === 0) return null;

  // Single photo — render like today (no grid chrome)
  if (files.length === 1) {
    const f = files[0]!;
    return (
      <PhotoGridTile
        fileId={f.fileId}
        thumbnailFileId={f.thumbnailFileId ?? null}
        size={110}
        onPress={onPressTile ? () => onPressTile(0) : undefined}
        accessibilityLabel="Open photo"
      />
    );
  }

  const overflow = files.length - MAX_VISIBLE;
  const visible = files.slice(0, overflow > 0 ? MAX_VISIBLE - 1 : MAX_VISIBLE);

  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }} testID="photo-batch-grid">
      {visible.map((f, i) => (
        <PhotoGridTile
          key={f.fileId}
          fileId={f.fileId}
          thumbnailFileId={f.thumbnailFileId ?? null}
          size={tileSize}
          onPress={onPressTile ? () => onPressTile(i) : undefined}
          accessibilityLabel={`Photo ${i + 1}`}
        />
      ))}
      {overflow > 0 ? (
        <View
          style={{ width: tileSize, height: tileSize }}
          className="items-center justify-center rounded-md bg-muted"
          testID="photo-batch-overflow"
        >
          <Text className="text-sm font-medium text-muted-foreground">
            +{overflow + 1}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Snapshot test**

Test renders at 1, 3, 9, 12 files. Assert overflow tile shows correct count.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/notes/PhotoBatchGrid.tsx apps/mobile/components/notes/PhotoBatchGrid.test.tsx
git commit -m "feat(mobile): PhotoBatchGrid 3×3 grid with +N overflow

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: UI — Update `PhotoNoteCard` + `NoteTimeline` for batches

**Files:**
- Modify: `apps/mobile/components/notes/PhotoNoteCard.tsx`
- Create: `apps/mobile/components/notes/PendingPhotoBatchCard.tsx`
- Modify: `apps/mobile/components/notes/NoteTimeline.tsx`

- [ ] **Step 1: Refactor `PhotoNoteCard` to use `PhotoBatchGrid`**

When `entry.files` is populated (length > 0), render `PhotoBatchGrid`. Otherwise fall back to the single-tile layout using `entry.fileId` (for voice/document that reuse this — actually they don't; keep it for legacy single-file image notes during transition).

```tsx
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';

// In render:
const files = entry.files ?? (entry.fileId ? [{ fileId: entry.fileId, thumbnailFileId: entry.thumbnailFileId }] : []);

// Replace the single PhotoGridTile with:
<PhotoBatchGrid
  files={files}
  onPressTile={(i) => {
    const f = files[i];
    if (f && onOpen) onOpen(f.fileId, sourceIndex);
  }}
/>
```

- [ ] **Step 2: Create `PendingPhotoBatchCard`**

Similar to `PendingPhotoCard` but renders a grid of local thumbnails with per-tile progress. Uses `entry.pendingFiles[]`.

```tsx
// Renders a grid of local source URIs with progress overlays
// Retry/Cancel buttons at the card level (not per-tile)
```

- [ ] **Step 3: Update `NoteTimeline` — dispatch to batch cards**

In the image branch of the `.map()`:
- If `entry.pendingFiles` → render `PendingPhotoBatchCard`
- If `entry.files` or `entry.fileId` → render `PhotoNoteCard` (already handles both)
- Remove the old `entry.pendingUpload` → `PendingPhotoCard` path (replaced by batch)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/notes/
git commit -m "feat(mobile): batch-aware PhotoNoteCard + PendingPhotoBatchCard

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: UI — Saved report `PhotoNoteRow` + `ReportNotesPane` + `ReportPhotos`

**Files:**
- Modify: `apps/mobile/components/reports/detail/PhotoNoteRow.tsx`
- Modify: `apps/mobile/components/reports/detail/ReportNotesPane.tsx`
- Modify: `apps/mobile/components/reports/detail/ReportPhotos.tsx`

- [ ] **Step 1: Update `PhotoNoteRow` to accept `files[]`**

Add `files` prop. When present, render `PhotoBatchGrid` instead of a single `PhotoGridTile`.

```tsx
export interface PhotoNoteRowProps {
  // ...existing...
  files?: ReadonlyArray<{ fileId: string; thumbnailFileId?: string | null }>;
}
```

Render logic: `files?.length ? <PhotoBatchGrid ... /> : <PhotoGridTile ... />`

- [ ] **Step 2: Update `ReportNotesPane` — pass `files` through**

Add `files` to `ReportNoteRow` interface:
```ts
files?: ReadonlyArray<{ fileId: string; thumbnailFileId?: string | null }>;
```

In the photo rendering branch, pass it:
```tsx
<PhotoNoteRow ... files={note.files} />
```

- [ ] **Step 3: Update `ReportPhotos` — group by note with stack badge**

Replace the flat photo list with a per-note grouping:

```tsx
const photoBatches = useMemo(() =>
  (noteRows ?? [])
    .filter((n) => n.kind === 'photo' && n.files?.length)
    .map((n) => ({
      noteId: n.id,
      coverFileId: n.files![0]!.fileId,
      coverThumbId: n.files![0]!.thumbnailFileId ?? null,
      count: n.files!.length,
    })),
  [noteRows],
);
```

Each tile renders with a `count > 1` badge overlay:
```tsx
{batch.count > 1 && (
  <View className="absolute top-1 right-1 rounded bg-black/60 px-1">
    <Text className="text-[10px] text-white font-medium">{batch.count}</Text>
  </View>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/reports/detail/
git commit -m "feat(mobile): batch-aware saved-report photo UI

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Wire batch into `GenerateReportProvider` photo gallery

**Files:**
- Modify: `apps/mobile/components/reports/generate/GenerateReportProvider.tsx`

- [ ] **Step 1: Update `photoGallery` memo**

Replace the flat single-fileId extraction with batch-aware flattening:

```ts
const photoGallery = useMemo(
  () =>
    timelineItems
      .filter((e) => e.source === 'image')
      .flatMap((e) => {
        const files = e.files ?? (e.fileId ? [{ fileId: e.fileId, thumbnailFileId: e.thumbnailFileId }] : []);
        return files.map((f) => ({
          fileId: f.fileId,
          title: e.text?.trim() || 'Photo',
          cacheKey: f.fileId,
        }));
      }),
  [timelineItems],
);
```

The `openPhoto` callback already indexes into this flat list by `fileId` — no change needed.

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/reports/generate/GenerateReportProvider.tsx
git commit -m "feat(mobile): batch-aware photo gallery in GenerateReportProvider

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Regenerate OpenAPI types + run full test suite

**Files:**
- Modify: `packages/api-contract/openapi.json` (auto-generated)
- Modify: `packages/api-contract/src/generated/types.ts` (auto-generated)

- [ ] **Step 1: Regenerate contract types**

```bash
cd packages/api-contract && pnpm gen-types
```

- [ ] **Step 2: Regenerate mobile hooks (if applicable)**

```bash
cd apps/mobile && pnpm gen-hooks 2>/dev/null || true
```

- [ ] **Step 3: Run API tests**

```bash
cd packages/api && pnpm test
```

- [ ] **Step 4: Run mobile tests**

```bash
cd apps/mobile && pnpm test
```

- [ ] **Step 5: Fix any failures, commit**

```bash
git add -A
git commit -m "chore: regenerate types + fix test fallout from batch notes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Update docs

**Files:**
- Modify: `docs/v4/arch-storage.md` or `docs/v4/arch-data-layer.md` (whichever covers notes schema)

- [ ] **Step 1: Document `note_files` table and batch semantics**

Add a section explaining:
- Image notes now use `note_files` join table
- One note = one batch of photos
- Voice/document still use `notes.file_id` directly
- `POST /notes/{note}/files` for appending

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs(v4): document batch photo notes architecture

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
