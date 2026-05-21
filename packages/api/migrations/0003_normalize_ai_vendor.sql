-- Normalize ai_vendor rows for vendors removed in the AI-live cutover.
--
-- Context: the user-facing aiVendor enum was shrunk from
-- (kimi|openai|anthropic|google|zai|deepseek) to (kimi|openai). Any
-- existing user_settings row pointing at one of the removed vendors
-- would fail Zod validation on the next GET /settings/ai response.
-- Reset the offending rows to the application default (openai +
-- gpt-4o-mini) so existing users land on a usable provider rather
-- than a 500.
--
-- Idempotent — re-running is a no-op once all rows are normalized.
-- Expand-only (no schema change); safe under expand-contract.
--
-- Refs: docs/v4/arch-ai-fixtures.md, AI_LIVE rollout (feat/ai-live-prod-dev).

UPDATE app.user_settings
SET ai_vendor = 'openai',
    ai_model  = 'gpt-4o-mini',
    updated_at = now()
WHERE ai_vendor IN ('anthropic', 'google', 'zai', 'deepseek');
