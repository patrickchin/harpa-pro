# Freemium paywall implementation plan

> **For the implementer:** Use `superpowers:test-driven-development` for each
> behavior-changing task and `superpowers:verification-before-completion` before
> claiming the feature is ready. Keep each task on the same feature branch and
> make the listed commit before moving to the next task.

**Status:** Ready to execute after PR #191 merges into `dev`.

**Goal:** Ship one individual Pro subscription that raises monthly weighted AI
allowances and the per-file upload ceiling while preserving every core workflow,
including voice notes, for Free users.

**Architecture:** RevenueCat owns App Store and Play Store receipt validation,
paywalls, restore, and subscription management. The API verifies RevenueCat
state and stores one server-authoritative entitlement row per user. The existing
usage-limit service computes the higher of an admin plan and a paid entitlement,
then applies model-cost multipliers to raw monthly token rows. The existing
upload queue performs a single cross-feature file-size preflight; the API repeats
the check before presign and registration.

**Technology:** Hono, Drizzle/Postgres, Zod/OpenAPI, Vitest/Testcontainers,
Expo/React Native, TanStack Query, `react-native-purchases`,
`react-native-purchases-ui`, RevenueCat Paywalls and Customer Center, Astro,
Fastlane metadata.

**Approved product values:**

| Setting | Free | Pro | Enterprise |
| --- | ---: | ---: | ---: |
| Monthly weighted input tokens | 1,000,000 | 10,000,000 | Unbounded/default admin behavior |
| Monthly weighted output tokens | 100,000 | 1,000,000 | Unbounded/default admin behavior |
| Maximum file size | 5 MiB | 50 MiB | 50 MiB |
| Report/voice count buckets | Unbounded | Unbounded | Unbounded |

The US reference prices are US$19.99/month and US$149.99/year. Never render
those literals in the app; RevenueCat Paywalls must display the localized store
price. There is no trial, report-count limit, total-storage quota, file-type
restriction, web checkout, or custom paywall UI in this version.

---

## Task 0: Rebase after the documentation-site dependency lands

**Files:**

- Verify: `apps/site/src/pages/privacy.astro`
- Verify: `apps/site/src/content/docs/09-account-and-usage.mdx`
- Verify: `apps/site/src/content/faq/05-cost.mdx`
- Verify: `apps/site/package.json`

**Step 1: Wait for PR #191 to merge**

Do not start implementation from the PR's draft head. Confirm PR #191 is merged
into `dev`, then fetch and rebase this branch onto the resulting `origin/dev`.

```bash
git fetch origin
git rebase origin/dev
```

Expected: the rebase completes without dropping
`docs/v4/design-freemium-paywall.md` or this plan, and `apps/site` exists.

**Step 2: Re-run the dependency checks**

```bash
test -f apps/site/src/pages/privacy.astro
test -f apps/site/src/content/docs/09-account-and-usage.mdx
test -f apps/site/src/content/faq/05-cost.mdx
pnpm --filter @harpa/site typecheck
```

Expected: all files exist and the site typecheck passes before feature edits.

No commit is needed unless conflict resolution changes tracked files.

---

## Task 1: Define billing and file-limit wire contracts

**Files:**

- Create: `packages/api-contract/src/schemas/billing.ts`
- Create: `packages/api-contract/src/schemas/billing.test.ts`
- Modify: `packages/api-contract/src/schemas/usage-limits.ts`
- Modify: `packages/api-contract/src/schemas/files.ts`
- Modify: `packages/api-contract/src/schemas/auth.ts`
- Modify: `packages/api-contract/src/schemas/auth.test.ts`
- Modify: `packages/api-contract/src/schemas/index.ts`
- Modify: `packages/api-contract/src/index.test.ts`

**Step 1: Write failing contract tests**

Add tests that pin these shapes:

```ts
billingEntitlement = {
  entitlementId: 'pro',
  productId: string | null,
  store: 'app_store' | 'play_store' | null,
  active: boolean,
  expiresAt: ISODateTime | null,
  managementUrl: URL | null,
  syncedAt: ISODateTime,
}

billingSyncResponse = {
  plan: 'free' | 'pro' | 'enterprise',
  entitlement: billingEntitlement | null,
}
```

Also require:

- `limitsResponse.fileSizeLimitBytes` is a positive integer;
- `auth.usageResponse.fileSizeLimitBytes` accepts the same optional field for
  backward-compatible usage responses;
- `fileSizeLimitExceededDetails` parses `sizeBytes`, `limitBytes`, and `plan`;
- presign and registration accept values through 50 MiB but reject larger
  values at schema validation;
- `billing` is exported through the schema barrel.

Run the new tests and confirm they fail because the schemas do not exist yet:

```bash
pnpm --filter @harpa/api-contract test -- \
  src/schemas/billing.test.ts src/index.test.ts
```

Expected: FAIL on missing billing exports and missing file-size fields.

**Step 2: Add the minimum schemas**

In `billing.ts`, export `billingEntitlement` and `billingSyncResponse`. Reuse
`usageLimits.plan` and `_shared.isoDateTime`; do not duplicate the plan enum.

In `usage-limits.ts`, extend `limitsResponse` with:

```ts
fileSizeLimitBytes: z.number().int().positive()
```

Add the same field as optional on `auth.usageResponse` so older API payloads
remain parseable while new clients can use one value from either usage route.

In `files.ts`, define and export:

```ts
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const fileSizeLimitExceededDetails = z.object({
  sizeBytes: z.number().int().positive(),
  limitBytes: z.number().int().positive(),
  plan,
});
```

