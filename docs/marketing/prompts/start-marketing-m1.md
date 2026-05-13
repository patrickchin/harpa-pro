# Start marketing M1 — Waitlist

## What this session is

You are continuing work on the harpa-pro marketing site. **M0 is
shipped and tagged `v0.1.0-marketing`** — the Astro site is live at
[harpapro.com](https://harpapro.com) with the Lovable landing page
ported, MDX content collections, Cloudflare Pages preview + prod
workflows, and a Lighthouse CI gate (perf/a11y/bp/seo ≥ 0.95).

This session ships **M1 — Waitlist**. It is the only backend work
needed before launch.

The mobile app track (P2+) is **paused**. Do not touch
`apps/mobile/` or `docs/v4/`.

## Read these first (and only these)

- [`AGENTS.md`](../../AGENTS.md) — repo-wide hard rules. Every rule
  applies to `apps/marketing/` and `packages/api/` changes
  (Conventional Commits, no Supabase, docs-in-same-PR, scope tests
  for every new table, TDD on API code).
- [`docs/marketing/README.md`](../README.md) — current architecture
  summary (note: M2 is now the **static** voice demo; M4 is the
  deferred live-API version).
- [`docs/marketing/plan-m1-waitlist.md`](../plan-m1-waitlist.md) —
  this phase. Read end-to-end before starting.
- [`docs/v4/arch-auth-and-rls.md`](../../v4/arch-auth-and-rls.md) —
  per-request Postgres scope pattern. The `waitlist_signups` scope
  test in M1.1 follows this pattern exactly.
- [`packages/api/AGENTS.md`](../../../packages/api/AGENTS.md) (if it
  exists) — local API conventions.

**Do NOT read** in detail unless needed:

- The v4 mobile architecture docs (`docs/v4/plan-p*.md`,
  `docs/v4/arch-mobile.md`, etc.) — irrelevant to the waitlist.
- [`docs/marketing/plan-m2-voice-demo.md`](../plan-m2-voice-demo.md)
  and [`plan-m3-launch.md`](../plan-m3-launch.md) — skim only.
- [`docs/marketing/plan-m4-voice-demo-live.md`](../plan-m4-voice-demo-live.md)
  — **deferred**. Do not start, do not read in detail.

## Existing infrastructure you can reuse

- `packages/api` (Hono on Fly): already has rate-limit + idempotency
  middleware, per-request-scoped Postgres roles, Drizzle migrations
  pipeline, Testcontainers integration tests, and an OpenAPI
  contract-drift gate.
- `packages/api-contract`: Zod schemas + OpenAPI emission. Reuse
  patterns from existing routes.
- Neon Postgres (with PR-branching).
- better-auth (for the admin role on `GET /admin/waitlist.csv`).
- Resend (new in M1 — domain needs verifying in M1.9).
- Cloudflare Turnstile (new in M1 — site key + secret needed).

## Confirmed product/infra decisions (do not re-litigate)

- Domain: **`harpapro.com`** (Cloudflare Registrar; DNS already up
  for the marketing site).
- Waitlist form posts **directly** to `api.harpapro.com` with CORS,
  no proxy via the Astro site.
- **Double opt-in**: signup creates a row with `confirm_token_hash`;
  Resend emails a one-time link to `harpapro.com/confirm?token=...`;
  `POST /waitlist/confirm` flips `confirmed_at`. Constant-time
  compare, 7-day expiry, idempotent.
- **Enumeration-safe**: `POST /waitlist` always returns 202 with a
  neutral message ("If that email is valid, we've sent…") so the
  endpoint can't be used to enumerate registered addresses.
- **`confirm_token_hash` only**: never store raw tokens. SHA-256 of
  the 32-byte hex token; the raw token lives only in the email.
- **Email validation**: Zod `.email()` + a small static
  disposable-domain blocklist in
  `packages/api/src/lib/email-validation.ts`.
- **Admin export**: streaming `GET /admin/waitlist.csv` gated on a
  better-auth `admin` role claim. No admin UI, just CSV.
- **Anonymous DB scope**: anon role gets `INSERT` on
  `waitlist_signups` only — no `SELECT`/`UPDATE`/`DELETE`. Admin
  role has full access. Enforced by per-request scope + proven by
  a scope test (mandatory per AGENTS.md hard rule).

## How to use subagents (mandatory, not optional)

Default to delegation. Don't load files into this context that a
subagent can summarise.

- **`Explore`** — anything you need to look up in the existing repo
  ("how is the existing Hono rate-limit middleware wired?", "show
  me an example per-request scope test", "where are migrations
  named and timestamped?"). Never `read_file` exploratorily yourself
  when an Explore subagent can return a focused answer.
- **`tdd-guide`** — **mandatory** on every `packages/api/` and
  `packages/api-contract/` change. Failing test first, then minimal
  pass. Coverage gate for `packages/api` is ≥ 90% lines.
- **`database-reviewer`** — **mandatory** for M1.1 (Drizzle schema
  + SQL migration + scope test). Has to look at it before commit.
- **`security-reviewer`** — **mandatory** for: M1.3 (Turnstile
  verification + enumeration safety + rate-limit), M1.4 (token
  compare + expiry + idempotency), M1.6 (admin gating), M1.8 (CORS
  allow-list). Run BEFORE the commit lands.
- **`architect`** — only if a design question the plan doesn't
  answer comes up. Don't re-design what's already in
  `plan-m1-waitlist.md`.
- **`code-reviewer`** — after EVERY commit. P0/P1/P2 verdict; act
  on P0s before moving on.
- **`build-error-resolver`** — only after ~10 minutes of being
  blocked on a build/type failure.
- **`doc-updater`** — tick plan checkboxes in the SAME commit as
  the code that completes them.

When in doubt: **delegate**.

## Execution rules

1. Work the phases in order: **M1.1 → M1.2 → … → M1.10**. One
   commit per task minimum. No big-bang commits.
2. **TDD on every API change**: failing test first, then minimal
   pass. `tdd-guide` enforces this.
3. **Scope test is mandatory** for the new `waitlist_signups`
   table (AGENTS.md hard rule). It lives in
   `packages/api/src/__tests__/scope/waitlist.test.ts`.
4. **Tick the plan checkboxes** in the same commit as the code
   that completes them. `doc-updater` handles this.
5. After each commit: `code-reviewer`. Address P0s before moving on.
6. **Security review BEFORE the commit** on every step that touches
   tokens, Turnstile, CORS, rate-limit, or the admin gate.
7. When you finish M1, **tag `v0.2.0-marketing`** and stop. Do not
   roll into M2 in the same session unless the user explicitly
   asks.

## Operator-supplied secrets (ask the user if missing)

These are needed before M1 can fully run end-to-end. Don't block
the code work on them — write the code first, ask the operator to
populate them before M1.10 sign-off.

- `TURNSTILE_SITE_KEY` (public; goes into
  `apps/marketing/.env` as `PUBLIC_TURNSTILE_SITE_KEY` and into
  Cloudflare Pages env). Create at
  https://dash.cloudflare.com/?to=/:account/turnstile.
- `TURNSTILE_SECRET_KEY` (Fly secret on `packages/api`).
- `RESEND_API_KEY` (Fly secret). Sign up + verify `harpapro.com`
  sending domain at https://resend.com — DKIM/SPF/DMARC records
  go into Cloudflare DNS during M1.9.
- `WAITLIST_ADMIN_USER_ID` (or an `admin=true` row in `users`) so
  the CSV export has at least one valid caller for the integration
  test.

## First action

1. Read `docs/marketing/README.md` and
   `docs/marketing/plan-m1-waitlist.md` end-to-end.
2. Use `Explore` to summarise:
   - The existing Hono rate-limit + idempotency middleware
     interfaces in `packages/api`.
   - One existing per-request scope test as a template.
   - The Drizzle migration filename pattern and how migrations are
     applied in Testcontainers vs Neon branches.
3. Use `manage_todo_list` to mirror the M1 task list (M1.1 through
   M1.10).
4. Mark M1.1 in-progress and begin with `tdd-guide` +
   `database-reviewer` on the schema + migration + scope test.

## Out of scope for this session

- Anything in `apps/mobile/` or `docs/v4/`.
- M2 (static voice demo) and M3 (launch).
- M4 (live voice-demo API wiring). Hard stop — deferred until after
  launch.
- New architectural decisions not already in
  `docs/marketing/plan-m1-waitlist.md`.
- Domain DNS changes beyond the Resend DKIM/SPF/DMARC records in
  M1.9 (those are required for email deliverability).
- Drip campaigns, admin UI, analytics on waitlist signups.
