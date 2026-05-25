# Batch photo notes (one note → many files)

## Problem

A single tap of "Add from gallery" (`pickAndEnqueueGalleryImages`) or a
multi-snap camera session (`onCommit(uris)` from `screens/camera-capture`)
enqueues N image uploads. Today the upload queue creates **one note per
file**, so 10 photos picked at once produce 10 tall, near-identical
`PhotoNoteCard`s on the Generate timeline, the saved-report Notes pane,
and the AI's prompt context.

We want: **one tap = one note = many photos**, rendered as a single card
with a 3×3 thumbnail grid (with `+N` overflow), persisted server-side so
every surface (timeline, Notes pane, photo grid, AI generation, future
export) sees the same grouping.

## Approach (the short version)

- New table `app.note_files` holds the photos that belong to one note.
  Existing image notes are backfilled (`file_id` → `note_files.position=0`)
  and the legacy `notes.file_id` / `notes.thumbnail_file_id` columns are
  cleared for image kind. Voice + document notes are untouched — they
  stay single-file via the existing `notes.file_id`.
- API gains a `files: NoteFile[]` array on image-kind responses, plus a
  new `POST /reports/{report}/notes/{note}/files` endpoint for appending
  files to an existing batch as later uploads in the same batch settle.
- Upload queue gains an `enqueueBatch(inputs[], { reportId })` API.
  Within a batch, the **first** registered file calls `POST /notes`
  (create the note with one file); subsequent files in the same batch
  call `POST /notes/{id}/files`. Failed files surface as retry rows;
  retrying rejoins the original batch via its `batchKey`.
- UI: `PhotoNoteCard` and `PhotoNoteRow` become **batch-aware** — they
  render a 3×3 grid via `PhotoGridTile` (max 9 visible, last tile shows
  `+N` overflow). A batch of 1 looks the same as today. `ReportPhotos`
  groups by batch (one tile per batch with a stack badge).

## Data model

### New table — `app.note_files`

```sql
CREATE TABLE app.note_files (
  id                  text PRIMARY KEY,                       -- 'nfile_…'
  note_id             text NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
  file_id             text NOT NULL REFERENCES app.files(id),
  thumbnail_file_id   text REFERENCES app.files(id),
  position            integer NOT NULL,                       -- 0-indexed within the note
  caption             text,                                   -- reserved for future per-photo AI captions
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, position)
);

CREATE INDEX note_files_note_id_idx ON app.note_files (note_id, position);
```

RLS: inherit from `app.notes` — a row in `note_files` is visible / writable
iff the parent note is. Concretely: a `SELECT` policy joins to `app.notes`
on `note_id` and reuses the notes member-of-project predicate; `INSERT`
checks the parent note belongs to the current user; `DELETE` requires
author-of-parent-note.

### Backfill migration

In the same migration:

1. `INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id,
   position) SELECT newid('nfile'), id, file_id, thumbnail_file_id, 0
   FROM app.notes WHERE kind = 'image' AND file_id IS NOT NULL;`
2. `UPDATE app.notes SET file_id = NULL, thumbnail_file_id = NULL WHERE
   kind = 'image';`
3. No CHECK constraints — the service layer is the single writer for
   image notes, and a CHECK that hard-asserts "image kind ⇒ no
   `notes.file_id`" would be costly to relax later if we ever decide to
   store a representative cover image on the note row itself. Service
   tests cover the invariants instead.

Voice + document notes are unaffected.

## API

### Contract changes (`packages/api-contract`)

The `Note` schema gains an optional `files` field:

```ts
interface NoteFile {
  fileId: string;
  thumbnailFileId?: string | null;
  position: number;
  caption?: string | null;
}

interface Note {
  // …existing fields…
  /** Present and non-empty for kind === 'image'. Empty/absent otherwise. */
  files?: NoteFile[];
}
```

The `notes.fileId` / `notes.thumbnailFileId` fields on the response stay
in the schema (voice/document still set them) but image notes will return
them as `null`.

### Endpoints

- `GET /reports/{report}/notes` — image rows now embed `files[]`. The
  service does one `LEFT JOIN app.note_files ORDER BY position` per page
  (or a second query keyed by note id; whichever benchmarks cleaner).
- `POST /reports/{report}/notes` — when `kind === 'image'`, the body
  shape is:

  ```ts
  { kind: 'image';
    body?: string | null;
    files: [{ fileId: string; thumbnailFileId?: string | null }] }
  ```

  `files` must contain ≥ 1 entry. Server inserts the note + note_files
  rows in one transaction; `position` = array index.

  For voice/document the existing top-level `fileId`/`thumbnailFileId`
  shape is unchanged.
