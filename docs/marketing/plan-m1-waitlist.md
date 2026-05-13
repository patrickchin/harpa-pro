# M1 — Waitlist

Goal: a working, double-opt-in waitlist with the data stored in Neon,
protected by Turnstile, with a confirmation email and an admin CSV
export.

## Exit gate
- [x] `waitlist_signups` table + migration + per-request scope test
      (anonymous can `INSERT` only, no `SELECT`/`UPDATE`/`DELETE`).
- [x] `POST /waitlist` Hono route (rate-limited, Turnstile-verified,
      idempotent).
- [x] `POST /waitlist/confirm` route (one-time token, idempotent,
      constant-time compare).
- [x] `GET /admin/waitlist.csv` (better-auth admin role gated).
- [ ] Resend domain verified; confirmation email sends via React
      Email template. **(Operator action required — see M1.9.
      Code-side is complete; needs DNS + secrets before launch.)**
- [x] Marketing-site React island: working form with success/error
      states, Turnstile widget, optimistic UX, posts directly to
      `api.harpapro.com` with CORS.
- [x] Integration tests against Testcontainers Postgres (insert,
      confirm, dedupe).
- [x] Spec drift gate green (`openapi.json` regenerated, contract
      tests pass).

## Tasks

### M1.1 Schema + migration
- [x] Drizzle schema (added to `packages/api/src/db/schema.ts` —
      single-file schema matches existing convention):
      ```ts
      export const waitlistSignups = pgTable('waitlist_signups', {
        id: uuid('id').primaryKey().defaultRandom(),
        email: text('email').notNull().unique(), // citext in migration
        company: text('company'),
        role: text('role'),
        source: text('source'),           // utm_source or referrer
        ipHash: text('ip_hash'),          // sha256(ip + salt), abuse only
        confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
        confirmTokenHash: text('confirm_token_hash'),
        confirmTokenExpiresAt: timestamp('confirm_token_expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
      });
      ```
- [x] SQL migration `packages/api/migrations/202605130002_waitlist.sql`:
      ```sql
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE TABLE waitlist_signups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext UNIQUE NOT NULL,
        company text,
        role text,
        source text,
        ip_hash text,
        confirmed_at timestamptz,
        confirm_token_hash text,
        confirm_token_expires_at timestamptz,
        created_at timestamptz DEFAULT now() NOT NULL
      );
      ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
      GRANT INSERT ON waitlist_signups TO anon;
      -- No SELECT/UPDATE/DELETE for anon; admin role has full access
      ```
- [x] Per-request-scope test
      `packages/api/src/__tests__/scope/waitlist.scope.test.ts`:
      `app_anonymous` role can `INSERT` only; cannot `SELECT`,
      `UPDATE`, `DELETE`. Admin access is via superuser/`rawDb` for
      now; an `admin` role is added in M1.6.
- [x] Commit: `feat(api): waitlist_signups schema + migration + scope test`.

### M1.2 Contract schemas
- [x] `packages/api-contract/src/schemas/waitlist.ts`:
      ```ts
      export const waitlistSignupRequestSchema = z.object({
        email: z.string().email(),
        company: z.string().optional(),
        role: z.string().optional(),
        source: z.string().optional(),
        turnstileToken: z.string(),
      });
      export const waitlistSignupResponseSchema = z.object({
        success: z.boolean(),
        message: z.string(),
      });
      export const waitlistConfirmRequestSchema = z.object({
        token: z.string().length(64), // 32 bytes hex
      });
      ```
- [x] Disposable-domain blocklist exported as
      `DISPOSABLE_EMAIL_DOMAINS` from `@harpa/api-contract` (shared
      between server validator and any future client preflight).
- [x] Commit: `feat(contract): waitlist schemas`.

### M1.3 `POST /waitlist`
- [x] Verify Turnstile token server-side
      (`https://challenges.cloudflare.com/turnstile/v0/siteverify`).
      Implemented in `packages/api/src/lib/turnstile.ts` with a
      fake-mode mirror of the Twilio pattern (`TURNSTILE_LIVE=0`
      accepts any `tt-*` token; `TURNSTILE_LIVE=1` calls Cloudflare).
