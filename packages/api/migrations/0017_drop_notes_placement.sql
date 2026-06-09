-- 0017_drop_notes_placement.sql
--
-- Contract step for photo placement v2. The backfill in 0016 copied
-- valid image placements into report.body attachments.

ALTER TABLE app.notes
  DROP CONSTRAINT IF EXISTS notes_placement_shape_chk;

ALTER TABLE app.notes
  DROP COLUMN IF EXISTS placement;