- **NEW** `POST /reports/{report}/notes/{note}/files` — append more
  files to an existing image note. Body: `{ files:
  [{ fileId, thumbnailFileId? }] }`. Server appends with `position =
  max(position)+1, +2, …`. Returns the updated note (full file list).
  Author-only via RLS.

`DELETE /reports/{report}/notes/{note}` already cascades to note_files
via the FK.

## Upload queue

### New: batch coordination

Add a `BatchCoordinator` keyed by `batchKey` (a ULID minted by the
caller of `enqueueBatch`).

```ts
interface BatchState {
  batchKey: string;
  reportId: string;
  noteId?: string;   // populated after the first successful file lands
  pendingJobIds: Set<string>;
  appendedFileIds: Set<string>;  // already POSTed
}
```

Flow:

1. `enqueueBatch(inputs[], { reportId })` mints `batchKey`, attaches it
   to every enqueued job's `EnqueueInput.batchKey`, returns
   `{ batchKey, jobIds, settled: Promise<…> }`.
2. Each job runs the existing pipeline (presign → PUT → registerFile)
   in parallel. The `createNote` step is **replaced** for jobs with
   `batchKey`:
   - If the batch has no `noteId` yet, this job calls
     `POST /reports/{report}/notes` with `files: [{ fileId,
     thumbnailFileId? }]`. The returned `noteId` is recorded on the
     batch state. **Only one job per batch wins this race**: the
     coordinator stores a `createNotePromise?: Promise<noteId>` field
     on the batch state; the first job to reach this step initialises
     it, every later job awaits the existing promise and then takes
     the append path. Single-threaded JS means a plain field guard is
     enough — no real lock needed.
   - Otherwise the job calls
     `POST /reports/{report}/notes/{noteId}/files` with itself.
3. Failed jobs surface as `PendingPhotoCard`-style retry rows tagged
   with the same `batchKey`. On retry success they rejoin via step 2.
4. The batch promise settles once every job has terminated (success or
   permanent-failure after retries).

Persistence: `batchKey` is part of `EnqueueInput`, so it's already
serialised through the existing queue persistence (`lib/uploads/persistence`).
On rehydrate, the coordinator is reconstructed by grouping jobs.

### Backwards compat

