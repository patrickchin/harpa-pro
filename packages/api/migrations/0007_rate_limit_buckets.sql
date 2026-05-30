-- 0006_rate_limit_buckets.sql
--
-- Cross-machine rate-limit backend. Implements
-- `PostgresRateLimiter` (docs/v4/arch-rate-limiting.md §3.4) — atomic
-- INSERT … ON CONFLICT DO UPDATE RETURNING count. The bucket_key is
-- composed by the API layer as `<name>:<keyBy>:<value>|<windowStartMs>`
-- so collisions across limiters / windows are impossible.
--
-- Not RLS'd: this table is in the admin namespace and never exposed via
-- any route. The per-request scope wrapper (Pitfall 6) does not gate it
-- — the API talks to it through the `rawDb()` handle, same as
-- `auth.sessions`.
--
-- Expand-only. No drops.

CREATE TABLE IF NOT EXISTS app.rate_limit_buckets (
  bucket_key   text PRIMARY KEY,
  window_end   timestamptz NOT NULL,
  count        integer NOT NULL CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_end_idx
  ON app.rate_limit_buckets (window_end);
