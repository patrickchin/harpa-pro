-- 0009_notes_thumbnail_file_id.sql
--
-- Thumbnail-grid feature (docs/v4/arch-uploads.md §Thumbnails).
--
-- Image notes can now carry a second R2 file id pointing at a small
-- (~256 px square JPEG) thumbnail generated client-side at upload
-- time. The grid surfaces (`ReportPhotos`, `PhotoNoteCard`,
-- `ImageNoteCard`) fetch this thumbnail; the fullscreen
-- `ImagePreviewModal` continues to fetch the full `file_id`.
--
-- Expand-only:
--   - Nullable column; existing image notes leave it NULL and fall
--     back to the full `file_id` for grid rendering (one-off cost,
--     no backfill).
--   - FK to `app.files(id)` so the column stays referentially sound;
--     ON DELETE SET NULL so a missing thumbnail does not block
--     deletion of the underlying file row.
--
-- No drops. No renames. No constraint tightening.

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS thumbnail_file_id text
    REFERENCES app.files(id) ON DELETE SET NULL;
