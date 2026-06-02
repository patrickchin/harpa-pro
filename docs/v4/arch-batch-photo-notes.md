# Batch photo notes

> One report note → many image files.

## Problem

Previously, each photo upload created a separate note. Gallery multi-
select or camera burst sessions produced N individual cards in the
timeline — noisy and not how users think about "the 5 photos I just
took of the kitchen ceiling."

## Solution

A **note_files join table** (`app.note_files`) associates multiple
files with a single note. The upload queue groups photos from one
session into a **batch** (shared `batchKey`). The first upload to
complete creates the note; subsequent uploads append via
`POST /notes/{note}/files`.

## Schema

```
app.note_files
├── id                text PK (prefix: nfl)
├── note_id           text FK → app.notes (CASCADE)
├── file_id           text FK → app.files
├── thumbnail_file_id text FK → app.files (SET NULL)
├── position          integer NOT NULL DEFAULT 0
├── caption           text
└── created_at        timestamptz DEFAULT now()

UNIQUE(note_id, position)
INDEX ON (note_id, position)
```

Migration: `packages/api/migrations/0010_note_files.sql` (includes
backfill of pre-existing image notes).

> **Legacy columns are NULL on migrated image notes.** The migration
> backfills `app.note_files` from existing `app.notes.file_id` rows
> and then sets `notes.file_id` / `notes.thumbnail_file_id` to NULL
> for `kind = 'image'`. Always read photo file ids from the joined
> `note_files` rows (`files[]` on the API response). Consumers that
> still read `notes.fileId` directly will see blank thumbnails or
> drop the row from filters like `kind === 'photo' && n.fileId`.

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /reports/{report}/notes` | Creates note; accepts `files[]` |
| `POST /notes/{note}/files` | Appends files to existing note |
| `GET /reports/{report}/notes` | Returns `files[]` on each note |
| `GET /reports/{report}/debug` | Returns `files[]` per note (parity with /notes) |

Request body for append:
```json
{ "files": [{ "fileId": "fil_…", "thumbnailFileId": "fil_…" }] }
```

### LLM prompt placeholders

`collectNotesForGeneration` emits a structured placeholder per note
so the model knows when a single note carries a batch of photos:

| Note shape | Placeholder |
|------------|-------------|
| Image note, 1 file | `[image N]` (optionally `[image N] "caption"`) |
| Image note, M files (M>1) | `[images N: M photos]` (optionally `[images N: M photos] "caption"`) |
| Document note | `[document N]` (optionally `[document N] "caption"`) |

`N` is the 1-based ordinal across all notes in the report; the
caption (when present) is the note `body` JSON-encoded so the model
can treat it as opaque text. The system prompt
(`packages/api/src/prompts/reportGeneration.ts`) describes this
shape so the LLM treats `[images N: M photos]` as one batch.

## Mobile upload queue

- `enqueueBatch(inputs[])` tags all inputs with the same `batchKey`
- `BatchCoordinator` tracks which batch's first job creates the note
- Serial queue processes jobs; the coordinator's promise guard ensures
  exactly one `createNote` call per batch
- `useCameraUploads` and gallery picker both use `enqueueBatch`

Key files:
- `apps/mobile/lib/uploads/batch-coordinator.ts`
- `apps/mobile/lib/uploads/queue.ts` (`enqueueBatch`)
- `apps/mobile/lib/uploads/run-upload.ts` (`resolveNote` handler)

## Data shape

### `Attachment`

Every photo — saved or in-flight — is represented as one `Attachment`:

```ts
interface Attachment {
  key: string;            // stable React key (note_files.id for saved, jobId for pending)
  fileId: string | null;  // server R2 file id; null until registered
  thumbnailFileId: string | null;
  sourceUri: string | null; // local URI while pending; null once saved
  isPending: boolean;     // true while upload pipeline owns this tile
  jobId?: string;         // upload job id while pending
  status?: AttachmentStatus; // 'pending' | 'uploading' | 'completed' | 'failed' | …
  progress?: number;      // [0..1] while uploading; undefined once saved
  error?: string;         // set when status === 'failed'
  position: number;       // ordering hint within the parent note
}
```

Source: `apps/mobile/lib/notes/attachments.ts`.

`buildAttachments(entry)` derives the list from a `NoteEntry`. It
falls back to a single saved tile built from `entry.fileId` for legacy
rows that pre-date the `attachments` field.

### Two-level anti-flicker

The timeline reconciles pending entries with server-confirmed notes
using two key-remap maps:

- **`noteIdToSyntheticId`** (entry level) — maps a newly-arrived
  server `noteId` back to the synthetic id used while the note was
  still optimistic. The entry keeps the same React key across the
  pending → saved transition, preventing a full unmount/remount.
- **`fileIdToAttachmentKey`** (tile level) — maps a newly-registered
  server `fileId` back to the synthetic `jobId` used as the tile's key
  while uploading. Each `PhotoTile` within a batch keeps its
  expo-image cache hot; the thumbnail never flickers to a blank frame.

### Grid layout rules

- **Always-grid**: every image note renders as a `PhotoBatchGrid`,
  even when there is exactly one attachment (1-cell grid). There is no
  special solo path.
- **Overflow cap**: the grid shows at most 9 tiles. When
  `attachments.length > 9` the ninth tile displays a `+N` overflow
  chip where `N = total − 8`.

### Component signatures

```tsx
// Required: containerWidth (drives cell sizing). No entry prop.
<PhotoBatchGrid
  attachments={Attachment[]}
  containerWidth={number}
  onOpenFile?={(fileId: string) => void}
  onRetryUpload?={(jobId: string) => void}
  onCancelUpload?={(jobId: string) => void}
/>

// One tile for every state (idle, uploading, error, saved).
<PhotoTile
  attachment={Attachment}
  size={number}
  onPress?={() => void}
  onRetry?={() => void}
  onCancel?={() => void}
  overflowCount?={number}   // renders +N chip when set
  testID?={string}
/>
```

## UI

- `PhotoBatchGrid` — always-grid, max 9 visible tiles, `+N` overflow chip
- `PhotoTile` — single tile, handles all lifecycle states (see below)
- `PhotoNoteCard` — renders `PhotoBatchGrid` for every image note
- `NoteTimeline` — routes batch entries through `PhotoNoteCard`, applies
  the two anti-flicker maps
- `ReportPhotos` — groups tiles by `noteId`, shows stack badge
- `usePhotoUploadEntries` — groups pending jobs by `batchKey`
- `GenerateReportProvider` — expands `files[]` into photo gallery

### Per-tile lifecycle

Each `PhotoTile` manages its own visual state:

| State | Condition | Rendering |
|-------|-----------|-----------|
| **Idle / saved** | `!isPending` | `CachedImage` via signed URL (no overlay) |
| **Uploading** | `isPending && status !== 'failed'` | `CachedImage` from `sourceUri` + `PhotoProgressRing` overlaid at `progress` |
| **Error** | `status === 'failed'` | Red overlay; tap → retry (`onRetry`); long-press → cancel (`onCancel`) |
| **Fade to saved** | `isPending` flips to `false` | Overlay fades out; `CachedImage` transitions to the server URL without re-keying the component |

## Design spec

Full spec:
`docs/superpowers/specs/2026-05-25-batch-photo-notes-design.md`
