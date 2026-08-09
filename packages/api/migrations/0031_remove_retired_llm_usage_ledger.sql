-- 0031_remove_retired_llm_usage_ledger.sql
--
-- Data-only cleanup for the retired migration identity that exists only in
-- the development ledger. The schema repair is intentionally separate in
-- 0030. Production does not contain this row, so this exact delete is a no-op
-- there. The current `0003_report_last_generation.sql` row is not touched.

DELETE FROM app._migrations
WHERE name = '0003_llm_usage_events.sql';
