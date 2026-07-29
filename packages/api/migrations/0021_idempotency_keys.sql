-- 0021_idempotency_keys.sql
--
-- Durable, cross-machine Idempotency-Key response store. A pending row
-- is a short lease owned by one API machine; a completed row holds the
-- replayable HTTP response for the route TTL (24h by default).
--
-- The API stores only a SHA-256 hash of the scoped key. Raw client keys,
-- user ids, paths, and request bodies never land in this table.
--
-- Expand-only: new empty table, no backfill or destructive operation.

CREATE TABLE IF NOT EXISTS app.idempotency_keys (
  key_hash          text PRIMARY KEY
                    CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL
                    CHECK (state IN ('pending', 'completed')),
  owner_token       text,
  lease_expires_at  timestamptz,
  status            integer
                    CHECK (status BETWEEN 100 AND 499),
  response_body     text,
  content_type      text,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_state_shape CHECK (
    (
      state = 'pending'
      AND owner_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND status IS NULL
      AND response_body IS NULL
      AND content_type IS NULL
    )
    OR
    (
      state = 'completed'
      AND owner_token IS NULL
      AND lease_expires_at IS NULL
      AND status IS NOT NULL
      AND response_body IS NOT NULL
      AND content_type IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
  ON app.idempotency_keys (expires_at);
