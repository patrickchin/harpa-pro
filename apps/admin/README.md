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
branch/PR snapshot, bounded Neon inventory, bounded R2 capacity, and links to
external service consoles. A separately triggered report-generation diagnostic
is a synthetic mutation of one fixed test report and may consume AI quota; it
is not part of the read-only refresh. Unknown browser paths return a static 404
instead of falling back to the console. `/admin/activity` and the
`/admin/operations/*` routes remain API resource paths, not page URLs.

## Deployment identity

The operations page reads `/healthz`, `/readyz`, `/admin/readyz`, and its
same-origin `/_cf-pages-deployment.json` marker on authenticated load and
manual Refresh. All four GETs disable caching; there is no polling. The health
request omits credentials, the readiness requests include the dedicated admin
cookie, and the marker uses same-origin credentials.

The cards keep API build identity, product and administrator migration heads,
and the administrator Pages build separate. A different Fly and Pages SHA is
not automatically drift because pull-request Fly previews can use a synthetic
merge commit while Pages reports the pull-request head. The panel is
corroborating evidence only; use the protected deployment workflows for exact
promotion proof. See
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

Cloudflare Git deploys this workspace through the independent
`harpa-pro-admin` Pages project. `main`, `dev`, and mirrored `pr-N` branches
select the production, development, and exact matching Fly API respectively;
GitHub Actions verifies the deployed SHA but does not publish the artifact.
