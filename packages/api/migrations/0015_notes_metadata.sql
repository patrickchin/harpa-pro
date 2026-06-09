-- 0015_notes_metadata.sql
--
-- Photo-placement v2 (docs/v4/design-photo-placement.md).
--
-- Adds:
--   - notes.source       — coarse capture-flow hint (typed / voice / camera / gallery / upload)
--   - notes.meta         — open-ended JSONB for kind-specific extras
--   - ordering index     — matches the canonical (created_at ASC, id ASC) sort
--                           used by every notes-by-report read site
--   - sanity CHECK       — defangs gross client-clock skew (far-future
--                           created_at). Past timestamps are allowed
--                           (offline capture / backdated upload).
--
-- `note_files.caption` already exists (migration 0010); no change needed.
--
-- Expand-only. Existing rows leave `source` NULL and `meta` defaulted
-- to `'{}'`. No backfill is performed here — the column-only addition
-- keeps the migration cheap and the application logic tolerant of
-- NULL source on legacy rows.
--
-- `IF NOT EXISTS` is defensive: the index name has been used in dev
-- branches; the guard makes re-runs a no-op rather than failing.

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_source_chk'
  ) THEN
    ALTER TABLE app.notes
      ADD CONSTRAINT notes_source_chk
      CHECK (
        source IS NULL
        OR source IN ('typed', 'voice', 'camera', 'gallery', 'upload')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_created_at_sane_chk'
  ) THEN
    ALTER TABLE app.notes
      ADD CONSTRAINT notes_created_at_sane_chk
      CHECK (created_at <= now() + interval '1 day');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notes_report_order_idx
  ON app.notes (report_id, created_at ASC, id ASC);
