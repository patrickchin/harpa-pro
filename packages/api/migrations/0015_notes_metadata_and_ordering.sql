-- 0015_notes_metadata_and_ordering.sql
--
-- Photo placement v2 needs stable note ordering and note provenance
-- in the structured generation payload. Placement itself moves out of
-- app.notes in 0016/0017.

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.notes
  DROP CONSTRAINT IF EXISTS notes_source_chk;

ALTER TABLE app.notes
  ADD CONSTRAINT notes_source_chk CHECK (
    source IS NULL OR source IN ('typed', 'voice', 'camera', 'gallery', 'upload')
  );

UPDATE app.notes
SET source = CASE kind
  WHEN 'text' THEN 'typed'
  WHEN 'voice' THEN 'voice'
  ELSE 'upload'
END
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS notes_report_order_idx
  ON app.notes (report_id, created_at ASC, id ASC);

ALTER TABLE app.notes
  DROP CONSTRAINT IF EXISTS notes_created_at_sane_chk;

ALTER TABLE app.notes
  ADD CONSTRAINT notes_created_at_sane_chk CHECK (
    created_at <= now() + interval '1 day'
  );
