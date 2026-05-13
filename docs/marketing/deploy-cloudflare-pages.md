# Marketing site deploy notes (Cloudflare Pages)

This file documents the operational setup for deploying
`apps/marketing` to Cloudflare Pages. It does NOT replace the plan
(`docs/marketing/plan-m0-foundation.md` §M0.5) — it is the
ops-runbook companion that the plan references.

## Why Cloudflare Pages

Same-vendor stack: `harpapro.com` is on Cloudflare Registrar/DNS,
the voice demo (M2) uses R2 + Turnstile, and Web Analytics is
cookieless. No bandwidth meter on the free tier. We deploy a
**static** Astro build (`output: "static"`) so we don't need the
`@astrojs/cloudflare` SSR adapter — wrangler uploads `dist/`
directly.

## One-time Cloudflare setup

1. Sign in to <https://dash.cloudflare.com>.

2. Create the Pages project (one-time):

   - Workers & Pages → **Create** → Pages → **Upload assets**.
   - Project name: **`harpa-pro`** (matches `wrangler.jsonc`
     `name` and the GitHub Actions workflow). The `*.pages.dev`
     subdomain becomes `harpa-pro.pages.dev`.
   - Upload an empty `dist/` once just to create the project, or
     skip and let the first CI / local deploy create it via
     `wrangler pages deploy --project-name=harpa-pro`.
   - Production branch: **`main`** (default branch; see
     AGENTS.md hard rule #7).

3. Create an API token at
   <https://dash.cloudflare.com/profile/api-tokens>:

   - Template: **Edit Cloudflare Workers** is too broad — instead
     use **Custom token**.
   - Permissions:
     - Account → **Cloudflare Pages** → **Edit**
     - User → **User Details** → **Read** (wrangler needs this)
   - Account resources: include the account that owns the project.
   - TTL: leave blank (rotate manually if it leaks).
   - Save the token value — Cloudflare only shows it once.

4. Find your **Account ID**: any page on dash.cloudflare.com shows
   it in the right sidebar (32-char hex string).

## GitHub Actions secrets

Add these at
<https://github.com/patrickchin/harpa-pro/settings/secrets/actions>:

- `CLOUDFLARE_API_TOKEN` — the token from step 3 above.
- `CLOUDFLARE_ACCOUNT_ID` — the account ID from step 4.

The workflows in `.github/workflows/marketing-preview.yml` and
`marketing-prod.yml` consume both. The preview workflow also needs
the default `GITHUB_TOKEN` (auto-provided) to comment the preview
URL on the PR.

## Custom domain (deferred to M3.1)

`harpapro.com` apex → `harpa-marketing.pages.dev` is wired in M3.
For M0 we only validate the `*.pages.dev` URL.

## Local manual deploy (for debugging only — CI is the source of truth)

```bash
cd apps/marketing
pnpm build
npx wrangler pages deploy ./dist \
  --project-name=harpa-pro \
  --branch=$(git branch --show-current)
```

Requires `npx wrangler login` once. CI uses an API token instead
(see GitHub Actions secrets section above).
