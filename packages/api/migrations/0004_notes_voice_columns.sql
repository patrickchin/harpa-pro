-- 0004_notes_voice_columns.sql
--
-- Voice-note pipeline (plan-voice-pipeline.md §Phase B,
-- arch-voice-pipeline.md §D3).
--
-- Expand-only:
--   - `summary` is the canonical site-note body for voice notes
--     (the text the report generator should read).
--   - `title` is a very short headline (≤ 80 chars) derived from
--     `summary` by the aggregator so list views can show a one-line
--     label without truncating the body. Today it is heuristically
--     extracted (first sentence of `summary`, trimmed); the column is
--     in place so we can upgrade to a dedicated LLM call later
--     without a follow-up migration.
--   - `transcript` keeps its existing meaning (raw transcription audit
--     trail).
--   - `duration_sec`, `language`, `transcribe_provider`,
--     `transcribed_at` are diagnostics surfaced by the aggregator
--     route.
--
-- All columns are NULL-able so this migration is a no-op for existing
-- rows. Backfill (`UPDATE notes SET summary = body WHERE kind='voice'
-- AND summary IS NULL`) lands as a follow-up commit once the
-- aggregator has been writing the new shape for a while.
--
-- No drops. No renames. No constraint tightening. Old readers that
-- only know `body` + `transcript` continue to work; the aggregator
-- mirrors `summary` into `body` so the legacy field stays
-- human-readable.

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS title               text
    CHECK (title IS NULL OR length(title) <= 200),
  ADD COLUMN IF NOT EXISTS summary             text,
  ADD COLUMN IF NOT EXISTS duration_sec        integer
    CHECK (duration_sec IS NULL OR duration_sec >= 0),
  ADD COLUMN IF NOT EXISTS language            text,
  ADD COLUMN IF NOT EXISTS transcribe_provider text,
  ADD COLUMN IF NOT EXISTS transcribed_at      timestamptz;