Apply `MAX_FILE_SIZE_BYTES` to `sizeBytes` in both `presignRequest` and
`registerFileRequest`. The 5 MiB Free rule belongs in the service layer because
it depends on the authenticated user's effective plan.

**Step 3: Run contract verification**

```bash
pnpm --filter @harpa/api-contract test -- \
  src/schemas/billing.test.ts src/index.test.ts
pnpm --filter @harpa/api-contract typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/api-contract/src/schemas packages/api-contract/src/index.test.ts
git commit -m "feat(contract): define billing and upload limits"
```

---

## Task 2: Add the server-authoritative entitlement row

**Files:**

- Create: `packages/api/migrations/0020_billing_entitlements.sql`
- Modify: `packages/api/src/db/schema.ts`
- Create: `packages/api/src/services/plans.ts`
- Create: `packages/api/src/__tests__/plans.unit.test.ts`
- Create: `packages/api/src/__tests__/scope/billing.scope.test.ts`
- Modify: `packages/api/src/__tests__/account-deletion.integration.test.ts`

**Step 1: Write failing effective-plan unit tests**

Test a pure helper with this precedence table:

| Admin plan | Active paid `pro` | Result |
| --- | --- | --- |
| `free` | no | `free` |
| `free` | yes | `pro` |
| `pro` | no | `pro` |
| `enterprise` | yes | `enterprise` |

Also test that an entitlement is inactive when `active=false` or `expiresAt` is
at/before `now`, and active for a `null` expiry.

```bash
pnpm --filter @harpa/api test:unit -- src/__tests__/plans.unit.test.ts
```

Expected: FAIL because `services/plans.ts` is absent.

**Step 2: Implement the pure plan helpers**

Create `services/plans.ts` with:

- `PLAN_RANK = { free: 0, pro: 1, enterprise: 2 }`;
- `isEntitlementActive(row, now)`;
- `higherPlan(adminPlan, paidPlan)`;
- `effectivePlanFrom(adminPlan, entitlement, now)`.

Keep these functions free of database and RevenueCat concerns so all precedence
logic stays easy to test.

**Step 3: Add the migration and Drizzle definition**

Create `app.billing_entitlements` with:

```sql
user_id          text primary key references public."user"(id) on delete cascade,
provider         text not null check (provider = 'revenuecat'),
entitlement_id   text not null check (entitlement_id = 'pro'),
product_id       text,
store            text check (store in ('app_store', 'play_store')),
active           boolean not null default false,
expires_at       timestamptz,
management_url   text,
last_event_id    text unique,
last_event_at    timestamptz,
synced_at        timestamptz not null default now()
```

Enable and force RLS. Add only a self-`SELECT` policy using
`current_setting('app.user_id', true)`; do not grant scoped users `INSERT`,
`UPDATE`, or `DELETE`. The narrow billing service in Task 3 writes through
`rawDb()` after RevenueCat verification.

Mirror the table in `db/schema.ts` and export `billingEntitlements`.

**Step 4: Write and run scope tests**

In `billing.scope.test.ts`, seed Alice and Bob through the unscoped setup
connection, then prove:

1. Alice's scoped connection sees only Alice's row.
2. Alice cannot `INSERT`, `UPDATE`, or `DELETE` either row.
3. An unscoped negative control sees both rows.

Extend account-deletion integration coverage to assert deleting the user
cascades the billing row while leaving the provider subscription as an external
operator concern.

```bash
pnpm --filter @harpa/api test:integration -- \
  src/__tests__/scope/billing.scope.test.ts \
  src/__tests__/account-deletion.integration.test.ts
```

Expected: PASS with migration `0020_billing_entitlements.sql` applied.

**Step 5: Commit**

```bash
git add packages/api/migrations/0020_billing_entitlements.sql \
  packages/api/src/db/schema.ts packages/api/src/services/plans.ts \
  packages/api/src/__tests__/plans.unit.test.ts \
  packages/api/src/__tests__/scope/billing.scope.test.ts \
  packages/api/src/__tests__/account-deletion.integration.test.ts
git commit -m "feat(api): persist billing entitlements"
```

---

## Task 3: Verify RevenueCat state through sync and webhook routes

**Files:**

