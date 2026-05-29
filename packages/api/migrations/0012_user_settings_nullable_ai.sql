-- 0012: relax user_settings ai_vendor/ai_model to NULLable.
--
-- v4 introduces a paired-nullable shape on /settings/ai:
--   {vendor:null, model:null}    → user has not picked; live calls
--                                  use LIVE_DEFAULT_MODELS.
--   {vendor:'openai', model:..}  → user picked; live calls use it.
--
-- The 0001 schema baked in a NOT NULL + DEFAULT 'openai' / 'gpt-4o-mini'
-- pair, which silently pinned every user to gpt-4o-mini and made
-- "use server default" unrepresentable. Drop the constraints AND the
-- column defaults — the service layer is now the single source of
-- truth for the default model. Existing rows with the legacy
-- defaults are preserved as-is; `getAiSettings()` tolerates them
-- via the AI_MODELS whitelist (legacy models fall through to null).

ALTER TABLE app.user_settings ALTER COLUMN ai_vendor DROP NOT NULL;
ALTER TABLE app.user_settings ALTER COLUMN ai_vendor DROP DEFAULT;
ALTER TABLE app.user_settings ALTER COLUMN ai_model  DROP NOT NULL;
ALTER TABLE app.user_settings ALTER COLUMN ai_model  DROP DEFAULT;
