---
applyTo: 'apps/mobile/**'
description: 'Mobile-specific rules for the Expo / NativeWind app. Loads automatically when editing apps/mobile/.'
---

# Mobile (apps/mobile)

## Styling

- **Current styling:** NativeWind v4. Reuse the shared theme tokens;
  do not add `StyleSheet.create` or raw hex colours in component
  code. See `docs/v4/arch-mobile.md`.

## Dialogs / overlays

- **No `Alert.alert`.** Use `AppDialogSheet` or another themed
  primitive. Enforced by the `no-restricted-imports` rule in
  [`apps/mobile/eslint.config.mjs`](../../apps/mobile/eslint.config.mjs).

## Env vars

- **Never use `process.env.EXPO_PUBLIC_*!`** (non-null assertion).
  Read env via `lib/config/env.ts` (Zod-parsed at boot).
- `EXPO_PUBLIC_*` vars are inlined by Metro **at bundle time** —
  changing them requires a rebuild, not a JS reload.

## Fixture input mode

- Run `pnpm --filter @harpa/mobile ios` or
  `pnpm --filter @harpa/mobile ios:mock` from the repository root.
- `ios:mock` inlines `EXPO_PUBLIC_USE_FIXTURES=true`. This replaces the
  native audio recorder with a canned `voice-sample.m4a` input. The
  upload pipeline and API calls still run.
- **This flag does not select API replay mode.** The mobile client sends
  no fixture-mode header and does not add `fixtureName` to AI requests.
- For cost-free testing, point the app only at an API with `AI_LIVE=0`.
  Do not point `ios:mock` at production and assume provider calls are off.
- See [`docs/v4/arch-voice-pipeline.md` §D6](../../docs/v4/arch-voice-pipeline.md#d6-fixture-mode-contract)
  for the fixture-input contract.

## Screen vs route discipline

- Body components in `apps/mobile/screens/<name>.tsx` do **not** call
  the API or touch the network. Data fetching lives in the route per
  the page template (`docs/v4/prompts/page-template.md`).
- For a screen port or feature specification, use the relevant
  `docs/v4/design-*.md` or `docs/v4/plan-*.md` file. If neither
  exists, use the current `apps/mobile` implementation and its tests
  as the baseline. Add a task-specific design doc before making a
  design change.

## Auth flows

- **No `setTimeout` in auth flows.** Use the OTP / state machine
  primitives — see Pitfall 12 in `docs/v4/pitfalls.md`.

## Animations

- **No bouncy springs.** Reset / release / dismiss animations must
  settle without overshoot. Use `withTiming` (typically
  `{ duration: 150–200 }`) for things like zoom-out, double-tap
  zoom-out, drag-to-dismiss release, sheet snap-back. Don't use
  `withSpring` for these — even a "lightly damped" spring reads as
  excessive bounce on photos and overlays. If a spring is genuinely
  the right curve (e.g. a deliberate tactile feel), justify it in the
  PR.

## Coverage gate

- 80%+ line coverage on `apps/mobile`. Run
  `pnpm --filter @harpa/mobile test`.
