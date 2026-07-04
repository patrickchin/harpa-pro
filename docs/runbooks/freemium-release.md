# Freemium subscription release

This is a blocking operator checklist. Do not upload store metadata, privacy
answers, or a production build until every checkbox has an owner, date, and
evidence link. Keep secrets and raw receipts out of the evidence.

## Current blockers

- [ ] The hosted Termly Privacy Policy is revised and published. Verification
      on 2026-07-05 found the live policy still dated 2026-06-14; it did not
      name RevenueCat and classified purchase history as not collected.
- [ ] The canonical hosted Terms URL is recorded below and the live text covers
      auto-renewal, monthly/annual billing periods, cancellation, allowance
      changes, and continued access through the paid period.
- [ ] Legal/product approved the App Store App Privacy and Google Play Data
      safety answers.

Evidence:

- Privacy URL: `https://harpapro.com/privacy`
- Hosted policy evidence:
- Terms URL:
- Legal approver/date:

## RevenueCat

- [ ] Entitlement identifier is exactly `pro`.
- [ ] One current offering has monthly and annual packages.
- [ ] The iOS monthly/annual products are attached and fetch in sandbox.
- [ ] The Android monthly/annual base plans are attached and fetch in sandbox.
- [ ] Restore behavior is **Transfer to new App User ID**.
- [ ] The webhook URL targets `POST /webhooks/revenuecat`.
- [ ] The webhook authorization header matches the API secret.
- [ ] A sandbox event returned 200 and updated the intended `usr_...` row.
- [ ] Out-of-order and duplicate webhook delivery left the newest state intact.
- [ ] Public iOS/Android SDK keys exist in the matching EAS environments.
- [ ] The RevenueCat secret API key and webhook authorization value exist only
      in API secrets, never in `EXPO_PUBLIC_*` values.

Evidence/owner/date:

## App Store Connect

- [ ] One subscription group contains monthly and annual auto-renewable
      products.
- [ ] US reference prices are US$19.99 monthly and US$149.99 annual.
- [ ] Automatically generated storefront prices were reviewed; no converted
      non-US price was copied into app or metadata source.
- [ ] The RevenueCat paywall shows Privacy Policy and Terms links.
- [ ] App Privacy discloses purchase history for app functionality/analytics,
      linked to Harpa User ID, with no advertising tracking.
- [ ] Review notes identify the paywall entry points, restore path, demo
      account, and fully usable Free path.
- [ ] A legal-approved `fastlane/app_store/app_privacy_details.json` was
      generated, reviewed, and committed before any production upload.

Evidence/owner/date:

## Google Play Console

- [ ] One subscription has monthly and annual base plans.
- [ ] Automatic regional prices were reviewed.
- [ ] Data safety discloses purchase history and user id for app
      functionality/analytics and no advertising tracking.
- [ ] The privacy URL and required subscription disclosures are configured.
- [ ] License testers completed purchase, cancel, expiry, and restore paths.
- [ ] Grace period and account hold are configured and tested.

Evidence/owner/date:

## Legal, support, and product behavior

- [ ] The hosted Privacy Policy discloses RevenueCat, purchase history, Harpa
      user id, Apple receipts/Google purchase tokens, entitlement validation,
      analytics purposes, retention/deletion, and international processing.
- [ ] Hosted Privacy and Terms changes are live before metadata upload.
- [ ] Support has current refund, cancellation, restore, and transfer steps for
      both stores.
- [ ] Account deletion warns that deleting Harpa does not cancel the external
      store subscription.
- [ ] RevenueCat transfer behavior and deletion/re-registration were tested.
- [ ] Free voice recording, upload, transcription, summary, and report
      generation work below the 5 MiB and weighted-token allowances.
- [ ] Purchase/restore awaits server verification; mobile CustomerInfo alone
      never authorizes a Pro API request.

Evidence/owner/date:

## Enforcement rollout and rollback

- [ ] `FREEMIUM_ENFORCEMENT_AT` is the agreed next UTC month boundary.
- [ ] `FREEMIUM_ENFORCEMENT_ENABLED=1` is scheduled only after the legal/store
      gates above are complete.
- [ ] The rollout owner is named and monitoring covers billing-sync failures,
      webhook failures, 403 limits, 413 uploads, API 5xx, and support volume.
- [ ] The rollback owner tested setting `FREEMIUM_ENFORCEMENT_ENABLED=0` and
      redeploying the API. This restores legacy generous AI limits and the
      50 MiB upload ceiling without deleting entitlement or user data.

Planned enforcement timestamp:

Rollout owner:

Rollback owner and evidence:

## Safe local validation

These commands inspect source-controlled metadata and build configuration. They
must not upload anything:

```bash
cd apps/mobile
bundle exec fastlane doctor
```

Record the output and Fastlane version here:

- 2026-07-05: blocked before Fastlane started. Bundler could not find the
  locked `fastlane-2.228.0` gem and its dependencies locally. No gems were
  installed and no store metadata was uploaded.

## Production stop conditions

Stop the release if any required check is missing, the hosted policy is stale,
store products do not return localized prices, sandbox verification disagrees
with `/me/limits`, required checks fail, or the enforcement timestamp is not a
UTC month boundary. Do not work around these conditions with a manual plan
change or by treating mobile CustomerInfo as server authority.
