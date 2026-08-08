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
read-only Harpa readiness checks, a no-token public GitHub branch/PR snapshot,
and links to the external service consoles. Unknown browser paths return a
static 404 instead of falling back to the console. `/admin/activity` remains
the API resource path, not a page URL.

Cloudflare Git deploys this workspace through the independent
`harpa-pro-admin` Pages project. `main`, `dev`, and mirrored `pr-N` branches
select the production, development, and exact matching Fly API respectively;
GitHub Actions verifies the deployed SHA but does not publish the artifact.
