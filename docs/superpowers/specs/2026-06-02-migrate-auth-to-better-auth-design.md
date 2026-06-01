# Design: Migrate auth to better-auth (email-OTP + future SIWA)

**Date:** 2026-06-02  
**Branch:** `agents/migrate-auth-to-better-auth`  
**Status:** Ready for implementation  
**Related docs:** `docs/v4/arch-auth-and-rls.md`, `docs/v4/pitfalls.md`

---

## Context and motivation

The current auth system is hand-rolled phone-OTP via Twilio Verify (`packages/api/src/auth/`).
There are **no production users yet**, so schema migration is trivially clean.

Goals:
1. Replace phone-OTP with **email-OTP** (Resend is already wired for the waitlist).
2. Adopt **better-auth** as the auth framework to reduce future maintenance burden.
3. Leave the door open for **Sign in with Apple** (next spec) and **Google Sign-In** as a follow-up — better-auth supports both natively.
4. App Store **5.1.1(v) account deletion** is **out of scope** for this spec — handled in the next PR.

---

## What is changing vs. staying the same

### Deleted
- `packages/api/src/auth/jwt.ts` — hand-rolled JWT sign/verify (replaced by better-auth)
- `packages/api/src/auth/twilio.ts` — Twilio Verify wrapper
- `packages/api/src/auth/password.ts` — test-account scrypt bypass
- `packages/api/src/auth/service.ts` — `startOtp`, `verifyOtp`, `issueSessionForPhone`, `logout`
- `packages/api/src/routes/auth.ts` — `/auth/otp/*`, `/auth/password/verify`, `/auth/logout` routes
- `packages/api/src/__tests__/auth.integration.test.ts`
- `packages/api/src/__tests__/journeys/_login.ts` and `auth-password.journey.integration.test.ts`
- Mobile: `apps/mobile/lib/phone/*`, `apps/mobile/lib/auth/use-otp-resend.ts`
- Mobile screens: `apps/mobile/app/(auth)/sign-in/{phone,verify}.tsx`, `app/(auth)/sign-up/*`
- Mobile screen component: `apps/mobile/screens/auth-phone.tsx`
- Env vars: `TWILIO_*`, `TWILIO_LIVE`, `TWILIO_VERIFY_FAKE_CODE`, `TEST_ACCOUNT_PHONES`, `TEST_ACCOUNT_PASSWORD`
- `auth.verifications` table (and its Drizzle definition)

### Staying unchanged
- `packages/api/src/db/scope.ts` — `withScopedConnection` — receives `(userId, sessionId)` from middleware, unchanged
- All protected routes (`/projects`, `/notes`, `/files`, `/reports`, `/me`, `/settings`, etc.) — read `c.get('userId')` as before
- All Postgres RLS migrations — policies use `current_setting('app.user_id')`, agnostic to auth framework
- `apps/mobile/lib/auth/session.ts` — `useAuthSession` hook interface stays the same; only its internals change
- `apps/mobile/lib/auth/auth-gate.ts` — `decideAuthRedirect` logic unchanged (still checks `displayName == null` for onboarding)
- Onboarding screen — no change
- Account screen — no change (the `PATCH /me` flow is independent of auth provider)
- Waitlist flow — Resend usage in waitlist is independent, keep as-is

---

## Architecture

```
            ┌──────────────────────────────────────────────────────┐
            │                  Mobile (Expo)                       │
            │  better-auth/client (emailOTP + bearer plugins)      │
            │  authClient.signIn.emailOtp.sendVerificationOtp()    │
            │  authClient.signIn.emailOtp()                        │
            │  Authorization: Bearer <token>  on every request     │
            └──────────────────────────────────────────────────────┘
                              ▲
                              │  /api/auth/*  (better-auth handler)
            ┌─────────────────────────────────────────────────────┐
            │              Hono API (packages/api)                │
            │                                                     │
            │  app.on(['GET','POST'], '/api/auth/**',             │
            │    c => auth.handler(c.req.raw))                    │
            │                                                     │
            │  withAuth() middleware (updated):                   │
            │    auth.api.getSession({headers}) → {user,session} │
            │    c.set('userId', user.id)                        │
            │    c.set('sessionId', session.id)                  │
            │    c.set('db', fn => withScopedConnection(...))    │
            └─────────────────────────────────────────────────────┘
                              ▲
                              │ Drizzle adapter + Resend sendEmail
                              ▼
            ┌─────────────────────────┐    ┌─────────────────────┐
            │   Postgres (Neon)       │    │  Resend API         │
            │   auth.user             │    │  (OTP code email)   │
            │   auth.session          │    └─────────────────────┘
            │   auth.verification     │
            │   auth.account          │  ← used by SIWA next spec
            └─────────────────────────┘
```

