-- 0020_billing_entitlements.sql
--
-- Server-confirmed subscription state. RevenueCat remains the receipt and
-- lifecycle authority; this row is the API's local authorization snapshot.

BEGIN;

CREATE TABLE app.billing_entitlements (
  user_id          text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider = 'revenuecat'),
  entitlement_id   text NOT NULL CHECK (entitlement_id = 'pro'),
  product_id       text,
  store            text CHECK (store IS NULL OR store IN ('app_store', 'play_store')),
  active           boolean NOT NULL DEFAULT false,
  expires_at       timestamptz,
  management_url   text,
  last_event_id    text UNIQUE,
  last_event_at    timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON app.billing_entitlements TO app_authenticated;

ALTER TABLE app.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_entitlements FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_entitlements_self_select ON app.billing_entitlements
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id', true));

COMMIT;
