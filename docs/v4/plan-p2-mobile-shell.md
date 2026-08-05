# P2 — Mobile shell

> **Historical delivery plan.** P2 shipped and later changed during
> the production build. The current shell uses email one-time codes,
> Better Auth, a Stack navigator, and user-scoped MMKV persistence.
> It has no phone-auth routes, tab navigator, or `(dev)` gallery.
> Use [`arch-mobile.md`](arch-mobile.md) and
> [`arch-p2-6-app-shell.md`](arch-p2-6-app-shell.md) for current behavior.

## Delivered outcome

P2 established the mobile application boundary:

- Expo Router route groups for authentication, the protected app, and
  the full-screen camera.
- NativeWind tokens and shared primitives.
- Props-driven screen bodies under `apps/mobile/screens/`.
- A typed API client and generated TanStack Query hooks.
- A root provider tree with authentication, query, dialog, upload,
  audio, and telemetry providers.
- Project-list and authentication flows.
- Unit tests, type checks, lint guards, and a Metro bundle smoke test.

Later phases completed the feature screens and replaced several P2
choices. Those replacements are intentional, not unfinished P2 work.

## Current acceptance boundary

The current implementation is the acceptance source. Review these files:

| Concern                                   | Current source                                   |
| ----------------------------------------- | ------------------------------------------------ |
| Root provider tree                        | `apps/mobile/app/_layout.tsx`                    |
| Protected Stack and Android back behavior | `apps/mobile/app/(app)/_layout.tsx`              |
| Authentication Stack                      | `apps/mobile/app/(auth)/_layout.tsx`             |
| Email-code sign-in                        | `apps/mobile/app/(auth)/sign-in/`                |
| Better Auth session bridge                | `apps/mobile/lib/auth/session.tsx`               |
| User-scoped query cache                   | `apps/mobile/lib/api/session-query-provider.tsx` |
| Upload queue                              | `apps/mobile/lib/uploads/`                       |
| Routes                                    | `apps/mobile/app/`                               |
| Screen bodies                             | `apps/mobile/screens/`                           |

Run the focused shell checks with installed dependencies:

```sh
pnpm --filter @harpa/mobile test:nocoverage -- \
  app/_layout.test.tsx \
  lib/auth/session.test.tsx \
  lib/api/session-query-provider.test.tsx
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
pnpm --filter @harpa/mobile bundle:smoke
```

## Superseded P2 decisions

### Phone authentication

The first P2 implementation used separate phone and OTP routes. The
current app uses:

- `sign-in/email.tsx` to request an email code.
- `sign-in/code.tsx` to verify the code.
- `onboarding.tsx` to collect a display name and optional company.
- `e2e-password-login.tsx` for allowlisted non-production test accounts.

Better Auth owns session cookies through `@better-auth/expo`. The app
extracts the stored session token only to support the existing bearer
API client.

### Dev gallery

The original `(dev)` route group and mirrored screen gallery were
removed. Screen bodies remain testable through typed props and Vitest.
Maestro covers integrated application journeys.

The Profile screen currently links to `/developer` in every build.
This differs from the earlier dev-only requirement. Treat it as an
open implementation decision. Do not describe the route as gated.

### Tab navigator

The current protected application uses one headerless Expo Router
`Stack`. `AppHeaderActions` provides Projects and Profile shortcuts.
Account, Usage, Developer, project, report, note, and camera surfaces
remain Stack routes.

### Fixture flag

`pnpm --filter @harpa/mobile ios:mock` sets
`EXPO_PUBLIC_USE_FIXTURES=true`. This flag selects deterministic local
native inputs, including the canned voice recording. It does not tell
the API to replay AI fixtures. The API selects live or replay mode from
its own environment.

## Historical exit status

P2 no longer has an active phase tag or a separate merge gate. The
repository-wide CI and the mobile checks above protect the shipped
shell. Later feature plans record the subsequent product work.
