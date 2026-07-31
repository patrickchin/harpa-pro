# P2 — Mobile Shell

> **P2 complete (audited 2026-05-19).** Auth flow, navigation,
> NativeWind tokens, primitives + snapshot tests, dev-gallery,
> auto-generated React Query hooks for every endpoint, env.ts +
> lint guards — all shipped. Verified by code audit.
>
> Goal: auth flow, navigation, NativeWind tokens locked, every shared
> primitive built and snapshot-tested, **and the dev-gallery live so
> every shipped screen can be viewed instantly without auth/API**.
>
> See [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design)
> — P2 is the phase where v3 went off the rails. v4 avoids that by
> using this plan and any linked `design-*.md` files as the screen
> specifications. If neither applies, current implementation and
> tests are the baseline. A design change needs a task-specific
> design doc.

## Exit gate (`p2-exit-gate.yml`)

- [x] Auth flow (login → verify → onboarding) implemented from this
      plan and reviewed manually.
- [x] Projects list implemented and reviewed manually.
- [x] All primitives built with snapshot tests at ≥ 100% coverage:
      `Card`, `Input`, `Button`, `IconButton`, `ScreenHeader`,
      `EmptyState`, `Skeleton`, `AppDialogSheet`, `StatTile`.
- [x] `tailwind.config.js` tokens locked as specified by this plan.
      No hex literals in
      `apps/mobile/components/**`.
- [x] `lib/env.ts` Zod-parsed at boot; ESLint rule live.
- [x] Generated React Query hooks for every endpoint
      (`pnpm gen:api && git diff --exit-code` clean).
- [x] Every shipped screen has a body component in
      `apps/mobile/screens/<name>.tsx` plus two routes wrapping it:
      the real route under `(auth)/` or `(app)/`, and a
      `(dev)/<name>.tsx` mirror with mock props.
- [x] Dev-gallery index at `app/(dev)/index.tsx` lists every screen
      with tap-through navigation. Mounted only in dev / `:mock`
      builds (never in production).

## Tasks

### P2.0a Per-page prompt template + acceptance precedence
- [x] `docs/v4/prompts/page-template.md` — reusable per-screen prompt
      (current paths, primitives to use, dual-route + body
      component pattern, behaviour-only scope, deferred wiring).
- [x] One-paragraph note in the header: the relevant
      `design-*.md` or `plan-*.md` file defines acceptance. Current
      implementation and tests are the fallback baseline. Historical
      screenshots, realignment docs, and source dumps are **not**
      acceptance sources.
- [x] Shipped in `e695292e`.

### P2.0b Dev gallery + screens/ pattern
- [x] `apps/mobile/screens/` directory established (one body component
      per screen; props-driven, no API/auth dependencies inside).
- [x] `app/(dev)/_layout.tsx` + `app/(dev)/index.tsx` — gallery
      listing every body component the app ships, each with canned
      mock props. Tap-through pushes the real route in dev mode.
- [x] Gallery + dev routes guarded by `__DEV__ || env.EXPO_PUBLIC_USE_FIXTURES`
      so they never reach a production bundle.
- [x] Snapshot test for the empty gallery skeleton.
- [x] Documented in [arch-mobile.md](arch-mobile.md) §"Dev gallery".
- [x] Commit: `feat(mobile): P2.0b dev gallery scaffold + screens/ body-component pattern`.

### P2.1 Tailwind tokens + NativeWind setup
- [x] Token table established in `apps/mobile/tailwind.config.js`.
- [x] `tailwind.config.js` ships every token; `global.css` imports.
- [x] Lint guard `check-no-hex-colors.sh` passes (skips: no `components/` yet).
- [x] Shipped in `645c0b70`.

### P2.2 Primitives
- [x] One commit per primitive: file + snapshot test + dev-gallery row.
- [x] `IconButton` standardised early (Pitfall in v3: `48c5dee`).
- [x] `Input` centred-text + caret behaviour verified (Pitfall: `1ec0fc8`).
- [x] `ScreenHeader` top padding correct (Pitfall: `db0b97c`).
- [x] `AppDialogSheet` is the only dialog primitive — Alert lint guard active.
- [x] Commit per primitive: `feat(mobile): <Name> primitive with snapshot tests`.

### P2.3 API client + generated hooks
- [x] `lib/api/client.ts` (auth header, error mapping, typed via api-contract).
- [x] `lib/api/hooks.ts` generated (`pnpm gen:api`).
- [x] `lib/api/invalidation.ts` central rules + coverage test.
- [x] Commit: `feat(mobile): typed API client + generated React Query hooks`.

