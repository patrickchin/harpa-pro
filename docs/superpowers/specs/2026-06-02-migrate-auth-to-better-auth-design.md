# Design: Rip-and-replace auth with better-auth (email-OTP)

**Date:** 2026-06-02 (rev 2)
**Branch:** `agents/migrate-auth-to-better-auth`
**Status:** Ready for implementation
**Related docs:** `docs/v4/arch-auth-and-rls.md` (rewritten by this spec),
`docs/v4/pitfalls.md`

---

## Context

The current auth system is hand-rolled phone-OTP via Twilio Verify
(`packages/api/src/auth/`). `arch-auth-and-rls.md` previously stated:

> "We deliberately did NOT adopt `better-auth` — its abstractions add
> complexity we don't need."

This spec **reverses that decision**, for these reasons:

- **Email-OTP, not SMS-OTP**, is now the desired primary path. SMS
  costs money in production; email via Resend (already wired for the
  waitlist) is free and adequate for our threat model.
- **SIWA + Google Sign-In are next**. Better-auth ships those as
  first-class providers. Hand-rolling Apple's nonce/JWT validation
  and Google's OIDC flow is a non-trivial amount of work compared
  with adopting an auth library that already does it.
- **No production users yet.** The migration cost is purely code +
  schema; we can wipe the DB.

Given the policy reversal, **`docs/v4/arch-auth-and-rls.md` is rewritten
in this spec** — the old "we deliberately did NOT adopt better-auth"
paragraph is removed, and the new doc reflects better-auth as the
adopted auth framework.

This is a **rip-and-replace**, not a patch: the old `auth/jwt.ts`,
`auth/twilio.ts`, `auth/password.ts`, `auth/service.ts`,
`routes/auth.ts`, plus all phone-related code on the mobile side, are
deleted. We do not keep two auth systems running side-by-side.

Goals:

1. Replace phone-OTP with **email-OTP** via better-auth's `emailOTP`
   plugin (Resend as transport).
2. Standardize on better-auth idioms — its data model, its handler
   mount, its session API — instead of bolting it on to our existing
   `withAuth` shape.
3. Keep the **per-request DB scope** (`withScopedConnection`) and
   **RLS on `app.*` tables** unchanged — that defence-in-depth layer
   is independent of which library issues sessions.
4. Preserve a **test-account password bypass** for live-deploy smoke
   tests, expressed in better-auth idioms (email + password gated by
   a Doppler-only allowlist).
5. Leave the door open for SIWA, Google, and account deletion
   (`DELETE /me`) as follow-on specs.

---

## Decisions log

The questions raised during review and the answers we're locking in.

| # | Question | Decision |
|---|---|---|
| 1 | Adopt better-auth despite previous policy? | **Yes.** Rewrite `arch-auth-and-rls.md`. |
| 2 | Migrate or wipe the DB? | **Wipe.** No users; one fresh migration drops `auth.*` and adds better-auth tables in `public`. |
| 3 | Keep custom `usr_…` ID format on user IDs? | **Yes**, by minting slug IDs via better-auth's `advanced.database.generateId({model})` callback (its documented public extension point). Better-auth tables use bare `text` IDs (no `app.usr_id` domain) — the slug format is enforced at write time by `generateId`, not by a DB CHECK. App tables keep their `app.usr_id` domain unchanged; FK from `app.* → public.user(id)` is text-to-text and works fine. **No hand-authored Drizzle schema** — we let `@better-auth/cli generate` produce `db/auth-schema.ts` and treat it as a generated artefact. |
| 4 | Keep `auth` Postgres schema separate from `public`? | **Drop it.** Better-auth tables go in `public`. Logical separation is preserved at table-name level (`user`, `session`, `account`, `verification` vs `app.projects`, `app.notes`, …). Avoids hand-editing every CLI regen and aligns with better-auth defaults. |
| 5 | Keep phone-OTP alongside email-OTP? | **No.** Email-OTP only. Twilio + phone code is fully removed. Phone reinstatement is a future spec if needed. |
| 6 | Keep test-account password login? | **Yes**, but in better-auth idioms: enable `emailAndPassword` with `disableSignUp: true`, then a `databaseHooks.user.before` (or signIn ctx hook) rejects any email not in `TEST_ACCOUNT_EMAILS`. |
| 11 | Is RLS still needed? | **Yes for `app.*`.** No for better-auth tables (better-auth queries with the unscoped pool by design — RLS would block its own session lookup). The `users_self_*` policies are dropped because the only app-code reader of `auth.users` was `/me`, which is rewritten to use `auth.api.getSession()`. |

---

## What is changing vs. staying

### Deleted

- `packages/api/src/auth/jwt.ts`, `auth/twilio.ts`, `auth/password.ts`,
  `auth/service.ts`
- `packages/api/src/routes/auth.ts` and its integration tests
  (`auth.integration.test.ts`, `journeys/_login.ts`,
  `auth-password.journey.integration.test.ts`)
- `packages/api/src/db/schema.ts` auth section (users, sessions,
  verifications) — replaced by CLI-generated `db/auth-schema.ts`
- `apps/mobile/lib/phone/*`, `lib/auth/use-otp-resend.ts`,
  `lib/auth/login-phone-hint.ts`, `lib/auth/remembered-login.ts`
  (re-evaluated below — kept as a simple email-remember if the UX
  still wants it)
- `apps/mobile/app/(auth)/sign-in/{phone,verify}.tsx`,
  `app/(auth)/sign-up/{phone,verify}.tsx`,
  `app/(auth)/e2e-password-login.tsx`
