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

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /reports/{report}/notes` | Creates note; accepts `files[]` |
| `POST /notes/{note}/files` | Appends files to existing note |
| `GET /reports/{report}/notes` | Returns `files[]` on each note |

Request body for append:
```json
{ "files": [{ "fileId": "fil_…", "thumbnailFileId": "fil_…" }] }
```

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

## UI

- `PhotoBatchGrid` — 3×3 grid, max 9 visible tiles, `+N` overflow
- `PhotoNoteCard` — dispatches to `PhotoBatchGrid` when >1 file
- `NoteTimeline` — routes batch entries through `PhotoNoteCard`
- `ReportPhotos` — groups tiles by `noteId`, shows stack badge
- `usePhotoUploadEntries` — groups pending jobs by `batchKey`
- `GenerateReportProvider` — expands `files[]` into photo gallery

## Design spec

Full spec:
`docs/superpowers/specs/2026-05-25-batch-photo-notes-design.md`
