# Separate admin console authentication

**Status:** Implemented and deployed. Current administrator provisioning is
provider-managed and `UNKNOWN` from the repository.

## Context

The first business-activity console reused the app's Better Auth user and
session tables. A browser signed in with email OTP, and
`GET /admin/activity` accepted the same app session after checking
`public."user".is_admin`.

The admin console now needs a separate identity boundary:

- admin identities must not be app users;
- only explicitly provisioned `@harpapro.com` addresses may sign in;
- each administrator uses a long password;
- app OTP, app password bypasses, and app sessions must not grant access; and
- the implementation must remain lightweight for a one-developer product.

## Decision

Add a small admin-auth subsystem inside `@harpa/api`. It owns separate
Postgres identity and session tables, dedicated `/admin/auth/*` routes, and
an opaque browser cookie. It does not use Better Auth and has no foreign key
to `public."user"`.

The identities and sessions live in the independent Neon project
`harpa-pro-admin`, reached only through `ADMIN_DATABASE_URL`. Application data
continues to use `DATABASE_URL`. This is a separate identity database inside
the existing API deployment, not a second auth framework or API service.

The two databases never join and have no cross-database foreign keys.
`GET /admin/activity` first validates the cookie against the admin database,
then reads `app.activity_events` from the application database.

The first cut moves the business-activity console and
`GET /admin/activity` to the new boundary. Existing programmatic admin routes
in `packages/api/src/routes/admin.ts` remain on their current app-admin
authorization until a separate migration accounts for their existing
app-user audit foreign keys. They are not called by this page.

## User journey

1. An operator provisions an exact `@harpapro.com` address with the admin CLI
   and stores its long password in a password manager.
2. The administrator opens the admin site root, `/`.
3. The page checks `GET /admin/auth/session`.
4. If signed out, the page asks for email and password.
5. `POST /admin/auth/login` verifies the dedicated identity, creates a
   revocable session, and sets an HttpOnly cookie.
6. The page loads `GET /admin/activity` with `credentials: "include"`.
7. Sign-out revokes the server-side session before clearing the cookie.

No bearer token or password is written to local storage, session storage, a
URL, or application logs.

## Identity model

The admin database has its own forward-only migration stream under
`packages/api/admin-migrations` and its own `admin._migrations` ledger.
Migration `0001_admin_auth.sql` creates the initial schema without touching
the application database. Migration `0002_admin_rate_limit_buckets.sql`
adds the admin surface's distributed rate-limit counters to the same
independent database.

### `admin.identities`

| Column                            | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `id admin.adm_id`                 | Dedicated administrator ID                       |
| `email text`                      | Unique, lowercase, exact `@harpapro.com` address |
| `password_hash text`              | Versioned scrypt hash                            |
| `disabled_at timestamptz`         | Immediate identity revocation                    |
| `password_changed_at timestamptz` | Credential audit timestamp                       |
| `last_login_at timestamptz`       | Last successful login                            |
| `created_at`, `updated_at`        | Lifecycle timestamps                             |

The database enforces the email domain. The CLI and API repeat the check at
their trust boundaries. An address merely ending in text that resembles the
domain does not pass; the parsed domain must be exactly `harpapro.com`.

### `admin.sessions`

| Column                           | Purpose                                   |
| -------------------------------- | ----------------------------------------- |
| `id admin.ads_id`                | Internal admin-session ID                 |
| `admin_identity_id admin.adm_id` | Owning identity                           |
| `token_hash text`                | SHA-256 of a random 256-bit browser token |
| `expires_at timestamptz`         | 12-hour absolute expiry                   |
| `idle_expires_at timestamptz`    | Two-hour idle expiry                      |
| `last_seen_at timestamptz`       | Throttled idle-session touch              |
| `revoked_at timestamptz`         | Logout/password-reset revocation          |
| `created_at timestamptz`         | Creation timestamp                        |

Only the raw random token enters the browser cookie. Only its hash is stored
in Postgres. Password reset revokes every session belonging to the identity.

The `admin` schema and both tables revoke `PUBLIC` access. RLS is enabled
without policies as an additional fail-closed boundary. Normal application
database roles and credentials do not exist in this Neon project. API admin
auth uses a dedicated five-connection pool only inside its auth service.

## Password policy

- Minimum 20 characters and maximum 128 characters.
- Operators should use a password-manager-generated value of at least
  32 random characters.
