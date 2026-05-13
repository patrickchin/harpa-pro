# M1 — Waitlist

Goal: a working, double-opt-in waitlist with the data stored in Neon,
protected by Turnstile, with a confirmation email and an admin CSV
export.

## Exit gate
- [x] `waitlist_signups` table + migration + per-request scope test
      (anonymous can `INSERT` only, no `SELECT`/`UPDATE`/`DELETE`).
- [ ] `POST /waitlist` Hono route (rate-limited, Turnstile-verified,
      idempotent).
- [ ] `POST /waitlist/confirm` route (one-time token, idempotent,
      constant-time compare).
- [ ] `GET /admin/waitlist.csv` (better-auth admin role gated).
- [ ] Resend domain verified; confirmation email sends via React
      Email template.
- [ ] Marketing-site React island: working form with success/error
      states, Turnstile widget, optimistic UX, posts directly to
      `api.harpapro.com` with CORS.
- [ ] Integration tests against Testcontainers Postgres (insert,
      confirm, dedupe).
- [ ] Spec drift gate green (`openapi.json` regenerated, contract
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
- [ ] Verify Turnstile token server-side
      (`https://challenges.cloudflare.com/turnstile/v0/siteverify`).
- [ ] Rate-limit budget: 5 / IP / hour, 50 / IP / day (existing
      `RateLimiter` interface from P1).
- [ ] Dedupe on `email` (upsert): re-sending always sends a fresh
      confirm email if not yet confirmed, but doesn't reset
      `created_at`.
- [ ] Generate `confirm_token` (32 bytes hex via `crypto.randomBytes`),
      store `confirm_token_hash` (sha256) only.
- [ ] Set `confirm_token_expires_at` to 7 days from now.
- [ ] Enqueue confirmation email via Resend.
- [ ] Return 202 with a neutral message: "If that email address is
      valid, we've sent you a confirmation link." (never reveal
      whether the email already existed — prevents enumeration).
- [ ] Tests: happy path, dedupe, Turnstile fail, rate-limit hit,
      disposable email rejected.
- [ ] Commit: `feat(api): POST /waitlist with turnstile + resend`.

### M1.4 `POST /waitlist/confirm`
- [ ] Look up by `confirm_token_hash` (constant-time compare via
      `crypto.timingSafeEqual`).
- [ ] Expire after 7 days (check `confirm_token_expires_at`).
- [ ] Set `confirmed_at` if null.
- [ ] Idempotent: confirming twice returns 200, not 4xx.
- [ ] Tests: happy, expired, bad token, double-confirm.
- [ ] Commit: `feat(api): POST /waitlist/confirm`.

### M1.5 Confirmation email template
- [ ] Create `packages/api/src/emails/waitlist-confirmation.tsx` (or
      separate `packages/email` workspace if we anticipate many
      templates).
- [ ] Use `@react-email/components` → rendered to HTML + text at
      send time via `render(WaitlistConfirmation({ token }))`.
- [ ] Plain, on-brand, < 50 lines. Subject: "Confirm your spot on
      the harpapro.com waitlist". CTA button:
      `https://harpapro.com/confirm?token=${token}`.
- [ ] Snapshot test of rendered HTML (`packages/api/src/__tests__/emails/waitlist.test.ts`).
- [ ] Commit: `feat(api): waitlist confirmation email template`.

### M1.6 `GET /admin/waitlist.csv`
- [ ] Extend better-auth middleware to check for `role=admin` in JWT
      claims (add `admin` boolean to `users` table if not already
      there).
- [ ] Stream CSV (don't buffer entire result set); columns: email,
      company, role, source, confirmed_at, created_at.
- [ ] Scope test: non-admin gets 403.
- [ ] Commit: `feat(api): admin waitlist CSV export`.

### M1.7 Marketing-site form (React island)
- [ ] Install `react-hook-form`, `@hookform/resolvers`, `zod`,
      `@marsidev/react-turnstile` in `apps/marketing`.
- [ ] Create `apps/marketing/src/components/WaitlistForm.tsx` —
      React 19, `client:visible` directive in Astro.
- [ ] Import `waitlistSignupRequestSchema` from
      `@harpa/api-contract`.
- [ ] Cloudflare Turnstile widget (site key in
      `import.meta.env.PUBLIC_TURNSTILE_SITE_KEY`).
- [ ] States: idle / submitting / success / error. Success message:
      "Check your inbox for a confirmation link." Error message:
      "Something went wrong. Please try again."
- [ ] Post to `https://api.harpapro.com/waitlist` (no proxy; direct
      CORS call).
- [ ] Commit: `feat(marketing): waitlist form island`.

### M1.8 CORS config in Hono
- [ ] Add `@hono/cors` middleware to `packages/api/src/app.ts` for
      `/waitlist` and `/waitlist/confirm` routes:
      ```ts
      app.use('/waitlist/*', cors({
        origin: ['https://harpapro.com', 'http://localhost:3002'],
        allowMethods: ['POST'],
        credentials: false,
      }));
      ```
- [ ] Commit: `feat(api): cors for waitlist routes`.

### M1.9 Resend domain setup
- [ ] Verify `harpapro.com` sending domain in Resend dashboard.
- [ ] Add DKIM / SPF / DMARC records on Cloudflare DNS.
- [ ] Test deliverability to Gmail, Outlook, ProtonMail, iCloud.
- [ ] Document in `docs/marketing/ops-email.md`.
- [ ] Commit: `docs(marketing): resend domain setup`.

### M1.10 M1 exit
- [ ] Integration tests green (waitlist insert, confirm, dedupe,
      rate-limit, Turnstile).
- [ ] Form works end-to-end on preview deploy.
- [ ] Email lands in inbox (not spam).
- [ ] Tag `v0.2.0-marketing`.

## Out of scope for M1
- Voice demo (M2).
- Drip campaigns — confirmation only at launch.
- Admin UI for browsing signups — CSV export only.
