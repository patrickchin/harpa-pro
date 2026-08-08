# @harpa/admin

Standalone Astro admin console for `admin.harpapro.com`. Its static artifact and
Cloudflare Pages project are separate from the public `harpapro.com` site.

## Develop

```bash
cp apps/admin/.env.example apps/admin/.env
pnpm --filter @harpa/admin dev       # http://localhost:3102
pnpm --filter @harpa/admin build
pnpm --filter @harpa/admin typecheck
pnpm --filter @harpa/admin test
pnpm --filter @harpa/admin test:e2e  # Docker-backed API and databases
```

The root route renders the business activity console. `/operations` provides
read-only Harpa deployment identity and readiness, a no-token public GitHub
branch/PR snapshot, bounded Neon inventory and Free-plan usage, bounded R2
capacity, bounded Fly inventory, storage lifecycle database evidence, aggregate
Harpa-recorded AI usage, and links to external service consoles. A separate
**Report generation live canary** card updates one fixed synthetic report and
spends real AI tokens. The canary runs only after an explicit click. It is not
part of the read-only refresh. Unknown browser paths return a static 404.
`/admin/activity` and the `/admin/operations/*` routes remain API resource
paths, not page URLs.

The unmerged Fly inventory and AI usage stacks are drafts. The Fly stack adds
bounded Machine and Volume inventory for an explicit app allowlist. The AI
usage stack summarizes Harpa's retained best-effort ledger without adding a
provider administrator credential.

## Deployment identity

The operations page reads `/healthz`, `/readyz`, `/admin/readyz`, and three
independent `/_cf-pages-deployment.json` markers on authenticated load and
manual **Refresh**. The marker cards show the public site, administrator site,
and office dashboard as separate Pages builds.

The admin build sets `PUBLIC_SITE_BASE_URL` and `PUBLIC_DASHBOARD_URL` to fixed
public origins for its `main`, `dev`, or `pr-<n>` branch. The browser accepts no
marker origin from a query, response, or operator input. The two cross-origin
marker GETs omit credentials. The administrator marker GET uses same-origin
credentials. Every GET disables caching, and the page does not poll.

The cards also keep API build identity and both migration heads separate. The
UI does not compare these SHAs or label a difference as drift. Pull-request Fly
previews can use a synthetic merge commit while Pages reports the pull-request
head. A successful full-stack load makes 15 fixed GETs. One successful manual
Refresh makes 15 more, for 30 total. The report live canary remains a separate
manual POST.

The panel supplies corroborating evidence only. Use the protected deployment
workflows for exact release and promotion proof. See
[Admin deployment identity](../../docs/v4/design-admin-deployment-identity.md).

## Neon inventory

The browser calls `GET /admin/operations/neon` with the dedicated admin cookie
and `cache: 'no-store'`. The API applies the shared admin IP budget and a
12-request-per-minute identity and session budget. Its response sets
`Cache-Control: private, no-store`.

`ADMIN_NEON_VIEWER_API_KEY` and `ADMIN_NEON_ORG_ID` are optional, paired API
runtime variables. Do not put them in the admin workspace environment or
browser bundle. The key belongs to a fixed Neon observer whose effective
permission is `VIEWER` for every returned project. When the pair is absent,
the page shows `Unknown` and the API makes no provider call.

One refresh lists at most 20 projects and at most 100 active branch details per
project. Provider requests have no retries. The count endpoint has no
deleted-branch selector. The active-detail request explicitly excludes deleted
branches. Neon has no documented remaining-credit API. The page leaves billing
credit `Unknown` and links to the Neon console.