- Create: `packages/api/src/services/revenuecat.ts`
- Create: `packages/api/src/services/billing.ts`
- Create: `packages/api/src/routes/billing.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/env.ts`
- Modify: `packages/api/src/__tests__/env.test.ts`
- Modify: `packages/api/src/__tests__/setup-env.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Create: `packages/api/src/__tests__/revenuecat.unit.test.ts`
- Create: `packages/api/src/__tests__/billing.integration.test.ts`
- Create: `packages/api/src/__tests__/billing.default-wiring.integration.test.ts`

**Step 1: Add failing client normalization tests**

Cover RevenueCat subscriber payloads for:

- no `pro` entitlement;
- active subscription with future `expires_date`;
- cancelled-but-paid-through subscription, which remains active until expiry;
- expired entitlement;
- App Store and Play Store mapping;
- nullable lifetime expiry;
- `management_url` preservation;
- malformed/non-2xx response.

The normalized result must contain only the fields in the billing contract.

```bash
pnpm --filter @harpa/api test:unit -- src/__tests__/revenuecat.unit.test.ts
```

Expected: FAIL because the client does not exist.

**Step 2: Implement the RevenueCat client factory**

`createRevenueCatClient()` reads parsed env only and exposes
`getSubscriber(userId)`. It performs:

```text
GET {REVENUECAT_BASE_URL}/subscribers/{encodeURIComponent(userId)}
Authorization: Bearer {REVENUECAT_SECRET_API_KEY}
Content-Type: application/json
```

Use the standard `fetch` implementation so the default-wiring integration test
can point `REVENUECAT_BASE_URL` at a local fake HTTP server. Do not accept
entitlement fields from the mobile request.

**Step 3: Add parsed env configuration**

Add:

```text
REVENUECAT_LIVE=0|1                 default 0
REVENUECAT_SECRET_API_KEY           required when live
REVENUECAT_WEBHOOK_AUTH             required when live
REVENUECAT_BASE_URL                 URL, default https://api.revenuecat.com/v1
```

Update env tests, test setup, `.env.example`, and `docker-compose.yml`. Boot
must fail when live without either secret. Keep the replay/local/test path
free of placeholder production secrets.

**Step 4: Write failing route integration tests**

For `POST /me/billing/sync`, prove:

- unauthenticated requests return 401;
- live billing disabled returns 503 without contacting RevenueCat;
- the user id comes only from the better-auth session;
- verified active `pro` state upserts the row and returns effective `pro`;
- verified inactive state does not downgrade an admin `pro` or `enterprise`;
- RevenueCat failure returns 502 and preserves the last confirmed row.

For `POST /webhooks/revenuecat`, prove:

- live billing disabled returns 503;
- missing/incorrect `Authorization` returns 401;
- constant-time comparison is used after a byte-length check;
- event user resolution accepts a Harpa `usr_...` id from `app_user_id`,
  `original_app_user_id`, or `aliases`, and rejects an event with none;
- duplicate `event.id` and events older than `last_event_at` return 200 without
  overwriting newer metadata;
- accepted events fetch current subscriber state rather than interpreting the
  event type as entitlement truth;
- renewal, expiration, and refund/revocation payloads converge to the current
  RevenueCat subscriber response.

```bash
pnpm --filter @harpa/api test:integration -- \
  src/__tests__/billing.integration.test.ts
```

Expected: FAIL because the routes are not mounted.

**Step 5: Implement one billing synchronization service**

Create `syncRevenueCatEntitlement(userId, metadata?)` in `services/billing.ts`:

1. Fetch the subscriber with the default client.
2. Normalize the `pro` entitlement and its product/store.
3. Upsert exactly one row for `userId` via a narrow `rawDb()` query.
4. Preserve newer `last_event_id/last_event_at` during a manual sync.
5. Return the effective plan by comparing the verified entitlement with
   `public.user.plan`.

The webhook passes `{ eventId, eventAt }`; manual sync passes no event metadata.
Write SQL so an event older than the stored event timestamp is a no-op.

Mount both routes from `app.ts`. Keep `/webhooks/revenuecat` public but protected
by its dedicated authorization header; keep `/me/billing/sync` behind
`withAuth()`. Both return a stable 503 `billing_unavailable` response while
`REVENUECAT_LIVE=0`.

**Step 6: Exercise default wiring, not a DI stub**

`billing.default-wiring.integration.test.ts` must start a local HTTP server,
point `REVENUECAT_BASE_URL` to it before importing the app, invoke the real sync
route, and assert both:

- the fake server received the expected subscriber request and bearer secret;
- `app.billing_entitlements` contains the normalized side effect.

This is the required Pitfall 13 test for `createRevenueCatClient()`.

```bash
pnpm --filter @harpa/api test:integration -- \
  src/__tests__/billing.integration.test.ts \
  src/__tests__/billing.default-wiring.integration.test.ts
pnpm --filter @harpa/api test:unit -- \
  src/__tests__/revenuecat.unit.test.ts src/__tests__/env.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/api/src/services/revenuecat.ts \
  packages/api/src/services/billing.ts packages/api/src/routes/billing.ts \
  packages/api/src/app.ts packages/api/src/env.ts \
  packages/api/src/__tests__ .env.example docker-compose.yml
git commit -m "feat(api): sync RevenueCat entitlements"
```

---

## Task 4: Apply effective plans and weighted token accounting

**Files:**

- Create: `packages/api/src/services/model-usage.ts`
- Create: `packages/api/src/__tests__/model-usage.unit.test.ts`
- Modify: `packages/api/src/services/usage-limits.ts`
- Modify: `packages/api/src/__tests__/usage-limits.unit.test.ts`
- Modify: `packages/api/src/__tests__/usage-limits.integration.test.ts`
- Modify: `packages/api/src/routes/me.ts`
- Modify: `packages/api/src/env.ts`
- Modify: `packages/api/src/__tests__/env.test.ts`
- Modify: `packages/api/src/__tests__/setup-env.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Step 1: Write failing multiplier tests**

Pin the initial multipliers relative to `gpt-4.1-mini`:

```ts
openai:gpt-4.1-nano  input 0.25x, output 0.25x
openai:gpt-4.1-mini  input 1x,    output 1x
openai:gpt-4.1       input 5x,    output 5x
```

Test:

- every entry in `settings.AI_MODELS` has an explicit multiplier;
- `weightTokenGroups()` multiplies per vendor/model and rounds the final input
  and output totals up to whole weighted tokens;
- unknown historical models fall back to `1x` for accounting continuity;
- current selectable unknown models fail the catalogue coverage test;
- raw token values are not mutated.

```bash
pnpm --filter @harpa/api test:unit -- src/__tests__/model-usage.unit.test.ts
```

Expected: FAIL on the missing multiplier module.

**Step 2: Implement the multiplier table**

Use one immutable table keyed by `vendor:model` with separate input and output
numbers. Export a coverage assertion used by the test. Do not put dollar prices
in mobile UI or persist weighted values to `llm_usage_events`; raw usage remains
the audit source of truth.

**Step 3: Write failing plan-limit and rollout tests**

Replace placeholder expectations with:

- Free: `Infinity, Infinity, Infinity, 1_000_000, 100_000`;
- Pro: `Infinity, Infinity, Infinity, 10_000_000, 1_000_000`;
- Enterprise: all unbounded;
- effective entitlement upgrades Free to Pro;
- admin Enterprise wins over paid Pro;
- per-user overrides still win over plan defaults;
- before the configured effective instant, the legacy generous limits remain;
- at/after the instant, freemium limits apply;
- the effective instant must be exactly 00:00:00.000 UTC on day 1 of a month.

Add parsed env values:

```text
FREEMIUM_ENFORCEMENT_ENABLED=0|1     default 0
FREEMIUM_ENFORCEMENT_AT=<ISO UTC month boundary>
```

When the switch is disabled, the date may be absent. When enabled, boot fails
unless the date is exactly a UTC month boundary. It may remain in the past after
rollout; otherwise a healthy production instance would stop booting one month
later.

**Step 4: Integrate billing state and weighted queries**

Refactor the internal plan load to read the caller's base plan and self-visible
billing row, then call `effectivePlanFrom`. Keep overrides unchanged.

Change the monthly usage query to return grouped raw input/output totals by
`vendor, model` plus operation counts. Aggregate counts normally, run token
groups through `weightTokenGroups`, and use those weighted totals only for
`ai_input_tokens` and `ai_output_tokens`. `GET /me/usage` continues returning
its existing raw history.

Return `fileSizeLimitBytes` from `getEffectiveLimits` and both `/me/limits` and
the limits extension in `/me/usage`. Before enforcement activation it is 50 MiB
for all plans; after activation it is 5 MiB for Free and 50 MiB otherwise.

**Step 5: Run focused API tests**

```bash
pnpm --filter @harpa/api test:unit -- \
  src/__tests__/model-usage.unit.test.ts \
  src/__tests__/usage-limits.unit.test.ts \
  src/__tests__/env.test.ts
pnpm --filter @harpa/api test:integration -- \
  src/__tests__/usage-limits.integration.test.ts \
  src/__tests__/me.integration.test.ts
```

Expected: PASS, including weighted `used` fields and raw usage-history
regression assertions.

**Step 6: Commit**

```bash
git add packages/api/src/services/model-usage.ts \
  packages/api/src/services/usage-limits.ts packages/api/src/routes/me.ts \
  packages/api/src/env.ts packages/api/src/__tests__ .env.example docker-compose.yml
git commit -m "feat(api): enforce weighted plan allowances"
```

---

## Task 5: Enforce file size before presign and registration

**Files:**

- Create: `packages/api/src/services/file-limits.ts`
- Create: `packages/api/src/__tests__/file-limits.unit.test.ts`
- Modify: `packages/api/src/routes/files.ts`
- Modify: `packages/api/src/middleware/errorMapper.ts`
- Modify: `packages/api/src/__tests__/errorMapper.property.test.ts`
- Modify: `packages/api/src/__tests__/files.integration.test.ts`

**Step 1: Write failing service and route tests**

Pin these boundaries after enforcement activation:

- Free accepts exactly 5 MiB and rejects 5 MiB + 1;
- Pro and Enterprise accept exactly 50 MiB;
- the contract rejects 50 MiB + 1 before storage code;
- an admin Pro plan and a verified paid Pro entitlement both get 50 MiB;
- both `POST /files/presign` and `POST /files` repeat the effective-plan check;
- rejection is HTTP 413 with code `file_size_limit_exceeded` and typed details;
- storage presign and file insertion are not called after rejection;
- a downgrade never removes or hides an existing file.

```bash
pnpm --filter @harpa/api test:unit -- src/__tests__/file-limits.unit.test.ts
pnpm --filter @harpa/api test:integration -- src/__tests__/files.integration.test.ts
```

Expected: FAIL because no plan-aware enforcement exists.

**Step 2: Implement a typed permanent error**

Create `FileSizeLimitExceededError` carrying `{ sizeBytes, limitBytes, plan }`.
Add `enforceFileSizeLimit(db, userId, sizeBytes, now?)`, reusing the same
effective-plan/file-limit helper as `/me/limits`.

Map it in `errorMapper.ts` to:

```json
{
  "error": {
    "code": "file_size_limit_exceeded",
    "message": "This file is larger than your plan allows.",
    "details": { "sizeBytes": 5242881, "limitBytes": 5242880, "plan": "free" }
  }
}
```

**Step 3: Call it from both write gates**

In `routes/files.ts`, call the service after authentication/body validation and
before `pickStorage().presign(...)`. Call it again before `registerFile(...)`.
Keep membership/scope validation intact; do not weaken the existing 404
behavior for cross-project access.

**Step 4: Verify**

```bash
pnpm --filter @harpa/api test:unit -- \
  src/__tests__/file-limits.unit.test.ts \
  src/__tests__/errorMapper.property.test.ts
pnpm --filter @harpa/api test:integration -- src/__tests__/files.integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/api/src/services/file-limits.ts \
  packages/api/src/routes/files.ts packages/api/src/middleware/errorMapper.ts \
  packages/api/src/__tests__/file-limits.unit.test.ts \
  packages/api/src/__tests__/errorMapper.property.test.ts \
  packages/api/src/__tests__/files.integration.test.ts
git commit -m "feat(api): enforce per-plan upload sizes"
```

---

## Task 6: Emit OpenAPI and mobile hooks

**Files:**

- Modify: `packages/api-contract/openapi.json` (generated)
- Modify: `packages/api-contract/src/generated/types.ts` (generated)
- Modify: `apps/mobile/scripts/gen-hooks.ts`
- Modify: `apps/mobile/lib/api/hooks.ts` (generated)
- Modify: `apps/mobile/lib/api/invalidation.ts`
- Modify: `apps/mobile/lib/api/invalidation.test.ts`