---

## better-auth server configuration

Location: `packages/api/src/auth/auth.ts` (new file)

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { bearer } from 'better-auth/plugins';
import { rawDb } from '../db/client.js';
import { env } from '../env.js';
import { resend } from '../lib/resend.js';
import * as authSchema from '../db/auth-schema.js'; // generated by better-auth CLI

export const auth = betterAuth({
  database: drizzleAdapter(rawDb(), {
    provider: 'pg',
    schema: authSchema,
  }),

  advanced: {
    // Mint usr_* slugs to keep ID shape consistent with rest of codebase
    generateId: ({ model }) => {
      if (model === 'user') return newId('usr');
      if (model === 'session') return newId('ses');
      return newId('idn'); // accounts table
    },
  },

  plugins: [
    bearer(),

    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        if (env.EMAIL_OTP_LIVE !== '1') {
          // Fake mode: log the code, no real email.
          // Integration tests / :mock builds read EMAIL_OTP_FAKE_CODE.
          console.info(JSON.stringify({ msg: 'email_otp_fake', email, otp }));
          return;
        }
        await resend.emails.send({
          from: 'noreply@harpa.pro',
          to: email,
          subject: 'Your sign-in code',
          text: `Your code is: ${otp}\n\nIt expires in 10 minutes.`,
        });
      },
    }),
  ],

  user: {
    additionalFields: {
      displayName:  { type: 'string',  required: false, defaultValue: null },
      companyName:  { type: 'string',  required: false, defaultValue: null },
      isAdmin:      { type: 'boolean', required: false, defaultValue: false },
      plan:         { type: 'string',  required: false, defaultValue: 'free' },
    },
  },
});

export type Auth = typeof auth;
```

### Why these plugins
- **`bearer()`** — mobile app sends `Authorization: Bearer <token>`, no cookies. Without this plugin, better-auth defaults to cookies and the mobile client can't authenticate.
- **`emailOTP()`** — mints codes, tracks expiry, enforces brute-force lockout, calls our `sendVerificationOTP` hook for delivery. We never touch the code generation or hashing ourselves.

---

## Database schema (auth tables)

Run `npx @better-auth/cli generate` inside `packages/api` to produce the Drizzle schema.  
Commit the output as `packages/api/src/db/auth-schema.ts` (replaces old `schema.ts` auth section).

Tables better-auth owns:

| Table | Purpose |
|---|---|
| `auth.user` | Canonical user record (id, email, emailVerified, plus our additionalFields) |
| `auth.session` | Active sessions (id, userId, token, expiresAt, …) |
| `auth.verification` | Email-OTP codes (transient; cleaned up on verify) |
| `auth.account` | OAuth accounts (unused until SIWA spec; created empty) |

**Important:** `auth.user.phone` is gone. The app schema (`app.*`) must be checked for any FK references to `auth.users` that assumed phone.

### Slug ID prefix alignment

Add to `packages/api/src/lib/ids.ts`:
- `'usr'` already registered — keep.
- `'ses'` already registered — keep.
- `'idn'` — add for `auth.account` rows.

better-auth's `advanced.generateId` will call `newId(prefix)` for each model.

### Existing `auth.users` → `auth.user` rename

The existing Drizzle schema used `authSchema.table('users', ...)`. better-auth uses `auth.user` (singular). The migration must:
1. Drop `auth.verifications` (fully owned by Twilio OTP, no data to keep).
2. Drop `auth.sessions` and `auth.users` (no users yet, clean slate).
3. Let better-auth's Drizzle adapter create `auth.user`, `auth.session`, `auth.verification`, `auth.account`.

Migration file: `packages/api/migrations/00xx_better_auth_init.sql`

```sql
-- Drop old hand-rolled auth tables (no users in prod, safe to drop)
DROP TABLE IF EXISTS auth.verifications CASCADE;
DROP TABLE IF EXISTS auth.sessions CASCADE;
DROP TABLE IF EXISTS auth.users CASCADE;

-- better-auth tables are created by Drizzle push / migrate after this.
-- Do not create them manually here — let the adapter own them.
```

---

## API changes

### Mounting better-auth

In `packages/api/src/app.ts`:

```ts
import { auth } from './auth/auth.js';

// Mount before other routes so /api/auth/* is intercepted first
app.on(['GET', 'POST'], '/api/auth/**', c => auth.handler(c.req.raw));
```

The old `authRoutes` import and mount are removed.

### Updated `withAuth` middleware

Location: `packages/api/src/middleware/auth.ts`

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
    c.set('db', fn => withScopedConnection(
      { sub: session.user.id, sid: session.session.id },
      fn
    ));
    await next();
  };
}
```