See [Admin Neon inventory](../../docs/v4/design-admin-neon-inventory.md) for
the route contract. See
[Neon inventory observer](../../docs/v4/arch-ops.md#neon-inventory-observer)
for provisioning and exact-SHA deployment proof.

## Provider quota percentages

The browser calls `GET /admin/operations/neon-usage` with the dedicated admin
cookie and `cache: 'no-store'`. The route reuses the existing
`ADMIN_NEON_VIEWER_API_KEY` and `ADMIN_NEON_ORG_ID` pair. It applies a separate
12-request-per-minute identity and session budget. One observation makes at
most 22 fixed Neon `GET` requests under one 10-second deadline. It does not
retry, follow project pagination, or write to Neon.

The route accepts only the exact Neon `free` plan and requires `VIEWER`
evidence for every discovered project before it reads project details. The UI
shows used and remaining percentages against the published per-project
references of 360,000 CU-seconds and 500,000,000 storage bytes. It shows the
organization transfer percentage against 5,000,000,000 bytes only when
project coverage is complete and all consumption periods match. Otherwise,
organization transfer is `Unknown`.

The R2 card shows estimated Class A and Class B used and remaining percentages
against the published 1,000,000-operation and 10,000,000-operation references.
It does not show a storage percentage because the current snapshot and
GB-month accounting window are not comparable. The GitHub card shows the
primary public REST request budget for this browser and IP from the existing
response headers. Invalid or contradictory headers make only that budget
`Unknown`.

Percentage text uses one decimal place. Values can exceed 100.0%, while the
painted meter stops at 100%. Unsupported provider money, token, invoice, and
credit balances stay `Unknown`. The full stacked browser makes 15 fixed GET
reads after session confirmation. One manual **Refresh** makes another 15, for
30 total. The page does not poll. The report generation live canary remains a
separate manual POST.

See
[Admin provider quota percentages](../../docs/v4/design-admin-provider-quota-percentages.md)
for the evidence and calculation contract.

## Storage lifecycle

The browser calls `GET /admin/operations/storage-lifecycle` with the dedicated
admin cookie and `cache: 'no-store'`. The route uses the shared trusted-IP
budget and a separate 12-request-per-minute identity and session budget.

One observation runs exactly one fixed application-database statement under a
five-second deadline. It reads the singleton rollout state, the lease
enforcement function, and aggregate durable queue counts. It accepts no body
or query. It makes no mutation or provider call.

The card shows database evidence for lifecycle arming, account-deletion
availability, and queued cleanup work. This evidence does not prove current
storage worker liveness or future queue execution. Use Fly worker and
deployment verification for executor proof.

The browser reads this route on page load and shared **Refresh** only. It does
not poll. See
[Admin storage lifecycle observer](../../docs/v4/design-admin-storage-lifecycle-observer.md)
for the full boundary.

## Fly inventory draft

The draft adds `GET /admin/operations/fly-inventory`. The route uses the
dedicated admin cookie and the shared trusted-Fly-IP budget. It also has a
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

The API accepts `ADMIN_FLY_ORG_SLUG`, `ADMIN_FLY_READ_ONLY_API_TOKEN`, and
`ADMIN_FLY_APP_NAMES` as one optional triplet. All three values must be absent
or present together. The app list contains one to ten unique, exact Fly app
names. The dedicated token must have read-only access to the configured
organization. None of these values enters the browser bundle.

One observation uses fixed `GET` requests to `https://api.machines.dev` under
one 10-second deadline. It makes at most 31 provider calls. It does not follow
redirects or pagination, and it does not retry. The response returns at most
ten apps, 50 Machines per app, and 50 Volumes per app.

The response allowlist excludes private IPs, raw Machine configuration, image
details, service configuration, Volume internals, and raw provider errors.
`processGroup` is nullable inventory from the reviewed Machine metadata field.
Machine state and process group do not prove Harpa readiness or worker
liveness. Volume size shows allocated capacity, and remaining Fly credit stays
`Unknown` with a Fly dashboard link.

The browser requests the inventory once after session confirmation and once
per manual **Refresh**. A successful full-stack load makes 15 fixed GET reads.
One successful Refresh makes another 15, for 30 total. The page does not poll
or make a provider write. The report generation live canary remains a separate
manual POST.

See [Admin Fly inventory](../../docs/v4/design-admin-fly-inventory.md) for the
draft route and credential contract.

## Harpa-recorded AI usage draft

The draft adds `GET /admin/operations/ai-usage`. The route uses the dedicated
admin cookie, the shared trusted-Fly-IP budget, and a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

One read makes one bounded application-database aggregate over the current UTC
month and previous 24 hours. It reports successful and failed `live`, `record`,
and `replay` events, token totals, transcription seconds, operation counts, and
normalized `openai`, `groq`, `kimi`, or `other` provider categories. Replay is
separate from provider-attributable use. The response contains no user,
project, report, model, prompt, transcript, raw vendor, or error details.

This observer uses only `app.llm_usage_events`. It adds no OpenAI, Groq, or Kimi
administrator credential and makes no provider request. The ledger is
best-effort and excludes deleted history, so it is not provider billing.
Remaining provider credit stays `Unknown` with dashboard links.

The browser requests the aggregate once after session confirmation and once
per manual **Refresh**. It does not poll. A successful full-stack load makes 15
reads. One successful Refresh adds 15 more, for 30 total. The report live
canary remains a separate manual POST and never runs during either cycle.

See [Admin AI usage ledger](../../docs/v4/design-admin-ai-usage.md) for the
draft route, accounting, privacy, and migration contract.

## Report generation live canary

The browser sends an empty, credentialed, no-store request to
`POST /admin/operations/report-generate`. It includes the current
`X-Admin-CSRF` token. The request cannot select an account, target, provider,
model, mode, or body.

`ADMIN_REPORT_LIVE_CANARY_ENABLED` defaults to `0`. The API accepts `1` only
for the exact development deployment with live AI mode and the complete fixed
synthetic target. Pull-request previews and production cannot enable it. A
disabled route returns `unknown/not_enabled` without an application request or
application-database query.

One click calls the real report endpoint and can spend real provider tokens.
The button blocks a second submission until the request finishes. Page load,
**Refresh**, timers, and background work never start or clear the canary.

A pass proves live mode, a fresh report update, one matching live usage row,
and an exact temporary-session sign-out. The card shows bounded token counts,
usage limits, structural counts, a report hash, and an escaped synthetic
preview. It does not show prompts, source notes, raw responses, credentials,
or provider errors. The result stays only in component memory.

The route permits three runs per administrator identity and session in 15
minutes. The fixed synthetic account also keeps the normal report and AI usage
limits. See
[Admin live report-generation canary](../../docs/v4/design-admin-report-live-canary.md)
for the complete contract.

Cloudflare Git deploys this workspace through the independent
`harpa-pro-admin` Pages project. `main`, `dev`, and mirrored `pr-N` branches
select the production, development, and exact matching Fly API respectively;
GitHub Actions verifies the deployed SHA but does not publish the artifact.
