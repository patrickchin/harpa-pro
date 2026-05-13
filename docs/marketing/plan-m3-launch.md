# M3 — Launch

Goal: site is on the custom domain, observable, legally compliant,
indexable, and ready to drive traffic to.

## Exit gate
- [ ] `harpapro.com` (apex) live with valid SSL.
- [ ] Privacy + terms pages live and linked from footer.
- [ ] `sitemap.xml`, `robots.txt`, `favicon.ico`, `apple-touch-icon.png`,
      `opengraph-image.png` shipped.
- [ ] Sentry capturing client errors + API errors with source maps.
- [ ] Cloudflare Web Analytics live; cookieless; no consent banner
      needed.
- [ ] All copy proofread (hero, features, FAQ, legal).
- [ ] Launch checklist signed off.

## Tasks

### M3.1 Custom domain + DNS
- [x] `harpapro.com` already registered via Cloudflare Registrar (DNS
      managed in Cloudflare).
- [ ] Cloudflare Pages → attach apex domain to the production project.
- [ ] DNS records:
      - `A` + `AAAA` for `harpapro.com` → Cloudflare Pages IPs.
      - `CNAME app.harpapro.com` → parked / 302 redirect to apex for now
        (future home of `apps/web`).
      - `CNAME docs.harpapro.com` → wherever `apps/docs` deploys.
      - Resend DNS records (DKIM/SPF/DMARC) if not already done in M1.
- [ ] HSTS preload submission once domain is stable for a week (defer
      until post-launch if time-constrained).
- [ ] Commit: `docs(marketing): dns + domain setup`.

### M3.2 Legal pages
- [ ] Create `apps/marketing/src/pages/privacy.astro` and
      `apps/marketing/src/pages/terms.astro`.