- [x] Rate-limit budget: 5 / IP / hour, 50 / IP / day. Implemented
      inline in the route via `getRateLimiter()` keyed on IP
      (`withRateLimit` keys on userId so we can't reuse it for an
      unauth route — that's a DoS vector noted in its own header).
- [x] Dedupe on `email` (upsert): re-sending always sends a fresh
      confirm email if not yet confirmed, but doesn't reset
      `created_at`. Confirmed signups never have their token rotated.
- [x] Generate `confirm_token` (32 bytes hex via `crypto.randomBytes`),
      store `confirm_token_hash` (sha256) only.
- [x] Set `confirm_token_expires_at` to 7 days from now.
- [x] Enqueue confirmation email via Resend (fake mode in tests; live
      mode `RESEND_LIVE=1` POSTs to https://api.resend.com/emails).
- [x] Return 202 with a neutral message: "If that email address is
      valid, we've sent you a confirmation link." Turnstile failures,
      disposable domains, and already-confirmed emails all share this
      response. Rate-limit hits return 429 (the only non-neutral case
      — clients need the back-off signal).
- [x] Tests: happy path, dedupe, already-confirmed, Turnstile fail,
      rate-limit hit, disposable email, malformed email, citext
      case-insensitive dedupe, default-clients env path (9 cases in
      `packages/api/src/__tests__/waitlist.integration.test.ts`).
- [x] Commit: `feat(api): POST /waitlist with turnstile + resend`.

### M1.4 `POST /waitlist/confirm`
- [x] Look up by `confirm_token_hash` (constant-time compare via
      `crypto.timingSafeEqual` even after the indexed hash lookup, so
      the hit/miss path stays uniform at the bytes level).
- [x] Expire after 7 days (check `confirm_token_expires_at`).
- [x] Set `confirmed_at` if null.
- [x] Idempotent: confirming twice returns 200, not 4xx.
- [x] Tests: happy, expired, unknown token, double-confirm,
      malformed (non-hex) token (5 cases in the same integration
      file).
- [x] Commit: lands together with M1.3 — `feat(api): POST /waitlist
      with turnstile + resend` (single commit covers both routes
      since they share the route module, table, and tests).

### M1.5 Confirmation email template
- [x] Created `packages/api/src/emails/waitlist-confirmation.ts`
      (plain TS — see deferral note below). Exports
      `renderWaitlistConfirmationEmail({ confirmUrl })` returning
      `{ html, text }`. Route handler imports it directly.
- [x] **Deferred React Email migration.** The plan originally
      specified `@react-email/components`; for one ~40-line
      transactional template we'd be adding ~5MB of React-email
      dependencies and a TSX target to a previously pure-TS API
      package. The current plain-HTML template is reviewable in
      one screen, on-brand (uses the same `#0f5f3f` accent green
      as the marketing site), snapshot-tested, and renders
      cross-client-clean. Revisit if we add a second template
      (e.g. M3 launch announcement) — at that point the React
      Email composition story pays off.
- [x] Plain, on-brand, < 50 lines. Subject (sent from the route
      handler in `routes/waitlist.ts`): "Confirm your spot on the
      harpapro.com waitlist". CTA button:
      `${WAITLIST_CONFIRM_BASE_URL}?token=${token}`
      (defaults to `https://harpapro.com/confirm`).
- [x] Snapshot test of rendered HTML + text in
      `packages/api/src/__tests__/emails/waitlist-confirmation.test.ts`
      (also asserts no `<script>` / `onerror=` injection paths and
      that the confirmUrl appears in exactly the two expected slots).
- [x] Commit: `feat(api): waitlist confirmation email template + snapshot`.

### M1.6 `GET /admin/waitlist.csv`
- [x] Added `is_admin boolean NOT NULL DEFAULT false` to `auth.users`
      via migration `202605130003_admin_role.sql`. Drizzle schema
      mirror in `packages/api/src/db/schema.ts`. (JWT claims stay
      minimal — only `sub` + `sid` — and the middleware re-checks
      `is_admin` against the DB on every admin request, so revoking
      admin doesn't require the user to log out.)
- [x] `withAdmin()` middleware in
      `packages/api/src/middleware/admin.ts`: bearer JWT (via
      `withAuth`) + `auth.users.is_admin = true`. 401 on missing
      bearer; 403 on non-admin.
- [x] Streamed CSV via `hono/streaming`: header row flushed first,
      then row-by-row from a dedicated pool connection. Columns:
      `id, email, company, role, source, confirmed_at, created_at`,
      ordered by `created_at`. Proper RFC 4180 escaping for commas,
      quotes, and newlines in optional fields.
- [x] Response headers: `Content-Type: text/csv; charset=utf-8`,
      `Content-Disposition: attachment; filename="waitlist.csv"`,
      `Cache-Control: no-store`.
- [x] Scope test: anonymous → 401, non-admin → 403, admin → 200 with
      rows in created_at order; CSV-escaping test for hostile values;
      empty-table returns header only. 5 cases in
      `packages/api/src/__tests__/admin-waitlist.integration.test.ts`.
- [x] Commit: `feat(api): admin waitlist CSV export`.

### M1.7 Marketing-site form (React island)
- [x] Installed `@marsidev/react-turnstile` (~3 KB, well-maintained
      wrapper around the Cloudflare widget). Skipped
      `react-hook-form` / `@hookform/resolvers` — the form has 4
      fields, all server-validated; a controlled `useState` form is
      ~30 lines less code and one less dep. Server-side Zod (in
      `@harpa/api-contract`) is the source of truth for validation.
- [x] Created `apps/marketing/src/components/landing/WaitlistFormIsland.tsx`
      — React 19, mounted via `client:only="react"` (the Turnstile
      widget touches browser globals on module init, so SSR is
      impossible). An Astro fallback slot covers the pre-hydration
      flash.
- [x] Centralised env access in `apps/marketing/src/lib/env.ts`
      (`PUBLIC_API_BASE_URL`, `PUBLIC_TURNSTILE_SITE_KEY`). Defaults
      to `https://api.harpapro.com` + Cloudflare's always-passes test
      key (`1x00000000000000000000AA`) so `pnpm dev` works with no
      `.env` file.
- [x] Cloudflare Turnstile widget reads the site key from env.
      Tokens are single-use — we reset the widget after any failure
      so a retry gets a fresh token.
- [x] States: idle / submitting / success / error. Success replaces
      the form with "Check your inbox" copy and a 7-day hint. Error
      surfaces as an `role="alert"` paragraph; 429 gets a specific
      "Too many requests from your network" message so users on
      shared networks understand the back-off.
- [x] Posts to `${apiBaseUrl}/waitlist` (no proxy; CORS direct).
- [x] Build verified: `pnpm --filter @harpa/marketing build` ships
      a ~58 KB gzipped client bundle (React + Turnstile + island).
      Above-the-fold pages remain zero-JS — the form chunk is
      lazy-loaded.
- [x] Added `apps/marketing/.env.example` documenting the two
      `PUBLIC_*` vars + the always-passes Turnstile test key.
- [x] Unit test on `getPublicEnv()` defaults; the heavier
      behavioural assertions live on the API side
      (`waitlist.integration.test.ts`) where they belong.
- [x] Commit: `feat(marketing): waitlist form island`.

### M1.8 CORS config in Hono
- [x] Added `hono/cors` middleware in `packages/api/src/app.ts`,
      scoped to both `/waitlist` and `/waitlist/*` (the pattern
      `'/waitlist/*'` doesn't match `'/waitlist'` itself in Hono, so
      both are registered explicitly).
- [x] Allowlist driven by env var `WAITLIST_CORS_ORIGINS`
      (comma-separated). Default:
      `https://harpapro.com,https://www.harpapro.com,http://localhost:3002`.
      Unknown origins receive no `Access-Control-Allow-Origin` header
      (the response goes through but the browser rejects it).
- [x] `allowMethods: ['POST', 'OPTIONS']`, `allowHeaders:
      ['Content-Type']`, `credentials: false`, `maxAge: 86400`.
- [x] Integration tests (6): preflight from prod origin allowed,
      preflight from localhost:3002 allowed, preflight from unknown
      origin blocked, actual POST includes ACAO, CORS applies to
      `/waitlist/confirm`, CORS does NOT apply to `/healthz`.
- [x] Commit: `feat(api): cors for waitlist routes`.

### M1.9 Resend domain setup
- [x] Wrote operator runbook
      [`docs/marketing/ops-email.md`](./ops-email.md): six-step
      checklist covering Resend domain add, Cloudflare DNS records
      (SPF / DKIM / DMARC, all DNS-only / gray cloud), Fly secrets
      (`RESEND_API_KEY`, `RESEND_LIVE=1`, optional
      `WAITLIST_FROM_EMAIL`), 4-inbox deliverability smoke test,
      post-launch DMARC hardening path
      (`p=none` → `quarantine` → `reject`), and rollback.
- [ ] **Operator action required** before launch: actually verify
      `harpapro.com` in Resend, add the records, set the Fly
      secrets, and run the four-inbox deliverability test. Once
      done, the API can flip `RESEND_LIVE=1`.
- [x] Commit: `docs(marketing): resend domain setup`.

### M1.10 M1 exit
- [x] Integration tests green: full API integration suite =
      **22 files, 171 tests passed** (waitlist scope, waitlist
      handlers + dedupe + rate-limit + Turnstile + idempotent
      confirm, CORS, admin CSV). Unit suite = 136 tests passed.
      api-contract = 14 tests. Marketing = 5 tests. Marketing
      build clean.
- [x] Quality gates: `check-spec-drift.sh`, `check-no-supabase.sh`,
      `check-no-unistyles.sh` all green; working tree clean.
- [ ] Form works end-to-end on preview deploy. **(Operator action:
      deploy `apps/marketing` to Cloudflare Pages preview with
      `PUBLIC_API_BASE_URL=https://api.harpapro.com` +
      `PUBLIC_TURNSTILE_SITE_KEY` set, then submit a real signup.
      Code-side is complete and tested.)**
- [ ] Email lands in inbox (not spam). **(Operator action — see
      M1.9 step 5: four-inbox deliverability smoke test once Resend
      domain is verified and `RESEND_LIVE=1` is set.)**
- [x] Tag `v0.2.0-marketing`.

## Out of scope for M1
- Voice demo (M2).
- Drip campaigns — confirmation only at launch.
- Admin UI for browsing signups — CSV export only.