- Store only a salted, versioned scrypt hash.
- Use Node's built-in scrypt at `N=2^14`, `r=8`, `p=5`, one of the current
  minimum profiles in the
  [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Use a unique 16-byte random salt for every password.
- Run the same password verification work for unknown, disabled, wrong-domain,
  and wrong-password attempts before returning the same response.

The provisioning command reads the password from standard input rather than a
command-line argument:

```sh
read -rs HARPA_ADMIN_PASSWORD
printf '%s' "$HARPA_ADMIN_PASSWORD" | \
  doppler run --project harpa-pro --config dev -- \
    pnpm --filter @harpa/api admin:set-password \
    --email person@harpapro.com --password-stdin
unset HARPA_ADMIN_PASSWORD
```

The password belongs in the operator's password manager. It is not a Doppler
or Fly secret and is never committed. `ADMIN_DATABASE_URL`, by contrast, is a
deployment secret that selects the independent admin database.

## Session and cookie policy

The production cookie is host-only and named
`__Host-harpa_admin_session`. It uses:

- `HttpOnly`;
- `Secure`;
- `Path=/`;
- no `Domain`;
- `SameSite=Strict` on the production `harpapro.com` site; and
- a 12-hour client expiry backed by server-side absolute and idle checks.

Local HTTP tests use an unprefixed, non-secure `harpa_admin_session` cookie.

The stable development admin site runs on `pages.dev` while the API runs on
`fly.dev`. That is cross-site. For explicitly configured
development origin, the API uses `SameSite=None; Secure; Partitioned` with a
`__Host-` cookie. Partitioning follows
[MDN's CHIPS guidance](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies)
and prevents the cookie being reused under another top-level site.

Production never permits a `pages.dev` admin origin. Development permits only
the exact stable URL `https://dev.harpa-pro-admin.pages.dev`, never a wildcard.
PR preview APIs trust only their matching
`https://pr-<n>.harpa-pro-admin.pages.dev` origin.

## Routes

### `POST /admin/auth/login`

Request:

```text
{ email: string, password: string }
```

Behavior:

- reject request bodies larger than 8 KiB with `413` before JSON parsing,
  rate-limit accounting, or authentication work;
- require an exact configured admin browser `Origin`;
- enforce the IP window and short-burst limits before authentication;
- count attempts in a canonical-email bucket, but apply an exhausted
  email-bucket result only after password verification fails;
- canonicalize the email;
- perform uniform password verification;
- reject unknown, disabled, wrong-domain, and wrong-password credentials with
  the same `401` body;
- create a new opaque session and set the admin cookie; and
- return `{ authenticated: true, email }` with `Cache-Control: no-store`.

### `GET /admin/auth/session`

Validates the cookie and returns `{ authenticated: true, email }`.
An invalid, expired, idle-expired, or revoked session returns `401` and clears
the cookie.

### `POST /admin/auth/logout`

Requires a valid admin session and exact configured `Origin`, revokes the
session, and clears the cookie.

### `GET /admin/activity`

Replace `withAuth()` plus `withAdmin()` with `withAdminSession()`. A valid app
Bearer token or Better Auth cookie must not authorize this route, even when
the app user has `is_admin = true`. A shared trusted-Fly-IP gate first limits
random-token probes against the admin sessions table. After admin-database
authentication succeeds, consume a separate 120-request-per-minute bucket
keyed by the dedicated admin identity and session. Only then does the route
read activity from the application database. Anonymous traffic consumes the
shared IP gate but not the activity bucket.

### `GET /admin/readyz`

Checks the independent admin database connection and
`admin._migrations` head. It is used by post-deploy verification but not by
Fly's machine readiness check: an admin-only database outage must not take
the mobile/product API out of service. Concurrent probes share one database
check; a successful result is cached for two seconds and a failure for one
second to avoid a readiness thundering herd.

## Abuse and CSRF controls

The admin browser surface uses its own Postgres-backed limiter in the
independent admin database in deployed environments:

- all `/admin/auth/*` and `/admin/activity` requests: 120 per trusted Fly
  client IP per minute;
- login: 20 attempts per trusted Fly client IP per 15 minutes;
- login: 3 attempts per trusted Fly client IP per minute;
- login: 5 attempts per canonical email per 15 minutes; and
- activity reads: 120 per dedicated admin identity and session per minute.

The shared IP gate protects admin-session database lookups, including invalid
cookie probes to the activity route. The login IP limits also reject before
authentication. The canonical-email bucket is still consumed on every login
attempt, but an exhausted result rejects only an invalid login after uniform
password verification. Correct credentials therefore cannot be locked out
by attempts from other IPs targeting the same email address.

Login failures remain indistinguishable and never disclose whether an
identity exists.

Login and logout reject missing or untrusted `Origin` headers. The activity
request is read-only. If this browser session later protects an admin
`POST`, `PUT`, `PATCH`, or `DELETE` other than logout, add a per-session CSRF
token carried in a custom header as described by the
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Successful login, failed login, logout, and session rejection emit structured
audit lines containing the request ID, client IP, canonical email where safe,
and outcome. Passwords and raw session tokens are never logged.

## CORS boundary

- Remove the admin origin from Better Auth `trustedOrigins`.
- Remove browser CORS from `/api/auth/*`; native app auth does not need it.
- Keep credentialed exact-origin CORS on `/admin/*`.
- Allow only `GET`, `POST`, and `OPTIONS` for the current browser console.
- Allow only `Content-Type` and `X-Request-ID`.
- Keep `Vary: Origin` and never use `*` with credentials.
- Store environment-specific admin origins as non-secret Fly configuration,
  not in the Doppler secret stream.
- Store `ADMIN_DATABASE_URL` in Doppler/Fly secrets. In every environment it
  must not identify the same Postgres endpoint as `DATABASE_URL`.

Env parsing, the admin migrator, and administrator provisioning all reject
the same direct/pooler endpoint. The two mutation entrypoints also connect
read-only first and refuse a target containing the application
`app._migrations` ledger. Deployment automation provides the stronger
restore-boundary guarantee by resolving the two URLs from different explicit
Neon project IDs.

## Site changes

Replace the Better Auth client island with a small fetch client for the three
admin-auth routes. The sign-in form contains:

- an email field constrained in the UI to `@harpapro.com`;
- a password field with password-manager autocomplete;
- one `Sign in` action; and
- a generic invalid-credentials message.

The password is cleared from React state after every login attempt.

The feed, filters, pagination, deleted-entity states, and detail drawer remain
unchanged.

## Verification

### Migration and scope

- A fresh independent Postgres applies through admin migration `0002`.
- Both ID domains enforce slug shape.
- The database rejects non-`@harpapro.com` identities.
- The application database contains no admin identity or session tables.
- The admin database has an independent migration ledger and connection pool.

### API

- Correct credentials set only the dedicated admin cookie.
- Unknown email, wrong domain, disabled identity, and wrong password all
  return the same `401`.
- Bodies larger than 8 KiB return the JSON error envelope with `413` before
  consuming a login rate-limit bucket or verifying a password.
- Login rate-limit buckets work by IP and canonical email.
- Five invalid attempts against an email cannot prevent a subsequent login
  with the correct password.
- Session lookup, idle expiry, absolute expiry, logout, and password-reset
  revocation work against real Postgres.
- An app session, including an `is_admin = true` app user, cannot read
  `/admin/activity`.
- Anonymous requests sharing an IP consume only the shared IP gate, not the
  authenticated activity bucket; authenticated activity requests consume
  both.
- Exact CORS origins pass and untrusted origins receive no credentialed CORS
  headers.

### Site and browser

- Component tests in `apps/admin` cover session loading, password login, generic failure,
  password clearing, feed states, and logout.
- Playwright signs in through the visible form, observes an HttpOnly cookie,
  loads a persisted event, confirms browser storage is empty, and signs out.
- API and site lint, typecheck, build, integration, scope, and coverage gates
  remain green.

## Rollout and rollback

1. Create `dev` from `main` in the `harpa-pro-admin` Neon project.
2. Store the development branch URI as `ADMIN_DATABASE_URL`.
3. Apply the admin migration to the development branch.
4. Provision one development admin identity through the CLI.
5. Deploy the API and site cutover together.
6. Verify admin readiness, login, refresh, activity loading, and logout from the real
   development hostname.
7. Migrate `main`, configure production, and provision production separately
   only when promoting the feature.

Application and admin database restores are independent because they are
separate Neon projects. Normal rollback is still an application-code revert;
the additive admin tables may remain unused. Do not edit or remove an applied
migration. There is no dual-auth compatibility window because no current
administrator account depends on the old page flow.

Provisioning an identity is an explicit database mutation and is not part of
the code deployment. The operator supplies the exact email and password at
that step.

## Deferred

- MFA or passkeys;
- Cloudflare Access as an outer gate;
- password recovery email;
- an admin identity management UI;
- migration of the remaining programmatic `/admin/*` routes; and
- migration of any remaining programmatic admin route that still uses app-user
  authorization.
