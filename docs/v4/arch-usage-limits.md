# Freemium billing and usage limits

> Companion: [arch-api-design.md](arch-api-design.md),
> [arch-auth-and-rls.md](arch-auth-and-rls.md),
> [arch-mobile.md](arch-mobile.md), and
> [arch-storage.md](arch-storage.md).

## Product model

Harpa Pro has one useful Free plan and one individual Pro entitlement. Both
plans retain every core workflow, including voice notes, photos, documents,
report generation, and PDF export. There is no report-count limit in this
release.

| Allowance | Free | Pro | Enterprise |
| --- | ---: | ---: | ---: |
| Weighted AI input per UTC month | 1,000,000 | 10,000,000 | Unbounded |
| Weighted AI output per UTC month | 100,000 | 1,000,000 | Unbounded |
| Per-file upload ceiling | 5 MiB | 50 MiB | 50 MiB |

Allowances reset at `00:00:00Z` on the first day of each calendar month.
Free voice notes remain practical: the recorder caps notes at 15 minutes and
its target bitrate keeps a maximum-length note below 5 MiB.

Pro is the RevenueCat entitlement identifier `pro`. App Store and Play Store
products provide monthly and annual packages in one current RevenueCat
offering. Storefronts own localized prices and renewal disclosures; source code
does not contain converted country prices.

## Effective plan

`public."user".plan` remains the support/admin plan. RevenueCat state is stored
in `app.billing_entitlements`, one row per Harpa user. The effective plan is the
higher of:

1. the support/admin plan; and
2. an active, unexpired RevenueCat `pro` entitlement.

This preserves manually granted `pro` and `enterprise` access when a paid
entitlement expires or RevenueCat is temporarily unavailable. An inactive row
never downgrades an admin plan. Account deletion cascades to the entitlement
row but does not cancel the separate App Store or Play Store subscription; the
mobile confirmation tells the user to manage the subscription first.

The entitlement table forces row-level security. An authenticated user may
read their own row but cannot insert or update it. Only server verification
writes billing state.

## RevenueCat verification

Mobile configures `react-native-purchases` once, after a better-auth user is
available, using the stable `usr_...` id as RevenueCat App User ID. Native
CustomerInfo may make the UI feel responsive, but it never authorizes API work.

Server state is refreshed through two paths:

- `POST /me/billing/sync` fetches the authenticated user's RevenueCat
  subscriber record. Purchase and restore flows await this route before
  reporting verified Pro access.
- `POST /webhooks/revenuecat` accepts RevenueCat lifecycle events using a
  constant-time authorization-header comparison. Event ids and timestamps
  make repeated or out-of-order delivery idempotent.

The API derives the Harpa user only from the better-auth session for `/me` and
from validated `usr_...` identifiers for webhooks. A RevenueCat failure returns
`billing_sync_failed` without clearing the last confirmed entitlement row.

Runtime configuration:

- Mobile: `EXPO_PUBLIC_BILLING_ENABLED` and the platform-specific public SDK
  key. Public keys are supplied through EAS environments.
- API: `REVENUECAT_LIVE`, `REVENUECAT_SECRET_API_KEY`,
  `REVENUECAT_WEBHOOK_AUTH`, and `REVENUECAT_BASE_URL`.

The RevenueCat secret key and webhook authorization value must never use an
`EXPO_PUBLIC_*` variable.

## Weighted token accounting

Raw rows in `app.llm_usage_events` remain unchanged for audit and support.
Allowance usage groups the current UTC month's successful rows by vendor and
model, multiplies input and output separately, sums the weighted values, and
rounds each final total up with `Math.ceil`.

| Model | Input multiplier | Output multiplier |
| --- | ---: | ---: |
| `openai:gpt-4.1-nano` | 0.25 | 0.25 |
| `openai:gpt-4.1-mini` | 1 | 1 |
| `openai:gpt-4.1` | 5 | 5 |

Every selectable model requires an explicit multiplier. A coverage assertion
fails when the model catalogue gains an unmapped entry. Historical unknown
rows use `1×` so old usage remains readable.

Count buckets (`report_generate`, `voice_transcribe`, and `voice_summarize`)
remain in the API contract for compatibility and admin overrides, but their
Free and Pro defaults are unbounded. Only weighted input, weighted output, and
new-file size differ between Free and Pro.

Per-user rows in `app.user_limit_overrides` still take precedence over plan
defaults. `NULL` means use the plan value, `-1` means explicitly unbounded, and
an expired override is ignored.

## Enforcement and stable errors

`getEffectiveLimits` is the source of truth for `/me/limits`, `/me/usage`, AI
checks, and upload checks. It reads the effective plan, active override, and
current-month usage under the request's scoped database role.

AI routes call `enforceUsageLimit` before a provider side effect when the
request can be estimated. Actual provider usage is recorded as raw tokens and
becomes part of the next weighted check. A blocked call returns HTTP 403:

```json
{
  "error": {
    "code": "usage_limit_exceeded",
    "message": "Monthly usage limit reached.",
    "details": {
      "kind": "ai_input_tokens",
      "limit": 1000000,
      "used": 1000000,
      "remaining": 0,
      "resetAt": "2026-08-01T00:00:00.000Z",
      "plan": "free",
      "overridden": false
    }
  }
}
```

`POST /files/presign` rejects a new file before minting an R2 URL, and
`POST /files` repeats the effective-plan check before inserting a row. An
oversized file returns HTTP 413 with code `file_size_limit_exceeded` and typed
`sizeBytes`, `limitBytes`, and `plan` details. Existing files remain visible
after a downgrade.

The root mobile upload queue reads `fileSizeLimitBytes` from `/me/limits` and
preflights the main file, paired thumbnails, and complete batches. A loading or
unknown limit does not block locally; the API remains authoritative. A typed
413 is permanent, consumes no retry/backoff attempts, and opens one themed
dialog. No file type is hidden from Free users.

## Mobile surfaces

The Usage screen shows weighted input/output progress while retaining raw token
details. Free users can open the native RevenueCat paywall from the limits card
or a limit dialog. Pro and Enterprise users keep the reset/support path.

Account Details exposes **Manage subscription** through RevenueCat Customer
Center and **Restore purchases** through the store SDK. Purchase and restore
successes call the server sync route and invalidate `meLimits` and `meUsage`.
No screen automatically presents a paywall or blocks signup.

## Rollout and rollback

Freemium enforcement is guarded by both:

- `FREEMIUM_ENFORCEMENT_ENABLED=1`; and
- `FREEMIUM_ENFORCEMENT_AT`, an ISO timestamp on a UTC month boundary.

Before that instant, the legacy generous token limits and 50 MiB upload ceiling
remain active. To roll back enforcement, set
`FREEMIUM_ENFORCEMENT_ENABLED=0` and redeploy the API. This does not delete
billing rows, raw usage, or user files.

Release remains blocked until the RevenueCat, store-console, privacy, terms,
and sandbox checks in
[the freemium release runbook](../runbooks/freemium-release.md) are recorded.
