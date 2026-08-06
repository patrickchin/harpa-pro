# Public site (`apps/site`)

> Status: the public site is live. This directory preserves its original
> M0–M4 implementation plans; current product guides are maintained alongside
> the site in `apps/site/src/content/docs`.

A mostly-static public site at `harpapro.com` with:

- Hero + how-it-works + sample report + FAQ + footer.
- **Interactive voice-to-report demo** — simulates recording in the browser
  and reveals a committed fixture. It captures no audio. Live API wiring is a
  deferred M4 proposal.
- **Waitlist signup** with double opt-in via Resend — the only
  backend work needed before launch.
- A privacy page. A terms page is not implemented.
- Current product guides under `/docs`.

A separate office-dashboard proposal uses `apps/dashboard`. It is not part of
the current `dev` branch and has no production hostname.

Astro 7 static site with two React islands (waitlist form + voice
demo), deployed to Cloudflare Pages. Waitlist signups post directly
to `api.harpapro.com` (CORS) → `POST /waitlist`,
storing data in a new `waitlist_signups` table in Neon with
per-request scope tests. Confirmation emails send via Resend using
a one-time hashed token.

The voice demo is **fully client-side**. It does not capture audio. It animates
a recording state and reveals committed data from
`apps/site/src/fixtures/demoReport.ts` on a scripted timer. It does not call
the API, R2, authentication, or an AI provider.

M4 (deferred until after launch) replaces the fake pipeline with a
real anonymous demo-session JWT (15-min TTL, `scope=demo`) issued
by `POST /demo/session`, scoped to presign R2 uploads under
`demo/<sessionId>/`, transcribe those files, and generate a single
ephemeral report. Demo recordings get a 24h R2 lifecycle. All LLM
calls replay fixtures from `packages/ai-fixtures` in CI.

Repository configuration does not prove that public-site analytics or Sentry
is active. Treat provider-console state as `UNKNOWN` until it is checked.

The proposed consent and marketing-telemetry contract is documented in
[`../v4/design-public-site-consent-and-marketing-telemetry.md`](../v4/design-public-site-consent-and-marketing-telemetry.md).
That document is design-only: it does not approve a provider or authorize
adding a CMP, tracker, cookie, or visitor-data flow.

## Stack decision