`withScopedConnection` signature **does not change** — only the values flowing into it change.

### `/me` route update

`GET /me` currently returns `{ user: { id, phone, displayName, … } }`. With better-auth, `phone` is gone; replace with `email`. Update the response schema in `packages/api-contract/src/me.ts` and the route handler in `packages/api/src/routes/me.ts`.

`PATCH /me` — unchanged except `phone` field removed from patchable fields.

---

## Environment variables

### Remove
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SID
TWILIO_LIVE
TWILIO_VERIFY_FAKE_CODE
TEST_ACCOUNT_PHONES
TEST_ACCOUNT_PASSWORD
BETTER_AUTH_SECRET   ← this name already exists but was a JWT signing key;
                       re-purpose it as better-auth's secret (no value change needed)
```

### Add
```
EMAIL_OTP_LIVE          # '1' = real Resend emails; default: fake mode
EMAIL_OTP_FAKE_CODE     # fixed code for :mock builds + tests (default: '000000')
```

Update `packages/api/src/env.ts` Zod schema accordingly.  
Update Doppler `dev` and `prd` configs. Remove Twilio vars from Fly secrets.

---

## Mobile changes

### better-auth client

New file: `apps/mobile/lib/auth/better-auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/react-native';
import { emailOTPClient } from 'better-auth/client/plugins';
import { bearerClient } from 'better-auth/client/plugins';
import { env } from '@/lib/env';

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_API_URL + '/api/auth',
  plugins: [bearerClient(), emailOTPClient()],
});
```

### Session hook (`lib/auth/session.ts`)

Replace `jose` JWT decode + AsyncStorage session management with better-auth's `useSession()`.  
The hook's **output interface** stays the same:

```ts
// Public contract — unchanged
type SessionStatus = 'loading' | 'unauthenticated' | 'needs-onboarding' | 'authenticated';
interface AuthSession {
  status: SessionStatus;
  user: User | null;
  refresh: () => Promise<void>;
}
```

Internally, call `authClient.useSession()` and map `user.displayName == null` → `needs-onboarding`.

### New auth screens

Replace phone-based screens with email-based equivalents:

| Old | New |
|---|---|
| `app/(auth)/sign-in/phone.tsx` | `app/(auth)/sign-in/email.tsx` |
| `app/(auth)/sign-in/verify.tsx` | `app/(auth)/sign-in/code.tsx` |
| `app/(auth)/sign-up/phone.tsx` | deleted (merged into sign-in — email-OTP doesn't distinguish sign-in vs sign-up; the user is created on first verify) |
| `app/(auth)/sign-up/verify.tsx` | deleted |
| `screens/auth-phone.tsx` | `screens/auth-email.tsx` (new body component) |

**Flow:**
1. User enters email → `authClient.signIn.emailOtp.sendVerificationOtp({ email })` → API sends code via Resend.
2. User enters 6-digit code → `authClient.signIn.emailOtp({ email, otp })` → API verifies, issues session token.
3. Session stored by better-auth client (bearer token in SecureStore).
4. `useAuthSession` detects `displayName == null` → redirect to onboarding.

### API hooks (`lib/api/hooks.ts`)

Replace `useStartOtpMutation` and `useVerifyOtpMutation` with wrappers over `authClient`:

```ts
export function useSendEmailOtpMutation() { ... }
export function useVerifyEmailOtpMutation() { ... }
```

Logout: `authClient.signOut()` — replaces the existing `POST /auth/logout` call.

### Env (`lib/env.ts`)

No mobile env changes — `EXPO_PUBLIC_API_URL` is the only auth-related mobile env var and it stays.

---

## Testing

### Integration tests (Vitest + Testcontainers)

Replace `auth.integration.test.ts` with `better-auth.integration.test.ts`.

Required test cases (per pitfall-1 / arch-auth-and-rls.md §Test gates):

```
describe('email-OTP auth flow')
  test('sends OTP email in live mode') — stubs Resend, asserts send called
  test('accepts fake code in fake mode') — sets EMAIL_OTP_LIVE=0, asserts session issued
  test('rejects wrong code')
  test('rejects expired code')
  test('rate limits after N attempts')

describe('session middleware')
  test('withAuth passes valid bearer token')
  test('withAuth rejects missing token → 401')
  test('withAuth rejects expired session → 401')

describe('per-request scope (pitfall-6 gate)')
  test('actor A reads their own project → 200')
  test('actor A cannot read actor B project → 404')
  test('negative control: raw query without scope returns both rows')