**Step 1: Add the generator mapping before generating**

Add:

```ts
{ method: 'post', path: '/me/billing/sync',
  hook: 'useSyncBillingMutation', query: false,
  hasPathParams: false, hasBody: false }
```

Add `post /webhooks/revenuecat` to `MOBILE_SKIP_PATHS`; the mobile app never
calls a provider webhook.

Declare `useSyncBillingMutation: ['meLimits', 'meUsage']` in the invalidation
map and add/adjust its test.

**Step 2: Regenerate committed artifacts**

```bash
pnpm spec:emit
pnpm gen:api
```

Expected: OpenAPI contains both billing routes, generated TypeScript includes
the new response/file-limit shapes, and mobile generates only the authenticated
sync hook.

**Step 3: Verify drift and types**

```bash
bash scripts/check-spec-drift.sh
pnpm --filter @harpa/api-contract typecheck
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test:nocoverage -- lib/api/invalidation.test.ts
```

Expected: PASS and a clean second generation:

```bash
pnpm spec:emit && pnpm gen:api && git diff --exit-code \
  packages/api-contract/openapi.json \
  packages/api-contract/src/generated/types.ts \
  apps/mobile/lib/api/hooks.ts
```

**Step 4: Commit**

```bash
git add packages/api-contract/openapi.json \
  packages/api-contract/src/generated/types.ts apps/mobile/scripts/gen-hooks.ts \
  apps/mobile/lib/api/hooks.ts apps/mobile/lib/api/invalidation.ts \
  apps/mobile/lib/api/invalidation.test.ts
git commit -m "chore(api): regenerate billing contract"
```

---

## Task 7: Add the native RevenueCat billing provider

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/mobile/lib/config/env.ts`
- Modify: `apps/mobile/lib/config/env.test.ts`
- Modify: `.env.example`
- Modify: `apps/mobile/eas.json`
- Create: `apps/mobile/lib/billing/types.ts`
- Create: `apps/mobile/lib/billing/revenuecat-client.ts`
- Create: `apps/mobile/lib/billing/fixture-client.ts`
- Create: `apps/mobile/lib/billing/BillingProvider.tsx`
- Create: `apps/mobile/lib/billing/index.ts`
- Create: `apps/mobile/lib/billing/BillingProvider.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/_layout.test.tsx`

**Step 1: Install the native SDK packages**

```bash
pnpm --filter @harpa/mobile add react-native-purchases react-native-purchases-ui
```

Expected: only the mobile manifest and root lockfile change. A new development
client/native build will be required before device testing; Expo Go is not a
supported verification target.

**Step 2: Write failing env and provider tests**

Add mobile env values:

```text
EXPO_PUBLIC_BILLING_ENABLED=false|true        default false
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
```

When billing is enabled outside fixture mode, require the current platform's
public key. These are SDK keys, not the RevenueCat secret API key.

Provider tests must prove:

- the SDK is not configured before a better-auth user exists;
- first authenticated user configures RevenueCat with `usr_...` as App User ID;
- changing users calls `logIn` for the new id;
- sign-out calls `logOut` and clears provider state;
- purchase/restoration success calls `POST /me/billing/sync` and invalidates
  `meLimits`/`meUsage`;
- cancelled, pending, store-unavailable, and network-error results do not grant
  Pro locally;
- `presentPaywall()` uses `requiredEntitlementIdentifier: 'pro'` and treats only
  `PURCHASED`/`RESTORED` as success;
- `presentCustomerCenter()` and user-initiated `restorePurchases()` delegate to
  the SDK;
- fixture mode uses the fixture client and never loads a real store;
- no source string hardcodes `$19.99`, `$149.99`, or converted local prices.

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  lib/config/env.test.ts lib/billing/BillingProvider.test.tsx app/_layout.test.tsx
```

Expected: FAIL before the provider exists.

**Step 3: Implement a small adapter and context**

Keep native SDK calls in `revenuecat-client.ts`; expose only:

```ts
configure(appUserId)
logIn(appUserId)
logOut()
presentPaywall()
presentCustomerCenter()
restorePurchases()
getCustomerInfo()
```

`BillingProvider` observes `useAuthSession().user`, owns the adapter lifecycle,
and exposes:

```ts
{
  enabled,
  status: 'disabled' | 'loading' | 'free' | 'pro' | 'error',
  presentPaywall(): Promise<boolean>,
  presentCustomerCenter(): Promise<void>,
  restorePurchases(): Promise<boolean>,
  refresh(): Promise<void>,
}
```

Local CustomerInfo may update UI quickly, but server `meLimits.plan` remains the
authorization truth. After purchase/restore, await `useSyncBillingMutation()`
before reporting success.

The fixture adapter may toggle local Free/Pro state for component/Maestro UI
coverage; it must not be used as proof of server entitlement integration.

**Step 4: Mount the provider once**

Update the root tree to:

```text
PersistQueryClientProvider
  AuthSessionProvider
    BillingProvider
      StatusBar
      DialogSheetProvider
        QueueProvider
```

This lets all account, quota-dialog, and upload surfaces use one billing
identity without creating SDK instances per screen.

Set billing disabled in development/test profiles. Set the production/preview
boolean deliberately in `eas.json`, but inject public SDK keys through the
existing EAS environment path rather than committing values.

**Step 5: Verify**

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  lib/config/env.test.ts lib/billing/BillingProvider.test.tsx app/_layout.test.tsx
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/lib/config \
  .env.example apps/mobile/eas.json apps/mobile/lib/billing \
  apps/mobile/app/_layout.tsx apps/mobile/app/_layout.test.tsx
