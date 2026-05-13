# Start the marketing site (M0 → M3)

## What this session is

You are starting work on **`apps/marketing`** — a new mostly-static
marketing site for harpa.app at `harpapro.com`. The mobile app track
(P2+) is **paused**. Do not touch `apps/mobile/` or `docs/v4/`.

The plan and architecture are already designed. Your job is to
execute against the plans, one phase at a time, using subagents
aggressively to keep this main thread's context small.

## Read these first (and only these)

- [`AGENTS.md`](../../AGENTS.md) — repo-wide hard rules. Note: `apps/marketing/` is a new
  workspace, but every hard rule still applies (Conventional Commits,
  no Supabase, NativeWind only in mobile, docs-in-same-PR, etc.).
- [`docs/marketing/README.md`](../README.md) — architecture summary,
  stack call (Astro 5 + Tailwind v4 + React 19 islands on Cloudflare
  Pages), services list, hard rules.
- [`docs/marketing/plan-m0-foundation.md`](../plan-m0-foundation.md)
  — first phase. Start here.
- [`docs/marketing/plan-m1-waitlist.md`](../plan-m1-waitlist.md),
  [`plan-m2-voice-demo.md`](../plan-m2-voice-demo.md),
  [`plan-m3-launch.md`](../plan-m3-launch.md) — skim only; don't load
  in detail until you're working on them.
- [`docs/marketing/plan-m4-voice-demo-live.md`](../plan-m4-voice-demo-live.md)
  — **deferred until after launch.** Do not start, do not read in
  detail. Exists so the launch demo (M2 — hardcoded fixtures, no
  API) can later be swapped for the real pipeline.

**Do NOT read** the v4 mobile architecture docs
(`docs/v4/arch-*.md`, `docs/v4/plan-p*.md`). They describe the mobile
app and are not relevant to this work. The only existing
infrastructure you need to know about:

- `packages/api` (Hono on Fly) — already has `POST /voice/transcribe`,
  `POST /reports/:id/generate`, R2 presign, rate-limit + idempotency
  middleware, fixture replay via `packages/ai-fixtures`. P1 complete.
- `packages/api-contract` — Zod + OpenAPI. Reuse schemas from here.
- Neon Postgres, Cloudflare R2, better-auth.

## Confirmed product/infra decisions (do not re-litigate)

- Domain: **`harpapro.com`** (already registered via Cloudflare Registrar).
- Subdomains: `harpapro.com` apex (marketing), `app.harpapro.com`
  (future product, not built yet), `docs.harpapro.com` (`apps/docs`),
  `api.harpapro.com` (Fly API).
- Stack: Astro 5, Tailwind v4, React 19 islands, MDX content
  collections, Cloudflare Pages, pnpm.
- **Voice demo at launch (M2): static.** Browser records audio for
  UX (waveform, countdown) but discards the blob; canned fixtures
  in `apps/marketing/src/fixtures/demo/` play out on a scripted
  timer. No API, no R2, no auth. Audio never leaves the device.
- **Voice demo (live API) is deferred to M4** — post-launch. Don't
  build any of the demo session JWT / R2 / CORS plumbing during
  this session.
- **Only backend work before launch is the waitlist (M1).**
- Waitlist form posts directly to `api.harpapro.com` (CORS, no proxy).
- Email: Resend.
- Analytics: Cloudflare Web Analytics only at launch (cookieless,
  no consent banner). PostHog deferred.

## How to use subagents (mandatory, not optional)

The whole point of this session is to ship M0 (and ideally start M1)
without exhausting context. Default to delegation:

- **`Explore`** — anything you need to look up in the existing repo
  (e.g. "how is the Hono API's CORS configured?", "show me the shape
  of the rate-limit middleware"). Never `read_file` exploratorily
  yourself when an `Explore` subagent can return a focused answer.
- **`architect`** — only if you hit a design question the plan
  doesn't answer (e.g. "should the demo session JWT live in
  `packages/api/src/auth/` or its own module?"). Don't call
  `architect` to re-design what's already in the plans.
- **`tdd-guide`** — mandatory for the M1 waitlist API work
  (`packages/api/` changes). Not needed for M2 (UI-only, no API).
- **`database-reviewer`** — when adding the `waitlist_signups`
  table + migration in M1. Has to look at it.
- **`security-reviewer`** — required for: Turnstile verification
  (M1.3), CORS config (M1.6), the waitlist confirm-token flow.
  Demo-session JWT review is deferred to M4.
- **`code-reviewer`** — after EVERY commit. Returns P0/P1/P2 verdict;
  act on P0 immediately.
- **`build-error-resolver`** — only if a build failure has been
  blocking for ~10 minutes. Don't pre-emptively summon.
- **`doc-updater`** — when a plan checkbox needs ticking, or a
  decision in the plan changes, or the bugs log needs an entry.
  Same commit as the code change.
- **`e2e-runner`** — for the Playwright voice-demo E2E in M2.7.

When in doubt: **delegate**. Don't load files into this context that
a subagent can summarise.

## Execution rules

1. Work the phases in order: **M0.1 → M0.2 → … → M0.7 → tag → M1 →**.
   One commit per task minimum. No big-bang commits.
2. **TDD on API code**: failing test first, then minimal pass.
   `tdd-guide` enforces this for `packages/api/` changes.
3. **Tick the plan checkboxes** in the same commit as the code that
   completes them. `doc-updater` handles this.
4. After each commit: `code-reviewer`. Address P0s before moving on.
5. When you finish M0, **tag `v0.1.0-marketing`** and stop. Do not
   roll into M1 in the same session unless the user explicitly asks.

## First action

1. Read `docs/marketing/README.md` and `docs/marketing/plan-m0-foundation.md`
   end-to-end.
2. Use `manage_todo_list` to mirror the M0 task list (M0.1 through M0.7).
3. Mark M0.1 in-progress and begin: scaffold `apps/marketing/` as a new
   pnpm workspace with Astro 5 + Tailwind v4 + the Cloudflare adapter.

## Out of scope for this session

- Anything in `apps/mobile/` or `docs/v4/`.
- M4 (live voice-demo API wiring). Hard stop — deferred until after
  launch.
- New architectural decisions not already in `docs/marketing/`.
- Touching `packages/api/` (M1 territory; only after M0 ships).
- Domain DNS changes (M3.1 territory).
- Production deploys (M0 only goes as far as a Pages preview URL).