```

The negative-control test is mandatory — `scripts/check-scope-tests.sh` enforces it.

### `:mock` build / Maestro E2E

Set `EMAIL_OTP_LIVE=0` and `EMAIL_OTP_FAKE_CODE=000000`.  
Maestro flows type `000000` as the code — no Resend call needed.  
Replace phone-number steps in any existing Maestro flows that log in.

---

## Migration checklist (for the implementing agent)

This is the ordered sequence of steps. Each step should be independently verifiable.

1. **Install better-auth** in `packages/api`:  
   `pnpm --filter @harpa/api add better-auth`

2. **Run CLI to generate schema:**  
   `npx @better-auth/cli generate --output src/db/auth-schema.ts`  
   Review and commit the generated file.

3. **Write `packages/api/src/auth/auth.ts`** per the config above.

4. **Write the migration SQL** (`00xx_better_auth_init.sql`) — drop old tables, let adapter create new.

5. **Run Drizzle migration** against the local dev DB and verify tables exist with correct columns.

6. **Update `withAuth` middleware** in `packages/api/src/middleware/auth.ts`.

7. **Update `app.ts`** — mount `/api/auth/**` to better-auth handler, remove old `authRoutes` mount.

8. **Update `me.ts` route** — drop `phone`, add `email` in response.

9. **Update `packages/api-contract`** — remove phone from user schema, add email.

10. **Update `packages/api/src/env.ts`** — remove Twilio/password vars, add `EMAIL_OTP_LIVE` + `EMAIL_OTP_FAKE_CODE`.

11. **Delete old auth files** — `jwt.ts`, `twilio.ts`, `password.ts`, `service.ts`, `routes/auth.ts`.

12. **Write new integration tests** per the test cases above.

13. **Run all API tests**: `pnpm --filter @harpa/api test`. Fix failures.

14. **Install better-auth client** in `apps/mobile`:  
    `pnpm --filter @harpa/mobile add better-auth`

15. **Write `apps/mobile/lib/auth/better-auth-client.ts`**.

16. **Update `apps/mobile/lib/auth/session.ts`** to use `authClient.useSession()`.

17. **Delete old mobile auth files** — `lib/phone/*`, `lib/auth/use-otp-resend.ts`, etc.

18. **Write new email auth screens** replacing phone screens.

19. **Update API hook wrappers** (`lib/api/hooks.ts`).

20. **Update any Maestro E2E flows** that reference phone login — swap phone entry for email entry + fake OTP code.

21. **Update Doppler** — remove Twilio vars from `dev` and `prd`. Add `EMAIL_OTP_LIVE`, `EMAIL_OTP_FAKE_CODE`. Remove Twilio vars from Fly secrets on next deploy.

22. **Update `docs/v4/arch-auth-and-rls.md`** — rewrite auth section to reflect better-auth + email-OTP. Keep per-request scope section (unchanged). Update env var table.

23. **Run full test suite**: `pnpm turbo test`. Confirm green.

24. **Open PR** against `dev` with title `feat(auth): migrate to better-auth with email-OTP`.

---

## Known issues / gotchas

- **`auth.user` vs `auth.users`** — better-auth uses singular table name by default. Any raw SQL in migrations that references `auth.users` must be updated. The RLS migrations use `auth.users` in a comment only; verify no policy `USING` clause references it.
- **User ID `usr_*` slug with better-auth** — the `advanced.generateId` hook must be set up *before* the first user is created. If running `pnpm drizzle-kit push` without the hook, better-auth will generate a UUID; those rows must be deleted before the real deploy.
- **Bearer token storage on mobile** — better-auth's react-native client stores the bearer token in SecureStore by default. Confirm `expo-secure-store` is already in `apps/mobile/package.json` (it is — used by existing session code).
- **`BETTER_AUTH_SECRET`** — this env var already exists (was used as JWT signing key). better-auth uses the same name for its own secret. The value can be kept or rotated; since there are no sessions to invalidate, rotating is a no-op cost.
- **Pitfall 13 compliance** — the integration test for email-OTP must exercise the **real** `sendVerificationOTP` hook path (with Resend stubbed, not skipped) in `EMAIL_OTP_LIVE=1` mode. The fake-code path is a separate test. Do not make the live path unreachable in tests.
- **`/api/auth/**` mount must come before the rate-limiter middleware** that applies to all routes, or the better-auth endpoints will get double-limited. Check `packages/api/src/app.ts` middleware ordering.

---

## Out of scope (next specs)

- **Sign in with Apple** — better-auth Apple provider; add `expo-apple-authentication` button on iOS; revoke token on account delete.
- **Account deletion (`DELETE /me`)** — required for App Store 5.1.1(v); separate spec.
- **Google Sign-In** — easy follow-on once SIWA spec is done; same provider pattern.
- **Phone-OTP reinstatement** — if a future user segment needs SMS, better-auth has a phone plugin; Twilio Verify delegation is still not supported natively but the workaround is documented in this repo's brainstorming session history.
