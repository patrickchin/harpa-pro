-- 0011_notes_changed_at.sql
--
-- Expand-only migration: add `notes_changed_at` to app.reports.
-- Do NOT backfill in this migration. Do NOT drop
-- `notes_since_last_generation` here — the legacy counter remains
-- for a later contract (drop) release.
--
-- Replace the racy `notes_since_last_generation` counter with a
-- `notes_changed_at` timestamp. Dirty state is then
-- `notes_changed_at IS NOT NULL AND
--   (generated_at IS NULL OR notes_changed_at > generated_at)`.
--
-- See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.

ALTER TABLE app.reports
  ADD COLUMN notes_changed_at timestamptz;