git commit -m "feat(mobile): add RevenueCat billing provider"
```

---

## Task 8: Add the three paywall entry points and subscription management

**Files:**

- Modify: `apps/mobile/components/account/UsageLimitsCard.tsx`
- Modify: `apps/mobile/components/account/UsageLimitsCard.test.tsx`
- Modify: `apps/mobile/components/account/UsageLimitDialog.tsx`
- Modify: `apps/mobile/components/account/UsageLimitDialog.test.tsx`
- Modify: `apps/mobile/features/generate/GenerateReportProvider.tsx`
- Modify: `apps/mobile/features/generate/GenerateReportProvider.test.tsx`
- Modify: `apps/mobile/app/(app)/usage.tsx`
- Modify: `apps/mobile/screens/usage.tsx`
- Modify: `apps/mobile/screens/usage.test.tsx`
- Modify: `apps/mobile/app/(app)/account.tsx`
- Modify: `apps/mobile/screens/account.tsx`
- Modify: `apps/mobile/screens/account.test.tsx`

**Step 1: Write failing props-only component tests**

Pin the owned UI:

- Usage Free plan shows `Upgrade to Pro`; Pro/Enterprise do not.
- The Usage screen presents weighted input/output allowance progress while
  retaining the existing raw token details.
- Remove the stale hardcoded `Token Pricing Reference`; the authoritative
  comparison is now weighted allowance, and localized subscription prices live
  in RevenueCat Paywalls.
- `UsageLimitDialog` shows `Upgrade` only for Free and retains the next UTC reset
  date. Pro/Enterprise keep the support/close path.
- Account shows a Billing section with `Manage subscription` and
  `Restore purchases` when billing is enabled.
- Account displays progress/error states and accessible button labels.
- Account-deletion confirmation warns that deleting Harpa does not cancel an
  App Store or Play Store subscription and points to Manage subscription.
- No screen blocks signup or automatically opens a paywall.

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  components/account/UsageLimitsCard.test.tsx \
  components/account/UsageLimitDialog.test.tsx \
  screens/usage.test.tsx screens/account.test.tsx
```

Expected: FAIL on missing callbacks/copy.

**Step 2: Add callbacks without custom paywall screens**

Keep `screens/usage.tsx` and `screens/account.tsx` props-only. The route files
call `useBilling()` and pass:

- `onUpgrade` to Usage and the AI limit dialog;
- `onManageSubscription` and `onRestorePurchases` to Account;
- billing `enabled/status` and transient error strings.

`GenerateReportProvider` passes `presentPaywall` to its existing
`UsageLimitDialog`. Do not add a new custom pricing modal or mockup.

**Step 3: Verify focused mobile behavior**

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  components/account/UsageLimitsCard.test.tsx \
  components/account/UsageLimitDialog.test.tsx \
  features/generate/GenerateReportProvider.test.tsx \
  screens/usage.test.tsx screens/account.test.tsx
pnpm --filter @harpa/mobile typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/mobile/components/account apps/mobile/features/generate \
  'apps/mobile/app/(app)/usage.tsx' apps/mobile/screens/usage.tsx \
  'apps/mobile/app/(app)/account.tsx' apps/mobile/screens/account.tsx
git commit -m "feat(mobile): add subscription entry points"
```

---

## Task 9: Reject oversized uploads once at the root queue

**Files:**

- Create: `apps/mobile/lib/uploads/file-size-limit-error.ts`
- Create: `apps/mobile/lib/uploads/file-size-limit-error.test.ts`
- Modify: `apps/mobile/lib/uploads/queue.ts`
- Modify: `apps/mobile/lib/uploads/queue.test.ts`
- Modify: `apps/mobile/lib/uploads/run-upload.ts`
- Modify: `apps/mobile/lib/uploads/QueueProvider.tsx`
- Create: `apps/mobile/components/account/FileSizeLimitDialog.tsx`
- Create: `apps/mobile/components/account/FileSizeLimitDialog.test.tsx`
- Modify: `apps/mobile/lib/uploads/upload-creates-timeline-note.test.tsx`

**Step 1: Write failing queue tests**

Extend `QueueInternals` with two optional default-wiring collaborators:

```ts
getFileSizeLimitBytes?: () => number | null
onFileSizeRejected?: (error: UploadFileSizeLimitError) => void
```

Tests must prove:

- `enqueue` rejects before creating a job when `sizeBytes > current limit`;
- exactly-at-limit voice and photo jobs still enqueue;
- `enqueueBatch` rejects the entire batch before any job starts when one file is
  oversized;
- the paired image thumbnail is validated too;
- unknown/loading limit (`null`) lets the API remain authoritative;
- a server 413 `file_size_limit_exceeded` is parsed into the same typed error;
- typed size errors are permanent and consume no retry/backoff attempts;
- the rejection callback fires once and receives plan/size/limit fields.

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  lib/uploads/file-size-limit-error.test.ts lib/uploads/queue.test.ts
```

Expected: FAIL before queue validation exists.

**Step 2: Implement the shared typed error**

`UploadFileSizeLimitError` stores `sizeBytes`, `limitBytes`, and `plan`. Add a
parser for `ApiError` code `file_size_limit_exceeded`; do not match English
message text.

Validate in both `enqueue` and `enqueueBatch`. In the process-job catch path,
immediately mark a typed size error failed, invoke the callback, and reject;
never retry it.

**Step 3: Wire one provider-level preflight and dialog**

`QueueProvider` calls `useMeLimitsQuery()` and keeps the latest
`fileSizeLimitBytes` in a ref read by the stable queue instance. While limits are
loading, return `null` and rely on server enforcement rather than pessimistically
blocking a Pro user.