- [ ] Start from a vetted template (Termly, Iubenda, or hand-rolled
      from Cal.com / Resend's public privacy docs). Have a lawyer
      review before paid launch — fine to ship the template at
      private beta.
- [ ] Cover: data collected (email, anonymised IP hash, demo audio
      kept 24h, cookies: none except Cloudflare analytics beacon),
      processors (Cloudflare, Neon, Fly, Resend, OpenAI/Anthropic/
      Google for transcription + summarisation), retention, GDPR
      rights, contact (`privacy@harpapro.com`).
- [ ] Footer links to both + a `mailto:privacy@harpapro.com` contact.
- [ ] Commit: `feat(marketing): privacy + terms pages`.

### M3.3 SEO + social
- [ ] Install `@astrojs/sitemap` integration, configure with
      `site: 'https://harpapro.com'` in `astro.config.mjs`.
- [ ] Create `public/robots.txt`:
      ```
      User-agent: *
      Allow: /
      Sitemap: https://harpapro.com/sitemap.xml
      ```
- [ ] Per-page `<title>`, `<meta name="description">`, canonical
      URL in `<Layout>` component.
- [ ] OpenGraph image: static PNG (1200×630) committed to
      `public/og-image.png`; one per page acceptable to start.
- [ ] JSON-LD `Organization` schema in the `<head>` of
      `src/pages/index.astro`:
      ```json
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Harpa",
        "url": "https://harpapro.com",
        "logo": "https://harpapro.com/logo.png",
        "description": "Voice-powered construction site reports"
      }
      ```
- [ ] Commit: `feat(marketing): seo + opengraph`.

### M3.4 Sentry (client side)
- [ ] Install `@sentry/astro` in `apps/marketing`.
- [ ] Configure `astro.config.mjs`:
      ```ts
      import sentry from '@sentry/astro';
      export default defineConfig({
        integrations: [
          sentry({
            dsn: import.meta.env.PUBLIC_SENTRY_DSN,
            environment: import.meta.env.PUBLIC_ENVIRONMENT,
            release: import.meta.env.PUBLIC_COMMIT_SHA,
          }),
        ],
      });
      ```
- [ ] PII scrubbing: never send email addresses or IP to Sentry
      (configure `beforeSend` hook to redact).
- [ ] Commit: `feat(marketing): sentry integration`.

### M3.5 Sentry (API side for demo routes)
- [ ] If not already done in P1, install `@sentry/node` in
      `packages/api`.
- [ ] Wrap demo routes (`/demo/session`, `/waitlist`, `/voice/transcribe`,
      `/reports/:id/generate` when called with demo scope) with
      Sentry error capture.
- [ ] Source maps uploaded on Fly deploy (Sentry CLI in CI).
- [ ] Commit: `feat(api): sentry for demo routes`.

### M3.6 Analytics
- [ ] Cloudflare Web Analytics snippet in
      `apps/marketing/src/layouts/Layout.astro` `<head>`:
      ```html
      <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
      ```
- [ ] Cookieless, no consent banner needed under GDPR/CCPA.
- [ ] Dashboard linked from `docs/marketing/ops.md`.
- [ ] **Defer PostHog** — do not add it at launch. Wait until we
      have a specific funnel question Cloudflare Web Analytics can't
      answer.
- [ ] Commit: `feat(marketing): cloudflare web analytics`.

### M3.7 Performance pass
- [ ] Largest Contentful Paint < 1.5s on a throttled 4G profile
      (Lighthouse).
- [ ] All images: `<Image>` from `astro:assets` with `format="webp"`,
      `widths={[400, 800, 1200]}`, `loading="lazy"` below the fold.
- [ ] Self-host fonts (already done in M0 via `@fontsource-variable/inter`).
- [ ] No render-blocking JS (only the demo island + waitlist island
      ship JS, and both are `client:visible`).
- [ ] Commit: `perf(marketing): image + font + JS budget pass`.

### M3.8 Accessibility pass
- [ ] Run `axe-core` via Playwright on every page (`index`, `privacy`,
      `terms`).
- [ ] Keyboard-only path through hero → waitlist form → submit (tab,
      enter).
- [ ] Voice demo has accessible labels (`aria-label` on record
      button), clear focus order, and a clear mic-denied fallback
      message.
- [ ] Commit: `chore(marketing): a11y pass`.

### M3.9 Launch checklist
- [ ] Create `docs/marketing/launch-checklist.md`:
      - [ ] DNS propagated (`dig harpapro.com` resolves correctly).
      - [ ] SSL valid + auto-renews (Cloudflare Pages).
      - [ ] Waitlist form works end-to-end (test signup + confirm).
      - [ ] Demo works end-to-end (test recording + transcript +
            report).
      - [ ] Resend deliverability tested (Gmail, Outlook, ProtonMail,
            iCloud).
      - [ ] Sentry capturing prod errors (trigger a test error).
      - [ ] Cloudflare Web Analytics receiving events (check dashboard).
      - [ ] Admin CSV export works in prod (`GET /admin/waitlist.csv`).
      - [ ] Demo rate limits enforced (test 4 sessions / IP / 24h →
            should block).
      - [ ] 404 page styled (`src/pages/404.astro`).
      - [ ] 500 error page styled (if Astro supports it; otherwise
            Cloudflare Pages default is acceptable).
      - [ ] Legal pages proofread by a human (privacy, terms).
      - [ ] Lighthouse ≥ 95 on all non-demo pages, ≥ 85 on demo page.
- [ ] Commit: `docs(marketing): launch checklist`.

### M3.10 M3 exit
- [ ] Work through launch checklist, check every box.
- [ ] Tag `v1.0.0-marketing` on launch day.

## Out of scope for M3
- A/B testing.
- Blog / changelog (separate decision; the MDX scaffold makes this
  easy whenever we want it).
- Live chat (Crisp, Intercom).
- Localisation.
- Pricing page (no paid product yet).
- PostHog (defer until we have a funnel question).
