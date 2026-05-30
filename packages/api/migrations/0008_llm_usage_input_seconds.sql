-- 0008_llm_usage_input_seconds.sql
--
-- Separate audio duration from LLM token counts. Before this migration,
-- `services/ai.ts::transcribe()` was packing `ceil(durationSec)` into
-- `input_tokens`, overloading one column with two units (LLM tokens
-- for chat/generate_report; seconds for transcribe). Downstream sums
-- in `auth/service.ts::fetchUsage` and
-- `services/usage-limits.ts::loadMonthUsage` were then arithmetically
-- meaningless.
--
-- Fix: dedicated `input_seconds numeric(10,3)` column for transcribe
-- rows. `input_tokens` stays a pure LLM-token count (0 for transcribe).
--
-- No backfill: the mixed-unit write only existed in an unmerged branch
-- (see PR #58). Pre-branch transcribe rows correctly have
-- `input_tokens = 0`, so leaving existing rows as `input_seconds NULL`
-- is correct historical behaviour ("no duration recorded").
--
-- Expand-only. No drops.

ALTER TABLE app.llm_usage_events
  ADD COLUMN IF NOT EXISTS input_seconds numeric(10,3)
    CHECK (input_seconds IS NULL OR input_seconds >= 0);
