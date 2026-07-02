# Public site deploy notes (Cloudflare Pages)

This runbook covers the Astro app at `apps/site`, including the marketing,
roadmap, legal, and `/docs` routes. All routes deploy as one static output to
the Cloudflare Pages project `harpa-pro`.

## Why Cloudflare Pages

`harpapro.com` already uses Cloudflare Registrar and DNS. A static Astro build
does not need the Cloudflare SSR adapter; the workflows upload
`apps/site/dist` directly with Wrangler. The same project supplies unique pull
request previews, the stable `dev` deployment, and production.

## Project and workflow topology

| Source | Workflow | Cloudflare target |
| --- | --- | --- |
| Pull request to `dev` or `main` | `site-preview.yml` | Unique preview branch |
| Push to `dev` | `site-dev.yml` | `dev.harpa-pro.pages.dev` |
| Push to `main` | `site-prod.yml` | `harpapro.com` and `harpa-pro.pages.dev` |

The Pages project name stays `harpa-pro`; renaming the repository app does not
rename the Cloudflare project.

## One-time Cloudflare setup

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Create or select the Pages project named `harpa-pro`.
3. Set its production branch to `main`.
4. Attach `harpapro.com` as the production custom domain.
5. Create a custom API token with:
   - Account → **Cloudflare Pages** → **Edit**;
   - User → **User Details** → **Read**.
6. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the GitHub
   Actions secrets for `patrickchin/harpa-pro`.

Astro inlines `PUBLIC_API_BASE_URL` and `PUBLIC_TURNSTILE_SITE_KEY` during the
build. The workflows set them on the build step; Pages dashboard variables do
not change a pre-built upload.

## Local commands

```bash
pnpm --filter @harpa/site test
pnpm --filter @harpa/site lint
pnpm --filter @harpa/site typecheck
PUBLIC_API_BASE_URL=http://localhost:8787 \
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  pnpm --filter @harpa/site build
pnpm --filter @harpa/site test:e2e
```

CI is the deployment source of truth. For a manual diagnostic deployment:

```bash
cd apps/site
pnpm exec wrangler pages deploy ./dist \
  --project-name=harpa-pro \
  --branch="$(git branch --show-current)"
```

## Documentation hostname cutover

The canonical documentation location is `https://harpapro.com/docs`. The old
hostname must redirect, not serve a second copy.

### Before changing DNS

1. Verify the pull request preview, including Playwright, Lighthouse, and the
   deployed `_redirects` check.
2. Merge through `dev` and verify `https://dev.harpa-pro.pages.dev/docs`.
3. Promote through the protected `main` process and verify:
   - `/docs` and every guide;
   - `/robots.txt` and `/sitemap.xml`;
   - one unknown guide returns the branded 404;
   - the known paths in `apps/site/public/_redirects` return `301`.
4. Export or screenshot the current Vercel project and domain settings.
5. Record the current DNS value. As of 2026-07-03 it is:

   ```text
   docs.harpapro.com CNAME 61fa887e5c112c19.vercel-dns-017.com
   ```

### Configure Cloudflare

Cloudflare Single Redirects require proxied traffic. In the `harpapro.com`
zone:

1. Replace the Vercel record with a proxied CNAME:

   ```text
   docs CNAME harpa-pro.pages.dev (Proxied)
   ```

2. Under **Rules → Redirect Rules**, create a higher-priority root rule:

   - Match: hostname equals `docs.harpapro.com` and URI path equals `/`.
   - Target: `https://harpapro.com/docs`.
   - Status: `301`.
   - Preserve query string: enabled.

3. Create a lower-priority wildcard rule:

   - Request URL: `http*://docs.harpapro.com/*`.
   - Target URL: `https://harpapro.com/${2}`.
   - Status: `301`.
   - Preserve query string: enabled.

The second rule preserves old paths on the apex. The checked-in `_redirects`
file then maps the nine known v3 guide paths and `/search` to their canonical
v4 destinations. Unknown paths reach the branded 404 instead of silently
claiming an unrelated guide.

This setup follows Cloudflare's current
[Single Redirects dashboard workflow](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/)
and its
[cross-host wildcard example](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/).

### Verify the cutover

Check root, known, unknown, and query-string cases:

```bash
curl -I https://docs.harpapro.com/
curl -I https://docs.harpapro.com/guides/getting-started
curl -I https://docs.harpapro.com/guides/manage-projects
curl -I 'https://docs.harpapro.com/search?q=voice'
curl -I https://docs.harpapro.com/not-a-real-guide
```

Expected outcomes:

- root ends at `https://harpapro.com/docs`;
- known guide paths end at their matching `/docs/guides/...` page;
- the search query is preserved when `/search` redirects to `/docs`;
- an unknown path reaches the Harpa Pro 404 page;
- TLS is valid and no URL loops.

Monitor Cloudflare requests for unexpected 4xx responses through the rollback
window. Retire the Vercel project only after the custom hostname has remained
healthy.

## Rollback

If the hostname redirect fails:

1. Disable both Cloudflare Single Redirect rules.
2. Restore the captured Vercel CNAME value as DNS-only.
3. Confirm `https://docs.harpapro.com` serves the prior deployment.
4. Leave `https://harpapro.com/docs` online; it is independent of the hostname
   redirect.
5. Correct and re-test the rules before attempting the cutover again.
