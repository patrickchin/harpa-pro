-- 0006_usage_limits.sql
--
-- Per-account monthly usage caps. See docs/v4/arch-usage-limits.md.
--
-- Adds:
--   1. `auth.users.plan` — 'free' | 'pro' | 'enterprise' (default 'free').
--   2. `app.user_limit_overrides` — admin-managed per-user bumps. A NULL
--      column means "fall through to PLAN_LIMITS for the user's plan";
--      a non-NULL integer means "this is the effective limit"
--      (use -1 for unbounded; serialised on the wire as null).
--   3. Partial index on `app.llm_usage_events (user_id, created_at)`
--      WHERE status='ok' — powers the per-bucket count/sum queries
--      that `enforceUsageLimit` runs on every gated call.
--
-- RLS on overrides:
--   - SELECT: a user reads their own override row only. The route layer
--     doesn't expose direct override writes — only admin routes (mounted
--     under withAdmin) call into the upsert helper, which runs against
--     the raw pool (NOT the scoped accessor) since the admin acts on
--     someone else's row.
--   - No INSERT/UPDATE/DELETE policy is granted to app_authenticated.
--     The admin path explicitly uses the unscoped pool — same model as
--     `routes/admin.ts` waitlist export.
--
-- Expand-only. No drops, no constraint tightening on existing tables.

-- 1. Plan column.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise'));

-- 2. Overrides table.
--
-- Token columns are bigint to leave room for enterprise scale; count
-- columns stay integer. Sentinel -1 means "explicitly unbounded";
-- NULL means "no override, fall through to plan".
CREATE TABLE IF NOT EXISTS app.user_limit_overrides (
  user_id           app.usr_id PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  report_generate   integer  CHECK (report_generate  IS NULL OR report_generate  >= -1),
  voice_transcribe  integer  CHECK (voice_transcribe IS NULL OR voice_transcribe >= -1),
  voice_summarize   integer  CHECK (voice_summarize  IS NULL OR voice_summarize  >= -1),
  ai_input_tokens   bigint   CHECK (ai_input_tokens  IS NULL OR ai_input_tokens  >= -1),
  ai_output_tokens  bigint   CHECK (ai_output_tokens IS NULL OR ai_output_tokens >= -1),
  reason            text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  granted_by        app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz
);

-- app_authenticated may SELECT its own row only. No write grant —
-- admin mutations bypass the scoped role (see routes/admin.ts).
GRANT SELECT ON app.user_limit_overrides TO app_authenticated;

ALTER TABLE app.user_limit_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_limit_overrides_self_select ON app.user_limit_overrides;
CREATE POLICY user_limit_overrides_self_select ON app.user_limit_overrides
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id')::app.usr_id);

-- 3. Index for enforceUsageLimit's hot path.
CREATE INDEX IF NOT EXISTS llm_usage_events_user_status_created_idx
  ON app.llm_usage_events (user_id, created_at)
  WHERE status = 'ok';
