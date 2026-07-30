-- Initial schema for the separate Harpa Pro admin database.
--
-- This file must run only through `db:migrate:admin` against
-- ADMIN_DATABASE_URL. It intentionally creates no objects in the app
-- database and has no foreign keys to Better Auth or application users.

CREATE DOMAIN admin.adm_id AS text
  CHECK (VALUE ~ '^adm_[0-9a-hjkmnp-tv-z]{8,16}$');

CREATE DOMAIN admin.ads_id AS text
  CHECK (VALUE ~ '^ads_[0-9a-hjkmnp-tv-z]{8,16}$');

CREATE TABLE admin.identities (
  id                  admin.adm_id PRIMARY KEY,
  email               text NOT NULL,
  password_hash       text NOT NULL,
  disabled_at         timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_identities_email_key UNIQUE (email),
  CONSTRAINT admin_identities_email_check CHECK (
    email = lower(email)
    AND length(email) <= 320
    AND email ~ '^[^@[:space:]]+@harpapro[.]com$'
  ),
  CONSTRAINT admin_identities_password_hash_check CHECK (
    password_hash ~
      '^scrypt-v1[$]16384[$]8[$]5[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{86}$'
  )
);

CREATE TABLE admin.sessions (
  id                admin.ads_id PRIMARY KEY,
  admin_identity_id admin.adm_id NOT NULL
                    REFERENCES admin.identities(id) ON DELETE CASCADE,
  token_hash        text NOT NULL,
  expires_at        timestamptz NOT NULL,
  idle_expires_at   timestamptz NOT NULL,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT admin_sessions_token_hash_check CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT admin_sessions_expiry_order_check CHECK (
    idle_expires_at <= expires_at
  )
);

CREATE INDEX admin_sessions_identity_idx
  ON admin.sessions(admin_identity_id);

CREATE INDEX admin_sessions_active_expiry_idx
  ON admin.sessions(expires_at, idle_expires_at)
  WHERE revoked_at IS NULL;

REVOKE ALL ON admin.identities FROM PUBLIC;
REVOKE ALL ON admin.sessions FROM PUBLIC;

ALTER TABLE admin.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.sessions ENABLE ROW LEVEL SECURITY;