- `apps/mobile/screens/auth-phone.tsx`
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_VERIFY_SID`, `TWILIO_LIVE`, `TWILIO_VERIFY_FAKE_CODE`,
  `TEST_ACCOUNT_PHONES`, `TEST_ACCOUNT_PASSWORD`
- All phone-shaped types in `packages/api-contract`
- The `auth` Postgres schema (drops + recreates with no `auth.*`
  tables — see migration section)

### Replaced

| Old | New |
|---|---|
| `auth.users` (in `auth` schema) | `public.user` (better-auth, CLI-generated Drizzle schema, bare `text` IDs minted as `usr_…` slugs by `generateId`) |
| `auth.sessions` | `public.session` (uses `app.ses_id` domain) |
| `auth.verifications` | `public.verification` (better-auth-managed) |
| — | `public.account` (better-auth, used by SIWA/Google in next spec) |
| `POST /auth/otp/start` + `/auth/otp/verify` | `POST /api/auth/email-otp/send-verification-otp` + `/api/auth/sign-in/email-otp` (better-auth handler) |
| `POST /auth/password/verify` | `POST /api/auth/sign-in/email` (better-auth `emailAndPassword`, gated by `TEST_ACCOUNT_EMAILS` allowlist hook) |
| `POST /auth/logout` | `POST /api/auth/sign-out` |
| Hand-rolled JWT in `Authorization: Bearer …` | better-auth session token in `Authorization: Bearer …` (via `expoClient` storing token in SecureStore) |

### Staying unchanged

- **`packages/api/src/db/scope.ts` — `withScopedConnection`** receives
  `(userId, sessionId)` from middleware. Signature unchanged.
- **All `app.*` RLS policies** — they read
  `current_setting('app.user_id')` and don't care which library
  issued the JWT.
- **All protected routes** (`/projects`, `/notes`, `/files`,
  `/reports`, `/me`, `/settings`, …) — they read `c.get('userId')`
  via the `db` accessor, exactly as today.
- **`apps/mobile/lib/auth/auth-gate.ts`** — `decideAuthRedirect`
  logic unchanged (still maps `displayName == null` → onboarding).
- **`apps/mobile/lib/auth/session.tsx`** — public hook surface
  (`useAuthSession()` returning `{status, user, refresh}`) preserved;
  internals swap from manual JWT decode + AsyncStorage to
  `authClient.useSession()`.
- **Onboarding screen, account screen, waitlist Resend usage** —
  no change.
- **`packages/api/src/db/scope.ts` SQL** — `SET LOCAL role …`,
  `SET LOCAL app.user_id …` unchanged. The values come from
  better-auth instead of our verifyJwt, but the SQL layer is identical.

### FK-impact list (all renumbered to `public.user(id)`)

The repo currently has these FKs referencing `auth.users(id)` (grep
result against migrations):

- `app.projects.owner_id` (0001)
- `app.project_members.user_id` (0001)
- `app.user_settings.user_id` (0001)
- `app.files.owner_id` (0001)
- `app.usage_overrides.user_id`, `app.usage_overrides.granted_by` (0006)
- `auth.sessions.user_id` (0001 — table itself goes away)

Plus these phone-coupled SQL functions defined in 0001 + 0002:

- `app.invite_member_by_phone(p_project_id, p_phone, p_role)` —
  rename to `app.invite_member_by_email(p_project_id, p_email, p_role)`,
  query by `u.email` instead of `u.phone`.
- `app.list_project_members(p_project_id)` returns `phone` —
  change return shape to return `email` instead. Updates required in
  `packages/api-contract` and any mobile code that displays the
  invite list.

These are part of the migration; not a follow-on spec.

---

## Architecture

```
            ┌──────────────────────────────────────────────────────┐
            │                  Mobile (Expo)                       │
            │  @better-auth/expo client (expoClient + emailOTP)    │
            │  authClient.emailOtp.sendVerificationOtp({email,     │
            │                                  type: 'sign-in'})   │
            │  authClient.signIn.emailOtp({email, otp})            │
            │  Authorization: Bearer <token> (stored in SecureStore│
            │                                  by expoClient)      │
            └──────────────────────────────────────────────────────┘
                              ▲
                              │  /api/auth/**  (better-auth handler)
            ┌─────────────────────────────────────────────────────┐
            │              Hono API (packages/api)                │
            │                                                     │
            │  app.on(['GET','POST'], '/api/auth/**',             │
            │    c => auth.handler(c.req.raw))                    │
            │                                                     │
            │  withAuth() middleware (rewritten):                 │
            │    auth.api.getSession({headers}) → {user,session}  │
            │    c.set('userId', user.id)                         │
            │    c.set('sessionId', session.id)                   │
            │    c.set('db', fn => withScopedConnection(...))     │
            └─────────────────────────────────────────────────────┘
                              ▲
                              │ Drizzle adapter + Resend
                              ▼
            ┌─────────────────────────┐    ┌─────────────────────┐
            │   Postgres (Neon)       │    │  Resend API         │
            │   public.user           │    │  (sign-in OTP email)│
            │   public.session        │    └─────────────────────┘
            │   public.verification   │
            │   public.account        │  ← used by SIWA / Google
            │   app.* (unchanged,     │     in next specs
            │          RLS enforced)  │
            └─────────────────────────┘
```

### Where better-auth fits relative to per-request scope

Better-auth's adapter must use the **unscoped** Postgres connection,
because it needs to read the session row before it knows which user
to scope to. This means:

- Better-auth queries do **not** go through `withScopedConnection`.
- We **do not enable RLS on `public.user/session/verification/account`** —
  doing so would block better-auth's own session lookups.
- The defence-in-depth claim shifts: cross-user reads of `auth.user`
  must not happen from app code at all. The only remaining reader of
  the user row from app code is `/me`, which we rewrite to use
  `auth.api.getSession()` (better-auth's session API returns the user
  alongside the session). No raw `db.select().from(user)…` in the
  routes layer.
- An ESLint `no-restricted-imports` rule prevents importing the
  better-auth Drizzle schema (`db/auth-schema`) from anywhere except
  `auth/auth.ts`. That keeps app code from accidentally leaking
  cross-user reads.

`app.*` RLS is unchanged: every authenticated request still flows
through `withScopedConnection`, which sets `role app_authenticated`
and `app.user_id`. Anything going through `c.get('db')(fn)` is
RLS-enforced exactly as before.

---

## better-auth server config

Location: `packages/api/src/auth/auth.ts` (new file)

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { rawDb } from '../db/client.js';
import * as authSchema from '../db/auth-schema.js'; // CLI-generated
import { env } from '../env.js';
import { resend } from '../lib/resend.js';
import { newId } from '../lib/ids.js';

const TEST_EMAILS = (env.TEST_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(rawDb(), { provider: 'pg', schema: authSchema }),

  trustedOrigins: [
    'harpa://',
    'harpa://*',
    ...(env.NODE_ENV === 'development'
      ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
      : []),
  ],

  advanced: {
    // Custom slug IDs aligned with the rest of the codebase.
    database: {
      generateId: ({ model }) => {
        if (model === 'user') return newId('usr');
        if (model === 'session') return newId('ses');
        if (model === 'verification') return newId('vrf');
        if (model === 'account') return newId('idn');
        return crypto.randomUUID(); // future plugin tables
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 days, matches old TTL
    updateAge: 60 * 60 * 24,        // refresh once per day on use
  },

  user: {
    additionalFields: {
      displayName: { type: 'string',  required: false, defaultValue: null },
      companyName: { type: 'string',  required: false, defaultValue: null },
      isAdmin:     { type: 'boolean', required: false, defaultValue: false, input: false },
      plan:        { type: 'string',  required: false, defaultValue: 'free', input: false },
    },
  },

  // Test-account bypass: emailAndPassword is enabled but ONLY allowlisted
  // emails can ever sign in via password. Production prod sets the
  // allowlist to empty, which makes every password attempt 401.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,    // password sign-up is closed; allowlisted accounts are seeded
    autoSignIn: false,
  },

  databaseHooks: {
    user: {
      // Belt-and-braces: fail loudly if anything tries to create a
      // password user outside the seed script. The seed script
      // bypasses this hook by using auth.api.signUpEmail with an
      // override flag — see `scripts/seed-test-account.ts`.
      create: {
        before: async (user, ctx) => {
          if (ctx?.context?.path === '/api/auth/sign-up/email') {
            throw new Error('sign-up disabled');
          }
        },
      },
    },
  },

  hooks: {
    // Block any /api/auth/sign-in/email request whose body.email is
    // not in the Doppler-only TEST_ACCOUNT_EMAILS allowlist. Times-out
    // the password compare regardless to defeat enumeration timing.
    before: createBeforeHook((ctx) => {
      if (ctx.path !== '/api/auth/sign-in/email') return;
      const email = String(ctx.body?.email ?? '').toLowerCase();
      if (TEST_EMAILS.length === 0 || !TEST_EMAILS.includes(email)) {
        // 401 with the same shape better-auth emits on bad password,
        // so allow-list membership doesn't leak.
        throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' });
      }
      ctx.context.logger?.info({
        msg: 'test_account_password_login_attempt',
        email,
      });
    }),
  },

  plugins: [
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,         // 10 min
      allowedAttempts: 5,
      disableSignUp: false,       // first verify creates the user
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (env.EMAIL_OTP_LIVE !== '1') {
          // Fake mode: do not send. The fake code is enforced by a
          // separate test/dev path that pre-seeds the verification row.
          // See "Mock builds" below.
          ctx.logger?.warn({ msg: 'email_otp_fake_mode', email, type });
          return;
        }
        await resend.emails.send({
          from: 'noreply@harpapro.com',
          to: email,
          subject: 'Your sign-in code',
          text: `Your code is: ${otp}\n\nIt expires in 10 minutes.`,
        });
      },
    }),
  ],
});

export type Auth = typeof auth;
```

Notes on the config above:

- **`@better-auth/drizzle-adapter`** is the correct package; the docs
  show this import and the bare-Drizzle one — we use the adapter.
- **`expo()`** plugin handles `trustedOrigins` and the `Authorization`
  bearer flow that the Expo client expects.
- **`advanced.database.generateId`** is the correct path (the original
  spec had `advanced.generateId` which is incorrect).
- **`@better-auth/expo` is NOT a separate package on npm under a single
  scope** — it's installed alongside `better-auth` and consumed both
  on the server (`expo()` plugin) and on the client (`expoClient` from
  `@better-auth/expo/client`).

### Why `emailAndPassword` is enabled in production at all

Because better-auth's password sign-in is gated by both:

1. The empty `TEST_ACCOUNT_EMAILS` env var on `prd` → every request
   401s before reaching the password compare.
2. `disableSignUp: true` → no one can create new password users via
   the public endpoint.

The bypass is therefore code-disabled by default and re-enabled only
by adding a Doppler-only env var on `dev`. Same operating model as
the current `TEST_ACCOUNT_PHONES` + `TEST_ACCOUNT_PASSWORD` posture,
expressed in better-auth idioms.

Env-Zod refines this both-or-neither rule:

```ts
.refine(
  (e) => (e.NODE_ENV !== 'production') || !e.TEST_ACCOUNT_EMAILS,
  { path: ['TEST_ACCOUNT_EMAILS'],
    message: 'TEST_ACCOUNT_EMAILS must be unset on production' })
```

---

## Drizzle schema (CLI-generated)

Location: `packages/api/src/db/auth-schema.ts` (generated by `@better-auth/cli generate`, committed)

We let the better-auth CLI emit this file rather than hand-authoring
it. Rationale:

1. **Less bug-prone.** Better-auth's core schema has ~25 columns
   across 4 tables, plus per-plugin extensions. Re-typing it by hand
   is exactly the kind of work that produces "missed a column,
   feature silently broken" bugs.
2. **Stays in sync as plugins evolve.** Adding a future plugin
   (passkeys, magic link, organizations…) is `pnpm exec @better-auth/cli
   generate` → check the diff → migrate. No archaeology in the
   better-auth source tree to figure out what columns we missed.
3. **Custom IDs don't require column-type customisation.** Better-auth
   IDs are `text` by default. Our `usr_…` slug format is enforced at
   write-time by `advanced.database.generateId({model})` (a documented
   public API — see server config above), not by a Postgres `CHECK`.
   Net effect: `public.user.id` is `text` containing `usr_abc123…`,
   `public.session.id` is `text` containing `ses_def456…`, and so on.
   The slug regex isn't checked by the DB on better-auth's tables,
   but it is checked by `app.usr_id` domain when a value crosses
   into `app.*` (e.g. `INSERT INTO app.project_members (user_id, …)`).
   So invalid IDs would surface at the FK boundary on first use.

### Treating it as generated

- **Re-run** `pnpm exec @better-auth/cli generate --output packages/api/src/db/auth-schema.ts`
  whenever we add or remove a better-auth plugin.
- **Commit** the output. CI verifies the file is up to date by
  re-running the generator and `git diff --exit-code` (added to
  `scripts/check-generated.sh`).
- **Do not edit by hand.** If we need additional columns (e.g. for
  our `additionalFields` like `displayName`, `companyName`, `isAdmin`,
  `plan`), declare them via `betterAuth({user: {additionalFields:...}})`
  and re-run the CLI — the CLI reads our auth config and emits the
  expanded schema.

### FK from app.* → public.user

`app.projects.owner_id` is declared as `app.usr_id` (text + slug
regex). `public.user.id` is plain `text`. Postgres compares FK
values by type-equivalence — `app.usr_id` is `text` underneath, so
the FK works. The slug constraint is enforced one-way: any value
that lands in `app.usr_id` (i.e. anything we read out of `user.id`
and use to write into `app.*`) must match the regex, or the INSERT
fails. Since `generateId` always produces `usr_…`, this is a
correctness check, not a usability barrier.

### ID prefixes added to `packages/api/src/lib/ids.ts`

Confirm/add these prefixes (existing ones may already be defined):

- `usr` — better-auth `user.id`
- `ses` — better-auth `session.id`
- `vrf` — better-auth `verification.id`
- `idn` — better-auth `account.id` (new)

`generateId` in the auth config maps `model: 'user' → 'usr'`,
`'session' → 'ses'`, `'verification' → 'vrf'`, `'account' → 'idn'`.
Any other model (future plugin) falls back to `crypto.randomUUID()`
to avoid silently writing rows without our slug format — visible in
logs on first use.

---

## Database migration

Location: `packages/api/migrations/0014_better_auth_init.sql`

Approach: **single migration, drops the entire `auth` schema and
recreates the four better-auth tables in `public`, plus re-points all
app FKs at `public.user(id)`.**

Pseudo-structure:

```sql
-- 0014_better_auth_init.sql

BEGIN;

-- 1. Drop FKs from app tables that pointed at auth.users.
--    (Each ALTER TABLE ... DROP CONSTRAINT IF EXISTS for the FKs
--     listed in the FK-impact section above.)

ALTER TABLE app.projects         DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE app.project_members  DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
ALTER TABLE app.user_settings    DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey;
ALTER TABLE app.files            DROP CONSTRAINT IF EXISTS files_owner_id_fkey;
ALTER TABLE app.usage_overrides  DROP CONSTRAINT IF EXISTS usage_overrides_user_id_fkey;
ALTER TABLE app.usage_overrides  DROP CONSTRAINT IF EXISTS usage_overrides_granted_by_fkey;

-- 2. Drop phone-coupled functions and the auth schema entirely.
DROP FUNCTION IF EXISTS app.invite_member_by_phone(app.prj_id, varchar, app.member_role);
DROP FUNCTION IF EXISTS app.list_project_members(app.prj_id);
DROP SCHEMA IF EXISTS auth CASCADE;

-- 3. Create better-auth tables in public. Column list comes from
--    @better-auth/cli generate output (db/auth-schema.ts) — keep this
--    SQL in lock-step with that file. IDs are bare text; the slug
--    format is enforced by generateId at write time, not by a CHECK.
CREATE TABLE public."user" (
  id              text PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  name            text,
  image           text,
  display_name    text,
  company_name    text,
  is_admin        boolean NOT NULL DEFAULT false,
  plan            text NOT NULL DEFAULT 'free',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."session" (...);
CREATE TABLE public."account" (...);
CREATE TABLE public."verification" (...);

-- RLS on public.user is added in step 7 below.
-- No RLS on session/account/verification — better-auth's adapter
-- uses the unscoped pool, and these tables are never accessed from
-- app code through the scoped role.

-- 4. Re-add FKs from app.* tables to public.user(id).
ALTER TABLE app.projects
  ADD CONSTRAINT projects_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.project_members
  ADD CONSTRAINT project_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.files
  ADD CONSTRAINT files_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.usage_overrides
  ADD CONSTRAINT usage_overrides_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.usage_overrides
  ADD CONSTRAINT usage_overrides_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

-- 5. Recreate invite-by-email + list_project_members against public.user.
CREATE OR REPLACE FUNCTION app.invite_member_by_email(
  p_project_id app.prj_id, p_email text, p_role app.member_role)
RETURNS TABLE (...) LANGUAGE plpgsql ... AS $$
  ...
  SELECT u.id INTO v_target FROM public."user" u WHERE lower(u.email) = lower(p_email);
  ...
$$;

CREATE OR REPLACE FUNCTION app.list_project_members(p_project_id app.prj_id)
RETURNS TABLE (user_id app.usr_id, display_name text, email text, role app.member_role, joined_at timestamptz)
LANGUAGE sql STABLE AS $$
  ...
  JOIN public."user" u ON u.id = pm.user_id
  ...
$$;

-- 6. Grants for app_authenticated to read its own row from public.user.
--    Same shape as the old auth.users grants — only display_name/
--    company_name are user-updatable; email/is_admin are read-only
--    from the app role's POV.
GRANT SELECT ON public."user" TO app_authenticated;
GRANT UPDATE (display_name, company_name, updated_at) ON public."user" TO app_authenticated;

-- 7. RLS on public.user — limits app_authenticated reads to the
--    caller's own row. Better-auth's adapter uses the unscoped role
--    and bypasses these policies. Without this, a stray
--    `db.select().from(user)` in a route handler would leak the
--    entire user table.
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_self_read ON public."user"
  FOR SELECT TO app_authenticated
  USING (id = current_setting('app.user_id'));
CREATE POLICY user_self_update ON public."user"
  FOR UPDATE TO app_authenticated
  USING      (id = current_setting('app.user_id'))
  WITH CHECK (id = current_setting('app.user_id'));

-- No RLS on public.session, public.account, public.verification —
-- they are only ever accessed via the unscoped pool by better-auth.

COMMIT;
```

**No `IF NOT EXISTS` on the table creates.** This migration is the
sole owner of these tables — if it runs twice it should fail loudly.

**Drizzle migration ordering:** the better-auth adapter is configured
to point at the same Drizzle schema (`db/auth-schema.ts`, CLI-generated)
that this migration creates the tables for, so `pnpm drizzle-kit migrate`
against the migrations directory is the single command. We do **not**
run `@better-auth/cli migrate` — our Drizzle migrations are the source
of truth for the SQL. The CLI is only used to keep `auth-schema.ts`
(the TypeScript shape) up to date.

Naming check: latest migration is `0013_notes_changed_at.sql`. New file
is `0014_better_auth_init.sql`. `scripts/check-migration-numbering.sh`
must pass.

---

## API changes

### Mounting the handler

`packages/api/src/app.ts`:

```ts
import { auth } from './auth/auth.js';

// Mount before route-level rate limiters so /api/auth/** uses
// better-auth's own rate limiting, not ours layered on top.
// (Better-auth has built-in rate limits per endpoint.)
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));
```

The old `/auth/*` mount is removed. Anything in the repo that calls
`/auth/...` (including `scripts/journeys/*.sh` which currently hit
`/auth/password/verify` and `/auth/logout`) is updated to the new
`/api/auth/...` paths in this same PR.

### `withAuth` middleware

`packages/api/src/middleware/auth.ts`:

```ts
import { auth } from '../auth/auth.js';

export function withAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user || !session?.session) {
      throw new HTTPException(401, { message: 'Unauthorized.' });
    }
    c.set('userId', session.user.id);
    c.set('sessionId', session.session.id);
    c.set('user', session.user);   // cached for /me etc.
    c.set('db', (fn) => withScopedConnection(
      { sub: session.user.id, sid: session.session.id }, fn,
    ));
    await next();
  };
}
```

`auth.api.getSession()` already validates the bearer token, looks up
the session row, and returns the user — so the explicit
`verifyJwt + DB session check` from the old middleware is replaced by
this single call.

### `/me` route

`GET /me` returns `{ user: { id, email, displayName, companyName, isAdmin, plan } }`.
No more `phone`. Implementation reads `c.get('user')` from the context
(set above) — no `db.select()` against `public.user`.

`PATCH /me` allows updating `displayName` and `companyName` — same as
today; uses `auth.api.updateUser({ headers, body })` rather than a
direct UPDATE. This keeps better-auth's session cache in sync.

### `packages/api-contract`

- Remove `phone` from `User` schema.
- Add `email`.
- Update `ProjectMember` shape: `phone` → `email`.
- Bump OpenAPI version (minor — additive `email`, breaking `phone`
  removal). Mobile is the only consumer; ship in same PR.

---

## Mobile changes

### Dependencies

```
pnpm --filter @harpa/mobile add @better-auth/expo expo-network
```

`expo-secure-store` is already present.

### Auth client

New file: `apps/mobile/lib/auth/client.ts`

```ts
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { env } from '@/lib/env';

export const authClient = createAuthClient({
  baseURL: `${env.EXPO_PUBLIC_API_URL}/api/auth`,
  plugins: [
    expoClient({
      scheme: 'harpa',         // matches apps/mobile/app.config.ts
      storagePrefix: 'harpa',
      storage: SecureStore,
    }),
    emailOTPClient(),
  ],
});
```

The `expoClient` plugin owns SecureStore-backed cookie/token storage.
We do **not** add the `bearer` plugin — `expoClient` handles bearer
header injection automatically.

### Session hook

`apps/mobile/lib/auth/session.tsx` is rewritten to wrap
`authClient.useSession()`:

```ts
export function useAuthSession(): AuthSession {
  const { data, isPending, refetch } = authClient.useSession();
  const status: SessionStatus =
    isPending ? 'loading' :
    !data?.user ? 'unauthenticated' :
    data.user.displayName == null ? 'needs-onboarding' :
    'authenticated';
  return {
    status,
    user: data?.user ?? null,
    refresh: async () => { await refetch(); },
  };
}
```

Public type contract unchanged. Internal `lib/auth/storage.ts`,
`remembered-login.ts`, `login-phone-hint.ts`, `use-otp-resend.ts` are
deleted — `expoClient` owns persistence; phone is gone; OTP resend
is just `authClient.emailOtp.sendVerificationOtp(...)` again.

### Auth screens

| Old | New |
|---|---|
| `(auth)/sign-in/phone.tsx` | `(auth)/sign-in/email.tsx` |
| `(auth)/sign-in/verify.tsx` | `(auth)/sign-in/code.tsx` |
| `(auth)/sign-up/phone.tsx` | deleted (sign-in creates the user on first verify) |
| `(auth)/sign-up/verify.tsx` | deleted |
| `(auth)/e2e-password-login.tsx` | `(auth)/e2e-password-login.tsx` (kept; switched to email + better-auth) |
| `screens/auth-phone.tsx` | `screens/auth-email.tsx` |

Flow:

1. User enters email →
   `authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })`.
2. User enters 6-digit code →
   `authClient.signIn.emailOtp({ email, otp })`.
3. `expoClient` stores the bearer token in SecureStore.
4. `useAuthSession` reflects `authenticated` (or `needs-onboarding` if
   `displayName == null`).

E2E password login screen calls
`authClient.signIn.email({ email, password })`, used by `:mock`/dev
builds wired against a `harpa-pro-api-dev` allowlisted account.

### `lib/api/hooks.ts`

Replaces `useStartOtpMutation` / `useVerifyOtpMutation` /
`useLogoutMutation` with thin wrappers around `authClient`:

```ts
export function useSendEmailOtpMutation() { ... }
export function useVerifyEmailOtpMutation() { ... }
export function useSignOutMutation() { ... }   // calls authClient.signOut()
```

---

## Test-account smoke-test path

This replaces the `/auth/password/verify` mechanism documented in
`arch-auth-and-rls.md §Test-account password bypass`.

**Mechanism:**

1. Doppler `dev` defines:
   - `TEST_ACCOUNT_EMAILS` — comma-separated allowlist
     (e.g. `e2e@harpapro.com`).
   - `TEST_ACCOUNT_PASSWORD` — shared password for those accounts
     (min 16 chars).
2. A one-shot seed script
   `packages/api/scripts/seed-test-account.ts` ensures each email in
   the list exists with that password (creates via better-auth's
   internal admin API; bypasses the `disableSignUp` guard
   intentionally because it runs as a deploy-time script, not over
   HTTP). Run on each `dev` deploy.
3. Production has both vars unset → seed script no-ops, the `before`
   hook 401s every password attempt regardless of email shape.
4. Journey scripts call:

   ```bash
   curl -X POST "$API/api/auth/sign-in/email" \
     -H 'Content-Type: application/json' \
     -d '{"email":"e2e@harpapro.com","password":"…"}'
   ```

   The response sets the session token in `set-cookie` (web shape)
   and returns a JSON body with `token`. The journey script extracts
   `token` and uses it in `Authorization: Bearer …` for subsequent
   requests, exactly as today.

5. Audit log: every successful password sign-in emits a
   `test_account_password_login` line via the `databaseHooks.session.create`
   after-hook, with `email` and `userId`.

**Why this is acceptable in a "rip and replace" approach:** the bypass
is operationally identical to today's posture (Doppler `dev` only,
audit-logged, allowlist-gated, rate-limited via better-auth's built-in
limiter on `/sign-in/email`). What changes is the **shape** —
better-auth idioms instead of a hand-rolled route — which is the
whole point of this migration.

**Pitfall 13 compliance:** the integration test for the password
flow exercises the **real** better-auth password compare and **real**
DB lookup. The before-hook is also tested with the allowlist set and
unset to confirm 401 vs success.

---

## Environment variables

### Remove from API

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SID
TWILIO_LIVE
TWILIO_VERIFY_FAKE_CODE
TEST_ACCOUNT_PHONES
```

### Repurpose

```
TEST_ACCOUNT_PASSWORD     # unchanged — same shared password, now applies to TEST_ACCOUNT_EMAILS
BETTER_AUTH_SECRET        # already exists — was used by old jwt.ts; now used by better-auth
BETTER_AUTH_URL           # already exists — base URL for better-auth handler
```

### Add

```
TEST_ACCOUNT_EMAILS       # comma-separated allowlist of test emails (Doppler dev only)
EMAIL_OTP_LIVE            # '1' = real Resend send; default '0' (logs only)
RESEND_API_KEY            # already used by waitlist; reuse for OTP. Confirm this var name.
```

### Env-Zod refines

- `TEST_ACCOUNT_EMAILS` and `TEST_ACCOUNT_PASSWORD` must be both-set
  or both-unset.
- `TEST_ACCOUNT_EMAILS` must be unset on `NODE_ENV=production`.
- `EMAIL_OTP_LIVE` must be `'1'` whenever `NODE_ENV=production` —
  fail boot otherwise. (Prevents the fake-mode-OTP-leak-in-prod
  scenario where a missing Doppler key would silently downgrade to
  fake mode.)

### Mobile

No changes. `EXPO_PUBLIC_API_URL` is the only auth-related mobile
env var and it stays.

### Doppler / Fly

Doppler `dev`: add `TEST_ACCOUNT_EMAILS`, `EMAIL_OTP_LIVE=0`, remove
the seven Twilio + `TEST_ACCOUNT_PHONES` keys.
Doppler `prd`: set `EMAIL_OTP_LIVE=1`, remove all Twilio +
test-account keys.
Fly secrets: pruned automatically on next CI deploy via
`flyctl secrets import` (see `arch-ops.md §CI`).

---

## Testing

### Integration (Vitest + Testcontainers)

`packages/api/src/__tests__/auth.integration.test.ts` is rewritten end
to end. Required cases:

```
describe('email-OTP sign-in (Pitfall 13: real Resend, intercepted)')
  test('sends OTP via real sendVerificationOTP path with live=1')
    — uses nock to intercept the Resend HTTPS request and assert payload;
      DOES NOT stub the sendVerificationOTP hook
  test('sign-in with correct OTP creates user + session, returns token')
  test('rejects wrong OTP')
  test('rejects expired OTP (advance fake clock past expiresIn)')
  test('rate limits after allowedAttempts')

describe('test-account password bypass')
  test('allowlisted email + correct password → 200 + session')
  test('non-allowlisted email returns 401 with same shape as wrong password')
  test('allowlisted email + wrong password → 401')
  test('with TEST_ACCOUNT_EMAILS unset → every email returns 401')
  test('disableSignUp prevents POST /api/auth/sign-up/email even for allowlisted')

describe('withAuth middleware')
  test('valid bearer token → routes see userId, sessionId, scoped db')
  test('missing bearer → 401')
  test('expired session → 401 (advance clock past expiresIn)')

describe('per-request scope (Pitfall 6 gate, unchanged)')
  test('actor A reads own project → 200')
  test('actor A cannot read actor B project → 404')
  test('negative-control: raw query without scope returns both → proves wrapper protects')

describe('app FK integrity post-migration')
  test('deleting a public.user cascades into app.projects.owner_id, app.project_members.user_id, etc.')
```

`scripts/check-scope-tests.sh` continues to enforce the negative
control on every authed route.

### Mock builds + Maestro E2E

For Maestro flows we need a deterministic OTP path. Approach:

- `:mock` builds set `EMAIL_OTP_LIVE=0` AND `EXPO_PUBLIC_E2E=1`.
- A small dev-only API endpoint `POST /api/dev/last-otp` (mounted
  ONLY when `NODE_ENV !== 'production'`) returns the most recent OTP
  for a given email by reading `public.verification`. Maestro flows:
  1. Type email, tap Send.
  2. Hit `/api/dev/last-otp` (via a tiny Maestro JS step or a wrapper
     in `:mock` builds that auto-fills the input).
  3. Type the code.
- Alternative considered: `EMAIL_OTP_FAKE_CODE` constant. Rejected
  because better-auth's emailOTP plugin compares against the value
  it generated and persisted; we'd have to monkey-patch the plugin.
  Reading from `public.verification` is cleaner.

### Live-deploy smoke test

`scripts/journeys/*.sh` are updated to:

- `POST /api/auth/sign-in/email` (replaces `/auth/password/verify`)
- `POST /api/auth/sign-out` (replaces `/auth/logout`)

Same shell shape; just URL + body field renames.

---

## Migration checklist (for the implementing agent)

1. Install: `pnpm --filter @harpa/api add better-auth @better-auth/drizzle-adapter @better-auth/expo` and `pnpm --filter @harpa/mobile add @better-auth/expo expo-network`.
2. Confirm/add ID prefixes in `packages/api/src/lib/ids.ts` (`usr`, `ses`, `vrf`, `idn`).
3. Write `packages/api/src/auth/auth.ts` (server config above) — including the `additionalFields` for `displayName`/`companyName`/`isAdmin`/`plan` and the `generateId` callback mapping models to slug prefixes.
4. Run `pnpm exec @better-auth/cli generate --output packages/api/src/db/auth-schema.ts` to produce the Drizzle schema. Commit it as a generated artefact (do not hand-edit).
5. Write `packages/api/migrations/0014_better_auth_init.sql` (drop `auth` schema, drop FKs, create `public.user/session/account/verification`, recreate FKs, recreate `invite_member_by_email` / `list_project_members`, regrant `app_authenticated`).
6. Update `packages/api/src/db/schema.ts` to drop the auth section and re-export from `auth-schema.ts`.
7. Run migration against local dev DB; verify with `psql \dt+ public.* app.*`.
8. Update `packages/api/src/middleware/auth.ts` per the snippet above.
9. Update `packages/api/src/app.ts` — mount `/api/auth/**`, remove old `authRoutes` mount.
10. Update `packages/api/src/routes/me.ts` — drop phone, add email; use `c.get('user')`.
11. Delete `packages/api/src/auth/{jwt,twilio,password,service}.ts` and `packages/api/src/routes/auth.ts`.
12. Update `packages/api-contract/src/me.ts` and `project-members.ts` schemas (phone → email). Regenerate `packages/api-contract/generated`.
13. Update `packages/api/src/env.ts` — drop Twilio + `TEST_ACCOUNT_PHONES`, add `TEST_ACCOUNT_EMAILS` and `EMAIL_OTP_LIVE`. Apply env-Zod refines.
14. Write `packages/api/scripts/seed-test-account.ts`. Wire it into the dev deploy (`fly deploy` post-step in CI).
15. Add dev-only `POST /api/dev/last-otp` endpoint (mounted only when `NODE_ENV !== 'production'`).
16. Rewrite `packages/api/src/__tests__/auth.integration.test.ts` per the test cases above; ensure `nock` is installed for Resend interception.
17. Run `pnpm --filter @harpa/api test`. Fix until green.
18. Write `apps/mobile/lib/auth/client.ts`.
19. Rewrite `apps/mobile/lib/auth/session.tsx` to wrap `authClient.useSession()`.
20. Delete `apps/mobile/lib/phone/*`, `lib/auth/use-otp-resend.ts`, `lib/auth/storage.ts`, `lib/auth/remembered-login.ts`, `lib/auth/login-phone-hint.ts` and their tests.
21. Write `screens/auth-email.tsx`. Add new email + code screens; delete phone screens; rewrite `e2e-password-login.tsx` to use `authClient.signIn.email`.
22. Update `apps/mobile/lib/api/hooks.ts` for the three new mutations.
23. Update Maestro flows in `.maestro/` — replace phone steps with email steps; flows in `:mock` mode read OTP from `/api/dev/last-otp` (a small wrapper helper in the `:mock` build provides this).
24. Update `scripts/journeys/{core,journey,extended,stress}.sh` — `/auth/password/verify` → `/api/auth/sign-in/email`, `/auth/logout` → `/api/auth/sign-out`.
25. Update Doppler `dev` and `prd` per the env-vars section.
26. Rewrite `docs/v4/arch-auth-and-rls.md` — drop the "deliberately did NOT" line, replace the auth section with the better-auth design, keep the per-request scope + RLS section verbatim, update env-var table, update test-account section.
27. Update `docs/v4/pitfalls.md` Pitfall 5 if it references Twilio specifically.
28. **Sweep the rest of the docs for stale auth references.** Each must reflect better-auth endpoints (`/api/auth/sign-in/email-otp`, `/api/auth/sign-out`, etc.), email instead of phone, and Resend instead of Twilio. Files to review and update as needed:
    - `docs/v4/architecture.md` — top-level component diagram + auth bullet
    - `docs/v4/arch-api-design.md` — auth endpoint table
    - `docs/v4/arch-rate-limiting.md` — rate-limit keys (now `/api/auth/sign-in/email-otp`)
    - `docs/v4/arch-cli.md` — any auth-CLI examples
    - `docs/v4/arch-project-members.md` — invite-by-email flow already aligned, double-check
    - `docs/v4/arch-usage-limits.md` — references to deleted `auth/service.ts::fetchUsage`
    - `docs/v4/manual-api-cheatsheet.md` — curl examples
    - `docs/v4/plan-p0-foundation.md`, `plan-p1-api-core.md`, `plan-p3-feature-build.md`, `plan-p4-hardening.md` — auth-related checkboxes / tasks
    - `docs/v4/design-p31-slug-only-ids.md` — note that `usr`/`ses`/`vrf`/`idn` are now generated by better-auth's `generateId` rather than `packages/api/src/lib/ids.ts`
    - `docs/v4/design-maestro-full-regression.md` — replace phone steps
    - `docs/v4/design-voice-notes-e2e.md` — auth setup section
    - `docs/bugs/2026-05-15-logout-jwt-not-revoked.md` — append a "resolved by better-auth migration (PR #…)" footnote
    - `docs/bugs/2026-05-20-healthz-static-literal-prod-down.md` — minor context update if it references the old auth service
    - `.github/instructions/api.instructions.md` — drop `createTwilioClient` from the default-wiring rule list; add note that the better-auth handler is mounted by `auth.ts` and tested via `nock` against Resend
    - `docs/superpowers/plans/2026-05-26-mobile-structure-simplification.md` — any phone-screen references
29. `pnpm turbo test` and `pnpm turbo build` green end to end.
30. Open PR against `dev`. Title: `feat(auth): rip-and-replace with better-auth (email-OTP)`.

---

## Out of scope (next specs, in order)

1. **Sign in with Apple** — better-auth `apple` provider; iOS-only
   button; revoke token on account delete.
2. **Account deletion (`DELETE /me`)** — required for App Store
   5.1.1(v); needs SIWA token revoke.
3. **Google Sign-In** — same provider pattern as Apple.
4. **Optional: re-introduce phone-OTP** if a user segment needs SMS.
   Better-auth has a phone plugin; Twilio Verify wrapping is a thin
   shim if/when we need it.
