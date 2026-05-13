# Marketing site (`apps/marketing`)

> Status: planning. Mobile work (P2+) is **paused** while we build this.
> See [`../v4/implementation-plan.md`](../v4/implementation-plan.md) for the
> paused mobile track.

A mostly-static marketing site at `harpapro.com` with:

- Hero + how-it-works + sample report + FAQ + footer.
- **Interactive voice-to-report demo** — at launch, runs entirely
  in the browser against committed fixture JSON (no audio leaves
  the device). Wiring to the real Hono API is deferred to M4 (post-launch).
- **Waitlist signup** with double opt-in via Resend — the only
  backend work needed before launch.
- Legal pages (privacy, terms).

The signed-in product (when it exists) will live separately at
`apps/web` on `app.harpapro.com`. They will not share a framework or a
deploy.

Astro 5 static site with two React islands (waitlist form + voice
demo), deployed to Cloudflare Pages. Waitlist signups post directly
to `api.harpapro.com` (CORS) → `POST /waitlist` (new Hono route),
storing data in a new `waitlist_signups` table in Neon with
per-request scope tests. Confirmation emails send via Resend using
a one-time hashed token.

The voice demo at launch is **fully client-side**: the browser
records audio for UX realism (waveform, countdown) but discards the
blob immediately and reveals committed fixture JSON
(`apps/marketing/src/fixtures/demo/`) on a scripted timer. No API,
no R2, no auth. The fixture JSON shape mirrors the real API
response so the post-launch swap (M4) is mechanical.

M4 (deferred until after launch) replaces the fake pipeline with a
real anonymous demo-session JWT (15-min TTL, `scope=demo`) issued
by `POST /demo/session`, scoped to presign R2 uploads under
`demo/<sessionId>/`, transcribe those files, and generate a single
ephemeral report. Demo recordings get a 24h R2 lifecycle. All LLM
calls replay fixtures from `packages/ai-fixtures` in CI.

Analytics: Cloudflare Web Analytics (cookieless) only at launch.

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

1. **Voice-demo at launch**: Static. Browser records (for UX) but
   discards; canned fixtures play out on a scripted timer. Zero
   backend dependency. Lets us launch the site and capture waitlist
   signups while the real pipeline is still being polished.
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
5. **Analytics**: Cloudflare Web Analytics only at launch
   (cookieless, no consent banner). Defer PostHog until we have a
   funnel question Web Analytics can't answer.
6. **Demo recordings (M4 only)**: R2 prefix `demo/<sessionId>/`
   with 24h lifecycle. Negligible cost; useful for debugging and
   abuse investigation. Not relevant at launch (no audio uploaded).

## Phase order

| # | Name | File | Exit gate |
|---|---|---|---|
| M0 | Foundation | [`plan-m0-foundation.md`](plan-m0-foundation.md) | Astro app scaffolded into monorepo; Lovable JSX ported to `.astro`; deploys to Cloudflare Pages preview; Lighthouse ≥ 95 across the board. |
| M1 | Waitlist | [`plan-m1-waitlist.md`](plan-m1-waitlist.md) | `waitlist_signups` table + Hono route + scope test + double-opt-in email + Turnstile + admin CSV export. **Only backend work needed before launch.** |
| M2 | Voice demo (static) | [`plan-m2-voice-demo.md`](plan-m2-voice-demo.md) | Browser recorder + scripted reveal of committed fixture JSON. No API, no R2, no auth. Audio never leaves the device. |
| M3 | Launch | [`plan-m3-launch.md`](plan-m3-launch.md) | Legal pages; OG/sitemap/robots; Sentry; analytics; custom domain live; launch checklist. |
| M4 *(deferred)* | Voice demo (live API) | [`plan-m4-voice-demo-live.md`](plan-m4-voice-demo-live.md) | Replace M2's fake pipeline with `POST /demo/session` → R2 → `/voice/transcribe` → `/reports/:id/generate`. Tackled after launch. |

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
4. **Lighthouse gate.** CI runs Lighthouse on each PR. Performance,
   Accessibility, Best Practices, SEO must all be ≥ 95.
5. **Waitlist storage stays in Neon.** No third-party form services
   (Typeform, Tally, Google Forms) — own the data from day one.
