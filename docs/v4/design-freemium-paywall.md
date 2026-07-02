# Freemium paywall design

**Status:** Approved for implementation planning on 2026-07-03.

**Dependency:** The implementation PR must be based on `dev` after
[PR #191](https://github.com/patrickchin/harpa-pro/pull/191) merges. That PR
creates the `apps/site` documentation and privacy-policy surfaces this feature
must update.

## Summary

Harpa Pro will remain useful without payment while charging individual users
for a larger monthly AI allowance and larger uploads. The first paid product is
one Pro entitlement sold as monthly and annual auto-renewing subscriptions on
iOS and Android.

RevenueCat owns store receipt validation and subscription lifecycle handling.
The Harpa API remains authoritative for access control: mobile purchase state
can improve responsiveness, but it never grants server-side quota by itself.

This design deliberately reuses the existing `free | pro | enterprise` plan,
monthly usage aggregation, admin overrides, Usage screen, and limit dialog.
It does not introduce report-count limits, total-storage accounting, team
billing, consumable credits, trials, or web checkout.

## Product definition

### Plans

| Plan | Monthly AI allowance | Maximum file size | Purchase path |
| --- | ---: | ---: | --- |
| Free | 1,000,000 weighted input tokens and 100,000 weighted output tokens | 5 MiB | Created automatically at sign-up |
| Pro | 10,000,000 weighted input tokens and 1,000,000 weighted output tokens | 50 MiB | App Store or Google Play subscription |
| Enterprise | Existing admin-managed limits | 50 MiB | Existing admin path |

Free retains the complete core workflow, including text notes, photos, voice
notes, AI report generation, editing, PDF export, and project sharing. The
limits regulate metered capacity rather than hiding the core product.

The existing count buckets (`report_generate`, `voice_transcribe`, and
`voice_summarize`) become unbounded for Free and Pro. Adding a raw generation
count later remains a small configuration change. Counting distinct reports
would require a separate design because auto-regeneration currently creates
multiple generation events for one report.

The file-size limit applies only to new uploads. A downgrade never deletes or
hides files that were uploaded while Pro was active. Current photo processing
already targets 2 MiB, and a maximum-length 15-minute voice note at 32 kbps is
approximately 3.6 MB, so the 5 MiB Free ceiling preserves both core paths.

### Pricing

- US reference price: **US$19.99 monthly**.
- US reference price: **US$149.99 annually**.
- No introductory trial in v1; the permanent Free plan is the evaluation path.
- Apple and Google automatically generate localized prices at launch.
- Country-specific overrides may be introduced after conversion data exists.
- Every paywall renders the localized product price returned by the store. App
  code and public copy must not hardcode a converted local price.

The store products map to one RevenueCat entitlement named `pro`. RevenueCat's
standard monthly and annual package identifiers are used inside one current
offering. Users cannot accidentally hold two tiers of the same entitlement.

## Weighted token accounting

Raw token counts remain the source of truth and continue to appear on the Usage
screen. A static model table adds input and output multipliers relative to the
default cost-efficient model. For example, GPT-4.1 mini is `1x`; a model whose
input or output price is five times higher consumes five weighted tokens for
each raw token in that dimension.

The multiplier table is code, not database configuration:

- Every selectable live model must have explicit input and output multipliers.
- A contract test compares the model catalogue with the multiplier table.
- An unpriced model cannot be selected in live mode.
- Multiplier changes deploy only at a UTC month boundary so the effective
  allowance does not move midway through a billing month.
- Existing `llm_usage_events` rows remain unchanged. Monthly enforcement groups
  successful rows by vendor and model, applies the table, and sums weighted
  input and output tokens.

Transcription seconds remain outside the weighted allowance in v1. Voice-note
summarization consumes text tokens and therefore still contributes to the cap.
Audio-cost normalization can be added later if production cost data shows it is
needed.

## Entitlement architecture

### RevenueCat identity and configuration

Mobile configures RevenueCat only after better-auth has an authenticated user
and passes the existing non-email `usr_...` identifier as the RevenueCat App
User ID. This provides one identity across iOS, Android, reinstalls, and signed-
in devices without sending the user's email address to RevenueCat.

The public iOS and Android RevenueCat SDK keys are parsed through the existing
mobile env module. The RevenueCat secret API key and webhook authorization
secret are parsed through the API env module. No secret is compiled into the
mobile app.

Logout clears the authenticated RevenueCat identity. Purchases are available
only after Harpa authentication, so anonymous RevenueCat users cannot buy an
entitlement that is not attached to a Harpa account.

RevenueCat restore behavior is set to **Transfer to new App User ID**. A restore
therefore moves the store purchase to the currently authenticated Harpa account
instead of sharing it across accounts or trapping it on a deleted account. Only
one Harpa account has the entitlement at a time.

### Database state

A new `app.billing_entitlements` table stores the server-confirmed state:

- `user_id` (primary key and foreign key to the better-auth user)
- `provider` (`revenuecat` in v1)
- `entitlement_id` (`pro` in v1)
- `product_id`
- `store` (`app_store` or `play_store`)
- `active`
- `expires_at`
- `last_event_id`
- `last_event_at`
- `synced_at`

Users may read their own row through the scoped role but may not write it.
Authenticated sync writes are performed only after the API verifies state with
RevenueCat. The webhook uses a narrow billing service rather than exposing a
general unscoped database handle.

The effective plan is the higher of:

1. `public.user.plan`, which continues to support admin-assigned Pro or
   Enterprise access; and
2. an active, unexpired RevenueCat `pro` entitlement.

This precedence prevents a refund, cancellation, delayed webhook, or account
sync from downgrading an admin-assigned Enterprise account. Per-user usage
overrides retain their current precedence over plan defaults.

### Synchronization

Two paths call one server-side `syncRevenueCatEntitlement(userId)` function:

1. `POST /me/billing/sync`, called after purchase, restore, and an explicit
   refresh from Account; and
2. `POST /webhooks/revenuecat`, called for subscription lifecycle events.

The API fetches current customer state from RevenueCat instead of trusting
client-supplied entitlement fields or deriving state independently for every
webhook event type. Webhook authorization uses a dedicated secret and a
constant-time comparison. Duplicate and older events are harmless: the stored
event id and timestamp prevent stale state from replacing newer state.

Cancellation preserves Pro until the paid entitlement expires. Refunds and
revocations remove Pro after the next successful server verification. A failed
RevenueCat request leaves the last server-confirmed state in place and records
an operational error; it never deletes user data or trusts the client as a
fallback.

## API behavior

`GET /me/limits` and the limits included in `GET /me/usage` return the effective
plan and weighted token usage. Raw monthly token history remains available in
the existing usage response so the UI can show both percentage and details.

The existing `usage_limit_exceeded` response remains the AI quota contract. Its
details identify the weighted input or output bucket, used amount, allowance,
effective plan, and next UTC reset.

`POST /files/presign` loads the effective plan before minting an R2 URL and
rejects oversized uploads with HTTP 413 and a stable
`file_size_limit_exceeded` error. Details contain `sizeBytes`, `limitBytes`, and
`plan`. Registration repeats the plan/size check as defense in depth. The R2
signature continues to bind `Content-Length`, so the client cannot upload more
bytes than the accepted presign request.

The mobile client performs the same file-size check before enqueueing to give
immediate feedback, but server enforcement is authoritative.

## Mobile experience

Use `react-native-purchases` and `react-native-purchases-ui` with the existing
Expo development-client workflow. A native rebuild is required; this feature
cannot ship as an OTA-only update.

RevenueCat Paywalls and Customer Center provide the purchase, restore, and
management UI. Harpa-owned entry points are small:

- **Usage:** Free accounts see `Upgrade to Pro`; all accounts see combined AI
  usage percentage plus existing raw input/output token details.
- **AI limit dialog:** Free accounts receive an `Upgrade` action alongside the
  reset date. Pro/Enterprise accounts receive the existing support path.
- **File-size dialog:** Free accounts see the 5 MiB ceiling and an `Upgrade`
  action. Paid accounts see the normal 50 MiB error without an upgrade claim.
- **Account:** `Manage subscription` and `Restore purchases` appear in the
  billing section. Manage opens the store/customer-center destination for the
  platform where the subscription was purchased.
- **Signup:** No blocking paywall and no automatic paywall on first launch.

Purchase cancellation, pending payment, store unavailability, and network
failure keep the user on the current screen with familiar error copy and a safe
retry. All dialogs use `AppDialogSheet`; no `Alert.alert` is introduced.

Account deletion warns active subscribers that deleting a Harpa account does
not itself cancel an App Store or Google Play subscription and links to
subscription management. The configured transfer-to-new-user behavior is
exercised for reinstall, new device, sign-out/sign-in, and account recreation
before release.

## Privacy, store listings, and public documentation

These changes are release blockers, not follow-up work.

### Privacy and terms

The hosted Termly policy embedded by `apps/site/src/pages/privacy.astro` must be
updated before production release to disclose RevenueCat as a processor and
describe purchase history, the Harpa user identifier, Apple receipts/Google
purchase tokens, entitlement validation, analytics, retention, deletion, and
international processing. The repository page's copy and verification date
are updated after the hosted policy is live.

Terms presented from the paywall must describe auto-renewal, billing periods,
cancellation, and the Free/Pro allowances. Store-provided localized price and
billing-period strings are authoritative.

### App Store Connect

- Create the monthly and annual subscription products in one subscription
  group and submit them with the binary.
- Set automatic storefront pricing from the US reference prices.
- Update the App Store description and promotional text to distinguish Free
  and Pro without promising fixed non-US prices.
- Keep the privacy-policy URL at `https://harpapro.com/privacy`.
- Update App Privacy answers to disclose purchase history for app functionality
  and analytics, linked to the Harpa user ID, with no advertising tracking.
- Add review notes covering the paywall, restore path, demo account, and how a
  reviewer can exercise the Free path without purchasing.
- Ensure the paywall exposes Privacy Policy and Terms of Use links.

Source-controlled copy lives under
`apps/mobile/fastlane/metadata/ios/en-US/`; reviewed privacy answers live in
`apps/mobile/fastlane/app_store/app_privacy_details.json` when generated.

### Google Play Console

- Create one subscription with monthly and annual base plans mapped to the
  RevenueCat `pro` entitlement.
- Use automatically converted regional prices at launch.
- Update the short/full descriptions and release notes under
  `apps/mobile/fastlane/metadata/android/en-US/`.
- Review and update the Data safety form for purchase history and user ID.
- Verify the privacy-policy URL, subscription disclosure, restore behavior,
  license testers, grace period, and account-hold configuration.

### Public docs after PR #191

After PR #191 merges, the implementation branch updates:

- `apps/site/src/content/docs/09-account-and-usage.mdx` with plan comparison,
  AI allowance behavior, reset timing, upgrade, restore, cancellation, and file
  limits;
- `apps/site/src/content/faq/05-cost.mdx` with the Free/Pro model and a note
  that stores show localized prices;
- `apps/site/src/pages/privacy.astro` after the hosted Termly policy changes;
  and
- relevant docs search/content tests and `lastVerified` dates.

`docs/v4/arch-usage-limits.md`, `docs/v4/architecture.md`, and
`docs/v4/plan-p5-beta-ga.md` are updated in the same implementation PR so the
admin-only billing carve-out and placeholder limits no longer describe the
shipping system.

## Verification

### API and contract

- Unit tests cover effective-plan precedence, weighted token math, unknown
  models, month-boundary multiplier changes, and 5/50 MiB selection.
- Migration and scope tests prove users can read only their own billing row and
  cannot mutate it.
- Integration tests cover purchase sync, valid/invalid webhook authorization,
  duplicate/out-of-order events, renewal, expiration, refund, admin Enterprise
  precedence, and both file-size limits.
- A default-wiring integration test uses a local fake RevenueCat HTTP server
  and asserts the billing row side effect without replacing the client factory.

### Mobile

- Provider tests cover auth transitions and RevenueCat identity cleanup.
- Screen/component tests cover every paywall entry point, localized price
  rendering, restore, pending/error states, and accessibility labels.
- Fixture billing mode drives Maestro through Free usage, an upgrade success,
  restore, and oversized-file rejection without touching a real store.
- One real-device sandbox smoke test on iOS and Android covers purchase,
  entitlement sync, cancellation/expiration, restore, and relaunch.

### Store and public surfaces

- Fastlane metadata validation passes with the revised copy.
- App Store privacy and Google Data safety answers receive human/legal review.
- The post-PR-#191 site build, content tests, Playwright docs test, and
  Lighthouse assertions pass after the pricing/privacy edits.

## Rollout and operations

1. Merge PR #191, then rebase the implementation branch onto updated `dev`.
2. Deploy the migration, RevenueCat client, sync routes, and webhook with the
   existing generous limits still active.
3. Configure sandbox/store products and validate purchase, restore, lifecycle,
   and account-deletion behavior.
4. Publish the updated hosted privacy policy, public docs, store metadata, and
   reviewed store privacy disclosures.
5. Ship the native mobile build with paywall entry points.
6. Enable Free/Pro allowances at the next UTC month boundary using a parsed API
   effective-date setting.
7. Keep a server-side enforcement kill switch for billing incidents. Disabling
   it restores the prior generous limits without changing entitlement records.
8. Monitor weighted AI cost, RevenueCat sync failures, webhook lag, purchase
   failures, restores, refunds, conversion, and file-size rejections before
   changing allowance values.

## Explicit non-goals

- Team seats, organization-owned entitlements, or per-project billing.
- Stripe or RevenueCat web checkout.
- Report-generation count limits or distinct-report accounting.
- Aggregate storage quotas, cleanup of existing files, or file-type gating.
- Consumable credits, overages, top-ups, free trials, coupons, or promotions.
- Audio-duration cost weighting.
- Custom paywall experimentation or a Harpa-owned subscription-management UI.
