-- 0004_notes_voice_columns.sql
--
-- Voice-note pipeline (plan-voice-pipeline.md §Phase B,
-- arch-voice-pipeline.md §D3).
--
-- Expand-only:
--   - `title` is a generic short headline (≤ 200 chars at the DB
--     layer, capped to ≤ 80 in the voice aggregator's heuristic).
--     Today the voice aggregator is the only writer; text / image /
--     document notes leave it null but may populate it in the future
--     (e.g. user-supplied document title, photo caption).
--   - `summary` is a generic long-form summary. For `kind='voice'`
--     rows it is the canonical site-note body (what the report
--     generator reads); the aggregator mirrors it into `body` so
--     legacy readers stay sane.
--   - `transcript` keeps its existing meaning (raw transcription audit
--     trail).
--   - `duration_sec`, `language`, `transcribe_provider`,
--     `transcribed_at` are voice-only diagnostics surfaced by the
--     aggregator route.
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