Render one `FileSizeLimitDialog` from `QueueProvider`, inside the existing
`DialogSheetProvider`. Copy must show the actual ceiling. For Free, include
`Upgrade`; for Pro/Enterprise, include only close/retry guidance. Use
`useBilling().presentPaywall` for the Free action.

This single hook covers voice notes, photos, documents, PDFs, avatars, gallery
batches, and future queue consumers without hiding any file type.

**Step 4: Exercise default upload wiring**

Extend `upload-creates-timeline-note.test.tsx` without replacing
`defaultUploadDeps`: mock the real API response as 413 and prove the R2 PUT and
file registration do not occur and the dialog callback is reached.

```bash
pnpm --filter @harpa/mobile test:nocoverage -- \
  lib/uploads/file-size-limit-error.test.ts \
  lib/uploads/queue.test.ts \
  components/account/FileSizeLimitDialog.test.tsx \
  lib/uploads/upload-creates-timeline-note.test.tsx
pnpm --filter @harpa/mobile typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/mobile/lib/uploads apps/mobile/components/account/FileSizeLimitDialog.tsx \
  apps/mobile/components/account/FileSizeLimitDialog.test.tsx
git commit -m "feat(mobile): gate oversized uploads"
```

---

## Task 10: Update architecture and public documentation after PR #191

**Files:**

- Modify: `docs/v4/arch-usage-limits.md`
- Modify: `docs/v4/architecture.md`
- Modify: `docs/v4/plan-p5-beta-ga.md`
- Modify: `apps/site/src/content/docs/09-account-and-usage.mdx`
- Modify: `apps/site/src/content/faq/05-cost.mdx`
- Modify: `apps/site/src/pages/privacy.astro`
- Modify: relevant tests under `apps/site/src/**/*.test.*` and
  `apps/site/tests/**/*.spec.ts`

**Step 1: Write/update content assertions first**

Add site tests that fail unless public content states:

- Free and Pro token/file allowances;
- monthly reset is UTC;
- voice notes remain available on Free;
- stores show localized monthly/annual prices;
- there is no trial and no report-count limit;
- cancellation preserves Pro through the paid period;
- restore/manage paths live in Account;
- deletion does not cancel the external store subscription.

Do not assert converted country prices or duplicate store-generated billing
strings.

```bash
pnpm --filter @harpa/site test
```

Expected: FAIL on the old free-launch-period copy.

**Step 2: Update internal architecture docs**

In `arch-usage-limits.md`, replace placeholder caps with the shipping weighted
model, multiplier rules, file-size enforcement, admin/paid plan precedence,
rollout switch, and stable errors.

In `architecture.md`, add RevenueCat to external services/data flow and note
that API verification—not mobile CustomerInfo—authorizes Pro.

In `plan-p5-beta-ga.md`, replace the admin-only billing carve-out with the
native subscription/store/legal release gates.

**Step 3: Update public docs and privacy shell**

Update the two MDX pages with plain-language Free/Pro guidance. Update
`privacy.astro` only after the hosted Termly policy is actually published;
refresh its verification date and repository-level explanatory copy. The hosted
policy itself must disclose RevenueCat, purchase history, Harpa user id, Apple
receipts/Google purchase tokens, entitlement validation, analytics, retention,
deletion, and international processing.

If PR #191's legal helper points paywalls to an external Terms URL, verify it
contains auto-renewal, billing period, cancellation, and allowance language.
Do not invent a second terms page if the configured hosted Terms page is the
canonical surface.

**Step 4: Verify the site**

```bash
pnpm --filter @harpa/site test
pnpm --filter @harpa/site typecheck
pnpm --filter @harpa/site lint
pnpm --filter @harpa/site build
pnpm --filter @harpa/site test:e2e
```

Expected: PASS. Playwright confirms the pricing/account docs and privacy link
are reachable.

**Step 5: Commit**

```bash
git add docs/v4/arch-usage-limits.md docs/v4/architecture.md \
  docs/v4/plan-p5-beta-ga.md apps/site
git commit -m "docs: explain Free and Pro billing"
```

---

## Task 11: Update store metadata and add the release runbook

**Files:**

- Modify: `apps/mobile/fastlane/metadata/ios/en-US/description.txt`
- Modify: `apps/mobile/fastlane/metadata/ios/en-US/promotional_text.txt`
- Modify: `apps/mobile/fastlane/metadata/android/en-US/short_description.txt`
- Modify: `apps/mobile/fastlane/metadata/android/en-US/full_description.txt`
- Modify: `apps/mobile/fastlane/metadata/android/en-US/changelogs/default.txt`
- Modify: `apps/mobile/fastlane/metadata/README.md`
- Create or modify after review:
  `apps/mobile/fastlane/app_store/app_privacy_details.json`
- Create: `docs/runbooks/freemium-release.md`

**Step 1: Update source-controlled listing copy**

Describe a useful Free plan and optional Pro allowances without claiming a
fixed non-US price. Mention voice notes as a core feature, not a Pro-only
benefit. Keep the privacy URL `https://harpapro.com/privacy`.

The release notes should say that subscriptions unlock larger monthly AI and
upload allowances and that prices are localized by the store.

**Step 2: Write the operator checklist**

The runbook must stop release until a human has completed and recorded evidence
for all items below.

RevenueCat:

- entitlement id `pro`;
- one current offering with monthly and annual packages;
- iOS and Android products attached;
- restore behavior `Transfer to new App User ID`;
- webhook URL, authorization header, and sandbox event verified;
- public SDK keys in EAS, secret key/webhook secret in API secrets.

App Store Connect:

