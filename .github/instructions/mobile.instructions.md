---
applyTo: "apps/mobile/**"
description: "Mobile-specific rules for the Expo / NativeWind app. Loads automatically when editing apps/mobile/."
---

# Mobile (apps/mobile)

## Styling

- **NativeWind v4 only.** No Unistyles, no StyleSheet.create, no raw
  hex colours in component code. Tokens come from the Tailwind config
  + theme tokens — see `docs/v4/arch-mobile.md`.

## Dialogs / overlays

- **No `Alert.alert`.** Use `AppDialogSheet` or another themed
  primitive. Enforced by the `no-restricted-imports` rule in
  [`apps/mobile/.eslintrc.cjs`](../../apps/mobile/.eslintrc.cjs).

## Env vars

- **Never use `process.env.EXPO_PUBLIC_*!`** (non-null assertion).
  Read env via `lib/env.ts` (Zod-parsed at boot).
- `EXPO_PUBLIC_*` vars are inlined by Metro **at bundle time** —
  changing them requires a rebuild, not a JS reload.

## Fixture / mock mode

- `pnpm --filter @harpa/mobile ios` /
  `pnpm --filter @harpa/mobile ios:mock` (run from repo root). `:mock` inlines
  `EXPO_PUBLIC_USE_FIXTURES=true`, returning canned API responses and
  replacing the iOS-simulator audio recorder with a "Save fixture
  voice note" stub that emits a canned `voice-sample.m4a` through
  the real upload pipeline + aggregator.
- See [`docs/v4/arch-voice-pipeline.md` §D6](../../docs/v4/arch-voice-pipeline.md#d6-fixture-mode-contract)
  for the fixture-mode contract.

## Screen vs route discipline

- Body components in `apps/mobile/screens/<name>.tsx` do **not** call
  the API or touch the network. Data fetching lives in the route per
  the page template (`docs/v4/prompts/page-template.md`).
- For mobile screen ports the canonical source is
  `../haru3-reports/apps/mobile@dev` — match it pixel-for-pixel.

## Auth flows

- **No `setTimeout` in auth flows.** Use the OTP / state machine
  primitives — see Pitfall 12 in `docs/v4/pitfalls.md`.

## Coverage gate

- 80%+ line coverage on `apps/mobile`. Run
  `pnpm --filter @harpa/mobile test -- --coverage`.
