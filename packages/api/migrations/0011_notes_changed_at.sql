-- 0011_notes_changed_at.sql
--
-- Replace the racy `notes_since_last_generation` counter with a
-- `notes_changed_at` timestamp. Dirty state is then
-- `notes_changed_at IS NOT NULL AND
--   (generated_at IS NULL OR notes_changed_at > generated_at)`.
--
-- See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.

ALTER TABLE app.reports
  ADD COLUMN notes_changed_at timestamptz;

-- Backfill: any report whose counter was non-zero is dirty. Use
-- updated_at as the best-effort "last changed" timestamp.
UPDATE app.reports
   SET notes_changed_at = updated_at
 WHERE notes_since_last_generation > 0;

ALTER TABLE app.reports
  DROP COLUMN notes_since_last_generation;