- monthly and annual auto-renewable products in one subscription group;
- US reference prices US$19.99 and US$149.99 with automatic storefront prices;
- paywall has Privacy Policy and Terms links;
- App Privacy answers disclose purchase history for app functionality/analytics,
  linked to Harpa User ID, with no advertising tracking;
- review notes identify paywall, restore, demo account, and Free path;
- reviewed `app_privacy_details.json` uploaded only after legal approval.

Google Play Console:

- one subscription with monthly and annual base plans;
- automatic regional prices reviewed;
- Data safety discloses purchase history and user id;
- privacy URL, subscription disclosure, license testers, grace period, and
  account hold configured.

Legal/operations:

- hosted Privacy and Terms changes are live before metadata upload;
- support has refund/cancellation/restore instructions;
- account deletion warning and transfer behavior have been tested;
- enforcement effective date is the next UTC month boundary;
- kill switch rollback command/owner is recorded.

**Step 3: Run safe metadata validation**

```bash
cd apps/mobile
bundle exec fastlane doctor
```

Expected: PASS without uploading metadata, privacy answers, builds, or
screenshots. Do not run `metadata_production`, `app_privacy_production`, or
`release` until the runbook's human/legal approvals are checked.

**Step 4: Commit**

```bash
git add -A apps/mobile/fastlane \
  docs/runbooks/freemium-release.md
git commit -m "docs(release): add subscription store checklist"
```

---

## Task 12: Full verification and staged release evidence

**Files:**

- Create: `.maestro/modules/18-freemium-billing.yaml`
- Modify if necessary: the parent Maestro regression journey importing it
- Record evidence in: `docs/runbooks/freemium-release.md`

**Step 1: Add fixture UI regression coverage**

Use the existing fixture-mode conventions to cover UI behavior without touching
a real store:

1. Free Usage shows the 1M/100k weighted limits.
2. Upgrade opens the fixture paywall and returns success.
3. Restore exposes the success state.
4. A Free file over 5 MiB is rejected before upload.
5. A Free voice note under 5 MiB still records/uploads normally.

Treat this as UI regression coverage only. Server entitlement verification is
covered by Task 3's default-wiring integration test and the sandbox smoke below.

**Step 2: Run repository verification in increasing cost order**

```bash
pnpm --filter @harpa/api-contract test
pnpm --filter @harpa/api test:unit
pnpm --filter @harpa/mobile test:nocoverage
pnpm --filter @harpa/site test

pnpm --filter @harpa/api-contract typecheck
pnpm --filter @harpa/api typecheck
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/site typecheck

pnpm --filter @harpa/api lint
pnpm --filter @harpa/mobile lint
pnpm --filter @harpa/site lint

pnpm --filter @harpa/api test:integration
pnpm --filter @harpa/site build
pnpm --filter @harpa/site test:e2e
pnpm spec:emit
pnpm gen:api
git diff --exit-code packages/api-contract/openapi.json \
  packages/api-contract/src/generated/types.ts apps/mobile/lib/api/hooks.ts
```

Expected: every command passes. If an expensive suite is not run, record the
specific omission and do not mark the release ready.

**Step 3: Build native preview clients**

After package changes and EAS secrets are configured:

```bash
cd apps/mobile
pnpm exec eas build --platform all --profile preview --non-interactive
```

Expected: iOS and Android preview builds succeed with RevenueCat native modules.

**Step 4: Perform one real sandbox smoke per platform**

On iOS sandbox and Google Play license-test accounts, record evidence for:

- monthly purchase and server plan sync;
- annual product/localized price visibility without purchasing both products;
- app relaunch and second-device entitlement recovery;
- user-initiated restore;
- cancellation retaining Pro through expiry;
- expiration/refund removing paid Pro but preserving admin Enterprise;
- sign-out/sign-in and transfer-to-new-user behavior;
- Customer Center/manage destination;
- account-deletion warning;
- Free 5 MiB and Pro 50 MiB boundaries;
- voice note on Free below 5 MiB.

**Step 5: Confirm rollout order**

Deploy in this order:

1. migration;
2. API RevenueCat client/routes/webhook with enforcement disabled;
3. hosted privacy/terms and public docs;
4. store products/metadata/privacy disclosures;
5. native app binary;
6. enforcement at the configured next UTC month boundary.

If billing verification fails in production, set
`FREEMIUM_ENFORCEMENT_ENABLED=0` and redeploy the API. This restores legacy
generous limits and 50 MiB uploads without deleting entitlement rows or user
data.

**Step 6: Final commit for test/runbook-only adjustments**

```bash
git add .maestro docs/runbooks/freemium-release.md
git commit -m "test(mobile): cover freemium billing flows"
```

Skip this commit when Task 12 produces no tracked changes.

---

## Completion criteria

The feature is complete only when all of the following are true:

- API plan and file enforcement use server-verified effective entitlement
  state; mobile CustomerInfo never authorizes server work.
- Free voice recording, upload, transcription, and summary remain usable under
  the 5 MiB/file and weighted-token allowances.
- Free/Pro count buckets are unbounded; only weighted input/output and per-file
  size differ.
- Every selectable model has explicit cost multipliers and raw usage remains
  visible/auditable.
- Purchase, restore, expiration/refund, admin-plan precedence, and webhook
  idempotency pass automated coverage.
- The app uses RevenueCat Paywalls/Customer Center with localized store prices;
  there is no custom pricing mockup or hardcoded converted price.
- Privacy, Terms, App Store, Play Store, and public docs are updated and reviewed
  after PR #191.
- Both native sandbox smokes pass before enabling enforcement.
- The effective date is a UTC month boundary and the kill switch has been
  rehearsed.
