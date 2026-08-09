-- 0029_llm_usage_events_created_at.notx.sql
--
-- Global time-window index for the bounded administrator AI usage summary.
-- Existing indexes begin with user_id and remain authoritative for user-scoped
-- reads. This index supports a current-month or 24-hour range across retained
-- ledger events without introducing a rollup table or second accounting source.
--
-- This file intentionally runs outside the migration runner's transaction.
-- Concurrent index construction cannot run inside a transaction block. If the
-- statement fails, PostgreSQL can leave an invalid index with this name while
-- the migration ledger remains unchanged. Recovery is to inspect pg_index,
-- remove that invalid index concurrently, and rerun the migration.
--
-- Expand-only. No table rewrite or data backfill.

CREATE INDEX CONCURRENTLY llm_usage_events_created_at_idx
  ON app.llm_usage_events (created_at DESC);
