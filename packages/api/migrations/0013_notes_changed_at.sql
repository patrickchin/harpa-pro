-- 0013_notes_changed_at.sql
--
-- Expand-only migration: add `notes_changed_at` to app.reports.
-- Do NOT backfill in this migration. Do NOT drop
-- `notes_since_last_generation` here — the legacy counter remains
-- for a later contract (drop) release.
--
-- During the expand window, application code dual-writes the legacy
-- counter and this timestamp, and dual-reads both dirty signals.
--
-- See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.

ALTER TABLE app.reports
  ADD COLUMN notes_changed_at timestamptz;
