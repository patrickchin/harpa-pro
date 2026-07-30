-- Distributed login-rate-limit counters for the isolated admin service.
--
-- The admin browser routes must not use app.rate_limit_buckets: doing so
-- couples administrator access and readiness to the application database.
-- This table lives in the separate ADMIN_DATABASE_URL migration stream.
--
-- Expand-only. No drops.

CREATE TABLE admin.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_end timestamptz NOT NULL,
  count      integer NOT NULL,

  CONSTRAINT admin_rate_limit_buckets_count_check CHECK (count >= 0)
);

CREATE INDEX admin_rate_limit_buckets_window_end_idx
  ON admin.rate_limit_buckets (window_end);

REVOKE ALL ON admin.rate_limit_buckets FROM PUBLIC;
ALTER TABLE admin.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