Callers that still use plain `enqueue()` for an image (no `batchKey`)
get a synthetic single-file batch — the queue treats them as a
batch-of-1 so the create-note path is uniform. No code change required
for `AvatarUploader` (it has no `reportId` and so doesn't hit createNote).

`useCameraUploads.enqueueCameraUris` flips to call `enqueueBatch`. The
gallery picker and camera capture both already arrive at this single
chokepoint, so this is the only call-site change.

## Mobile data layer

### `NoteEntry`

```ts
interface NoteEntry {
  // …existing…
  /** Present for image kind. Empty for non-image. */
  files?: ReadonlyArray<{
    fileId: string;
    thumbnailFileId?: string | null;
    caption?: string | null;
  }>;
  /** Synthetic batch-in-flight state — N pending files for one card. */
  pendingFiles?: ReadonlyArray<{
    jobId: string;
    sourceUri: string;
    status: JobStatus;
    progress: number;
    error?: string;
  }>;
}
```

The single-file `fileId` / `thumbnailFileId` / `pendingUpload` fields
stay on `NoteEntry` for voice/document; image notes use `files` /
`pendingFiles` exclusively.

### `usePhotoUploadEntries`

Today it emits one synthetic entry per in-flight job. Becomes:

- Group in-flight image jobs by `batchKey`.
- Emit one entry per batch with `pendingFiles[]` populated from the jobs.
- `addedAt` = min(parseJobCreatedAt(job.id)) across the batch, so the
  card lands in the right timeline slot.
- Once the batch has a server-side `noteId`, drop it from the synthetic
  list (the real note now arrives via the notes query). Still-pending
  files for the same batch are reflected on the real note via the
  cache-merging step below.

The provider that combines synthetic batches with the real notes query
needs a small change: when a real image note has the same `batchKey`
(carried back on the note? or by matching `noteId`?), merge in any
still-pending file rows. Simplest: the synthetic provider keeps emitting
the batch entry until **all** files in the batch have terminated; the
combiner uses `noteId` (if present on the batch state) to suppress the
duplicate real note. Trade-off documented inline.

## UI

### `PhotoNoteCard` (Generate timeline) + `PhotoNoteRow` (saved-report Notes pane)

Both adopt the same internal layout:

```
┌────────────────────────────────────────┐
│ Author · 2m ago                     ⋯ │
├────────────────────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐                         │
│ │  │ │  │ │  │                         │
│ └──┘ └──┘ └──┘                         │
│ ┌──┐ ┌──┐ ┌──┐                         │
│ │  │ │  │ │  │                         │
│ └──┘ └──┘ └──┘                         │
│ ┌──┐ ┌──┐ ┌────┐                       │
│ │  │ │  │ │+N  │                       │
│ └──┘ └──┘ └────┘                       │
└────────────────────────────────────────┘
```

- 3-column grid via flex (`flex-wrap`, `w-1/3` cells, square aspect).
- First 8 cells render `PhotoGridTile`s. Cell 9 renders `+N` overlay
  iff `files.length > 9`; tapping it opens fullscreen at index 8.
- Batch of 1 → single tile, same look as today (no grid chrome).
- Tap on tile `i` → `onOpen(batch.files[i].fileId, sourceIndex, i)`
  opens the existing fullscreen swipeable gallery scoped to this batch.

### `PendingPhotoBatchCard`

Replaces `PendingPhotoCard` for image rows whose entry has
`pendingFiles[]`. Same 3×3 grid layout, each tile shows a thumbnail
placeholder + progress overlay (existing `PendingPhotoCard` styling
reused per tile). Kebab → "Cancel batch" (cancels all pending),
"Retry failed" (retries any that failed). A single failed tile shows
an inline ↻ button per current single-photo UX.

### `ReportPhotos` (saved-report 3-column photo grid)

Today it flattens all image notes into a flat list of `fileId`s. Becomes:

- Iterate notes; each image note contributes **one tile per batch** to
  the grid (not per file).
- The tile shows the first photo's thumbnail with a small stack badge
  (e.g. `⊞ 7`) in the top-right corner when `files.length > 1`.
- Tap opens the fullscreen gallery scoped to that batch's files.

### Fullscreen photo viewer

`GenerateReportProvider` currently builds the gallery's `files[]` by
flattening every image note's single `fileId` into a flat array, and the
tap handler resolves `(fileId, sourceIndex) → galleryIndex` by linear
scan. The replacement: flatten `notes[].files[]` into the same flat
array (preserving timeline order, then `note_files.position`); the tap
handler takes `(noteId, photoIndex)` and looks up the corresponding flat
index. The fullscreen component itself doesn't change.

## Testing

- API: integration tests for `POST /notes` (image with N files),
  `POST /notes/{id}/files` (append), `GET /notes` (files embedded,
  position ordering), DELETE cascade.
- Migration: a test that runs the up-migration against a fixture DB
  containing single-file image notes and asserts the backfill produced
  one `note_files` row per image note with the right
  `(file_id, position=0)`.
- Upload queue: integration test that two `enqueue` calls sharing a
  `batchKey` produce one POST /notes (first to finish) + one POST
  /notes/{id}/files (second to finish), in either order. Race-condition
  test: simulate both finishing at once → still only one POST /notes.
- Mobile: snapshot tests for `PhotoNoteCard` at 1, 3, 9, 12 files.
  `ReportPhotos` test for the stack badge. `usePhotoUploadEntries`
  test that batch grouping collapses N jobs to 1 entry.
- Maestro: extend the photo-upload flow to multi-select 3 photos and
  assert one batched card renders.

## Out of scope (deliberate)

- Per-photo or per-batch captions — schema reserves room
  (`note_files.caption`, `notes.body`) but no UI yet. AI captioning
  lands in a follow-up.
- Reordering photos inside a batch.
- Removing one photo from a batch (only "delete whole batch" works
  until a follow-up adds `DELETE /notes/{note}/files/{fileId}`).
- Cross-batch merge / split.
- Adding more photos to an existing batch from the UI (e.g. an "+"
  button on a batched card) — the only path to add files is via the
  upload queue's batch coordinator at enqueue time.

## Resolved during review

- Backfill copies `notes.created_at` into `note_files.created_at` (not
  `now()`) so historical fidelity is preserved.
- Legacy top-level `notes.fileId` / `notes.thumbnailFileId` on image
  rows is returned as `null` from the API. API + mobile ship in the
  same PR so no transition shim is needed.
