# Marketing site (`apps/marketing`)

> Status: planning. Mobile work (P2+) is **paused** while we build this.
> See [`../v4/implementation-plan.md`](../v4/implementation-plan.md) for the
> paused mobile track.

A mostly-static marketing site at `harpapro.com` with:

- Hero + how-it-works + sample report + FAQ + footer.
- **Interactive voice-to-report demo** powered by the existing Hono API
  (`/voice/transcribe` + `/reports/:id/generate`, both fixture-replay
  capable from P1).
- **Waitlist signup** with double opt-in via Resend.
- Legal pages (privacy, terms).

The signed-in product (when it exists) will live separately at
`apps/web` on `app.harpapro.com`. They will not share a framework or a
deploy.

## Architecture summary

Astro 5 static site with two React islands (waitlist form + voice demo),
deployed to Cloudflare Pages. Consumes the existing Hono API
(`packages/api` on `api.harpapro.com`) via direct CORS calls. Waitlist
signups post to `POST /waitlist` (new route), storing data in a new
`waitlist_signups` table in Neon with per-request scope tests.
Confirmation emails send via Resend using a one-time hashed token.
Voice demo uses an **anonymous demo-session JWT** (15-min TTL,
`scope=demo`) issued by `POST /demo/session` (new route). Demo token
allows presigning R2 uploads under `demo/<sessionId>/`, transcribing
those files, and generating a single ephemeral report. Demo recordings
land in R2 under the `demo/` prefix with a 24h lifecycle rule. All LLM
calls replay fixtures from `packages/ai-fixtures` in CI and `:mock`
builds. Analytics: Cloudflare Web Analytics (cookieless) only at launch.

## Stack decision

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Astro 5** | Mostly-static content; ships zero JS by default; React islands for interactivity. |
| Styling | Tailwind v4 | Same as Lovable scaffold; copy classes across. |
| Interactive bits | React 19 inside Astro islands (`client:visible`) | Voice demo + waitlist form. |
| UI primitives | shadcn/ui (only in islands) | Vendor only what we use: Button, Input, Form, Dialog, Toast. |
| Content (FAQ etc.) | MDX via Astro content collections | Easy edits without code changes. |
| Forms | react-hook-form + Zod (shared with `@harpa/api-contract`) | Single source of truth for DTOs. |
| API calls | Direct to `api.harpapro.com` with CORS | No proxy layer; rate-limiting + Turnstile at API boundary. |
| Hosting | Cloudflare Pages | Free; global edge; auto SSL; PR previews. |
| Package manager | pnpm | Fit the monorepo (Lovable's `bun.lock` gets dropped). |

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

1. **Voice-demo gating**: Anonymous + Turnstile + rate-limit. Lowest
   friction, maximizes trial. If we pivot to email-first or
   waitlist-only, it's a UI-only change.
2. **Demo session token**: Short-lived JWT (15 min, `scope=demo`,
   `sessionId=<uuid>`) issued by `POST /demo/session`. Scoped via
   middleware to allow only: presign for `demo/<sessionId>/*`,
   register files under that prefix, transcribe those files, and
   generate one report (ID embedded in token). No `user_id`, no
   access to real user tables.
3. **Waitlist form posts to**: Directly to `api.harpapro.com` with CORS.
   Simpler than proxying; rate-limiting and Turnstile live at the API
   boundary.
4. **Email provider**: Resend. Generous free tier, React Email
   support, good deliverability.
5. **Analytics**: Cloudflare Web Analytics only at launch (cookieless,
   no consent banner). Defer PostHog until we have a funnel question
   Web Analytics can't answer.
6. **Demo recordings**: R2 prefix `demo/<sessionId>/` with 24h
   lifecycle. Allows debugging and abuse investigation; negligible
   cost.

## Phase order

| # | Name | File | Exit gate |
|---|---|---|---|
| M0 | Foundation | [`plan-m0-foundation.md`](plan-m0-foundation.md) | Astro app scaffolded into monorepo; Lovable JSX ported to `.astro`; deploys to Cloudflare Pages preview; Lighthouse ≥ 95 across the board. |
| M1 | Waitlist | [`plan-m1-waitlist.md`](plan-m1-waitlist.md) | `waitlist_signups` table + Hono route + scope test + double-opt-in email + Turnstile + admin CSV export. |
| M2 | Voice demo | [`plan-m2-voice-demo.md`](plan-m2-voice-demo.md) | Browser recorder → R2 upload → transcribe → generate → side-by-side display; anonymous demo-session JWT enforced; demo works in fixture mode. |
| M3 | Launch | [`plan-m3-launch.md`](plan-m3-launch.md) | Legal pages; OG/sitemap/robots; Sentry; analytics; custom domain live; launch checklist. |

## Hard rules (extend AGENTS.md)

These add to the existing hard rules in [`../../AGENTS.md`](../../AGENTS.md):

1. **No JS unless an island needs it.** Default-export `.astro`
   components. Reach for React only when you need state, effects, or
   browser APIs (recorder, form).
2. **No new direct-to-LLM code paths.** The demo MUST reuse the
   existing voice + reports routes through fixtures.
3. **No analytics with cookies before the consent gate ships.**
   Cloudflare Web Analytics only until PostHog lands (if ever).
4. **Lighthouse gate.** CI runs Lighthouse on each PR. Performance,
   Accessibility, Best Practices, SEO must all be ≥ 95.
5. **Waitlist storage stays in Neon.** No third-party form services
   (Typeform, Tally, Google Forms) — own the data from day one.