### P2.4 Auth session + secure store
- [x] `useAuthSession` (mirrors `expo-secure-store`).
- [x] Token refresh on activity. *Carve-out: no silent refresh — JWTs
      are 7 days; inactive users re-OTP. The session re-fetches `/me`
      via `refresh()` on focus events the app shell wires up in P2.6,
      which is "refresh on activity" enough for our threat model
      without taking on the complexity of a refresh-token rotation.*
- [x] On 401, sign out + redirect. *Wired via
      `setOnUnauthorizedCallback` in the API client — fires for both
      queries AND mutations (React Query's global onError only catches
      queries; the mutation gap was raised by security-reviewer §E).*
- [x] Commit: `feat(mobile): auth session with secure-store + auto sign-out on 401`.

### P2.5 Auth screens (phone / OTP / onboarding — split per route)

The initial auth interaction kept phone-number entry **and** OTP entry
inside a single screen with internal `step` state. This plan
**splits each into its own route** so the navigation stack, back
button, deep-linking, and behaviour tests have one responsibility per
screen. Phone entry pushes to its OTP screen with the phone number as
a navigation param. The OTP screen owns resend and verification.

Bodies (one commit each):
- [x] `screens/sign-in-phone.tsx` — phone-number entry for existing
      users.
- [x] `screens/sign-in-verify.tsx` — OTP entry + resend for sign-in.
- [x] `screens/sign-up-phone.tsx` — phone-number entry for new users.
- [x] `screens/sign-up-verify.tsx` — OTP entry + resend for sign-up.
- [x] `screens/onboarding.tsx` — onboarding details.

Real routes mirror the bodies one-to-one:
- [x] `app/(auth)/sign-in/phone.tsx`, `app/(auth)/sign-in/verify.tsx`
- [x] `app/(auth)/sign-up/phone.tsx`, `app/(auth)/sign-up/verify.tsx`
- [x] `app/(auth)/onboarding.tsx`

Dev mirrors:
- [x] `app/(dev)/sign-in-phone.tsx`, `app/(dev)/sign-in-verify.tsx`,
      `app/(dev)/sign-up-phone.tsx`, `app/(dev)/sign-up-verify.tsx`,
      `app/(dev)/onboarding.tsx` — each with mock props.

Behaviour rules:
- [x] Verify screens use a **single async flow**, no `setTimeout` chains
      (Pitfall 5). On success: `await signIn()` → `router.replace`
      based on the resulting auth status (`needs-onboarding` →
      onboarding, `authenticated` → `(app)`).
- [x] Resend uses an explicit cooldown timer (a UI-only `setInterval`
      for the countdown is allowed; it must NOT gate navigation).
- [x] Phone number is passed via navigation param, never re-entered
      on the verify screen. The verify screen reads it from
      `useLocalSearchParams()` and renders it read-only.
- [x] No `Alert.alert` — error envelopes render through
      `AppDialogSheet` or inline error rows.
- [x] Behaviour tests for each interaction this plan requires (input
      validation, error rendering, loading, resend).
- [x] One commit per body, route, and mirror trio: `2896f8ee`,
      `edb5c1be`, `c4778e4e`, `9788c777`, and `523a428a`.

### P2.6 App shell (`(app)/_layout.tsx`)
- [x] Tab + stack navigation.
- [x] Auth gate redirect.
- [x] Providers wired: env, query, queue, dialogs, audio, sentry-stub.
- [x] Commit: `feat(mobile): app shell with provider tree and auth gate`.

### P2.7 Projects list
- [x] `screens/projects-list.tsx` implemented from this plan and its
      linked v4 requirements.
- [x] Real route: `app/(app)/projects/index.tsx`.
- [x] Dev mirror: `app/(dev)/projects.tsx` with mock data.
- [x] Shipped in `f4f74ab4`.

### P2.8 P2 exit gate
- [x] All boxes ticked. Tag `v0.2.0-shell`.

**Per-stage build gate (now enforced from P2.8 onwards — see
`overnight-protocol.md` §5).** Before tagging any phase, the
verification loop must include a green
`pnpm --filter @harpa/mobile bundle:smoke`. Two whole classes of
runtime-only bugs (Pattern R2 — `.js` extensions in relative TS
imports; Pattern R4 — test files leaking into the app bundle via
`expo-router`) only show up when Metro actually bundles the app.
Vitest, typecheck, and lint all stayed green while shipping both of
those bugs in P2.5–P2.7. Going forward, no phase tag lands without
the bundle smoke-test passing on the tagged commit.
