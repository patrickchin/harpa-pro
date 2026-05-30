-- 0003_report_last_generation.sql
-- Persist the last AI generation's prompt + raw response on each report
-- so the mobile Report Debug screen (P4.8 commit 2) can render it.
--
-- Stored as a single jsonb column ("last generation", not history) per
-- the design in docs/v4/design-maestro-full-regression.md §3.4.
--
-- Schema of the value:
--   {
--     "requestedAt":   "2026-05-22T10:00:00.000Z",
--     "finishedAt":    "2026-05-22T10:00:02.000Z" | null,
--     "vendor":        "openai" | "anthropic" | ...,
--     "model":         "gpt-4o-mini",
--     "fixtureMode":   "live" | "replay" | "record",
--     "systemPrompt":  "...",
--     "userPrompt":    "...",
--     "response":      "...",                     -- raw text from the LLM
--     "usage":         null | { inputTokens, outputTokens, cachedTokens? }
--   }
--
-- Nullable: pre-existing rows + never-generated drafts have NULL here,
-- and the Debug route returns `lastGeneration: null` in that case.

ALTER TABLE app.reports
  ADD COLUMN IF NOT EXISTS last_generation jsonb;
