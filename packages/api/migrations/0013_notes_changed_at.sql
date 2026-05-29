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

-- `IF NOT EXISTS` is defensive: this file was previously named
-- `0011_notes_changed_at.sql` and applied to the dev Neon branch
-- under that name. After the renumber (commit c6a945f), the dev DB
-- has the column already but the migrator sees `0013_*` as a new
-- file. The guard makes the re-run a no-op rather than failing with
-- `42701 column already exists`. See
-- docs/v4/arch-cicd-and-migrations.md §Renumbering an applied migration.
ALTER TABLE app.reports
  ADD COLUMN IF NOT EXISTS notes_changed_at timestamptz;