| Concern            | Choice                                           | Rationale                                                                         |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Framework          | **Astro 7**                                      | Mostly-static content; ships zero JS by default; React islands for interactivity. |
| Build runtime      | Node 22.12+ and Vite 8                           | Supported runtime and bundler line for Astro 7.                                   |
| Styling            | Tailwind v4                                      | Same as Lovable scaffold; copy classes across.                                    |
| Interactive bits   | React 19 inside Astro islands (`client:visible`) | Voice demo + waitlist form.                                                       |
| UI primitives      | Local Astro and React components                 | The site has no shadcn/ui dependency.                                             |
| Content (FAQ etc.) | MDX via Astro content collections                | Easy edits without code changes.                                                  |
| Forms              | React state plus the shared API contract         | The site has no react-hook-form dependency.                                       |
| API calls          | Direct to `api.harpapro.com` with CORS           | No proxy layer; rate-limiting + Turnstile at API boundary.                        |
| Hosting            | Cloudflare Pages                                 | Free; global edge; auto SSL; PR previews.                                         |
| Package manager    | pnpm                                             | Fit the monorepo (Lovable's `bun.lock` gets dropped).                             |

Astro over TanStack Start: this is a content site, not a SPA. Astro
outputs HTML + minimal hydration — faster, smaller, simpler.

## Services / accounts

### Required for launch

- **GitHub** — source control (have).
- **Cloudflare** — Pages hosting, DNS, Turnstile, Web Analytics. One account, free tier.
- **Domain registrar** — `harpapro.com` (or chosen apex). Recommend Cloudflare Registrar (at-cost).
- **Resend** — waitlist confirmation emails. Free tier covers 3k/mo.
- **Neon** — already configured; stores `waitlist_signups`.
- **Fly.io** — already configured; runs the Hono API.

### Strongly recommended (free)

- **Sentry** — error tracking (free 5k/mo).
- **Cloudflare Web Analytics** — pageviews + Web Vitals, cookieless, no banner.

### Defer

- PostHog / Plausible — only when funnels become useful.
- Loops / Customer.io — only when drip campaigns are useful.
- Crisp / Intercom — only when live chat is useful.
- BetterStack / Statuspage — only when uptime page is useful.

## Architectural decisions

1. **Current voice demo**: Static. The UI simulates recording but captures no
   audio. A committed fixture appears on a scripted timer. The demo has no
   backend dependency.
2. **Voice-demo (post-launch, M4)**: Anonymous + Turnstile +
   rate-limit. Short-lived JWT (15 min, `scope=demo`, `sessionId`,
   `reportId`) issued by `POST /demo/session`, scoped via middleware
   to a single R2 prefix and a single report. No `user_id`, no
   access to real user tables. UI-only swap if we later pivot to
   email-first or waitlist-only gating.
3. **Waitlist form posts to**: Directly to `api.harpapro.com` with
   CORS. Simpler than proxying; rate-limiting and Turnstile live at
   the API boundary.
4. **Email provider**: Resend. Generous free tier, React Email
   support, good deliverability.
5. **Analytics**: If analytics is enabled, Cloudflare Web Analytics is the
   approved cookieless option. Provider state is `UNKNOWN`. PostHog needs a
   specific funnel requirement and a consent review.
6. **Demo recordings (M4 only)**: R2 prefix `demo/<sessionId>/`
   with 24h lifecycle. Negligible cost; useful for debugging and
   abuse investigation. Not relevant at launch (no audio uploaded).

## Phase order

| #               | Name                  | File                                                       | Exit gate                                                                                                                                                                       |
| --------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0              | Foundation            | [`plan-m0-foundation.md`](plan-m0-foundation.md)           | Astro app scaffolded into monorepo; Lovable JSX ported to `.astro`; deploys to Cloudflare Pages preview; Lighthouse performance/accessibility ≥ 90 and best practices/SEO ≥ 95. |
| M1              | Waitlist              | [`plan-m1-waitlist.md`](plan-m1-waitlist.md)               | `waitlist_signups` table + Hono route + scope test + double-opt-in email + Turnstile + admin CSV export. **Only backend work needed before launch.**                            |
| M2              | Voice demo (static)   | [`plan-m2-voice-demo.md`](plan-m2-voice-demo.md)           | Simulated recording state plus a committed fixture. No audio capture, API, R2, or authentication.                                                                               |
| M3              | Partial               | [`plan-m3-launch.md`](plan-m3-launch.md)                   | Custom domain, privacy, OG image, sitemap, robots, and public guides are present. Terms, public-site Sentry, and analytics are not repository-confirmed.                        |
| M4 _(deferred)_ | Voice demo (live API) | [`plan-m4-voice-demo-live.md`](plan-m4-voice-demo-live.md) | Replace M2's fake pipeline with `POST /demo/session` → R2 → `/voice/transcribe` → `/reports/:id/generate`. Tackled after launch.                                                |

## Hard rules (extend AGENTS.md)

These add to the existing hard rules in [`../../AGENTS.md`](../../AGENTS.md):

1. **No JS unless an island needs it.** Default-export `.astro`
   components. Reach for React only when you need state, effects, or
   browser APIs (recorder, form).
2. **No new direct-to-LLM code paths.** When M4 wires the demo live,
   it MUST reuse the existing voice + reports routes through fixtures.
   M2 ships only committed JSON fixtures — never call an LLM at
   build or runtime.
3. **No analytics with cookies before the consent gate ships.**
   Cloudflare Web Analytics only until PostHog lands (if ever).
4. **Lighthouse gate.** CI runs Lighthouse on each PR. Performance and
   Accessibility must be ≥ 90; Best Practices and SEO must be ≥ 95.
5. **Waitlist storage stays in Neon.** No third-party form services
   (Typeform, Tally, Google Forms) — own the data from day one.
