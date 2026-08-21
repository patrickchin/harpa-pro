# Design — mobile developer-tools production gate

Status: accepted for implementation.

## Problem

The mobile app already treats developer surfaces as available when either
`__DEV__` or `EXPO_PUBLIC_USE_FIXTURES` is true. The saved-report debug action
and a few test-only project affordances use that rule, but Profile always shows
Developer and the `/developer` and report-debug routes accept direct
navigation in every build.

The current comments also refer to `DEV_TOOLS_VISIBLE`, which is not an
environment variable in this repository. This leaves several locally correct
checks without one enforceable policy and lets a production bundle reach
developer UI and start its queries through a deep link.

## Decision

Define one mobile build-time policy in
`apps/mobile/lib/config/developer-tools.ts`:

```text
show developer tools = __DEV__ OR EXPO_PUBLIC_USE_FIXTURES
```

The module exports a pure boolean helper for the policy truth table and one
derived constant for application code. `__DEV__` is read only in this module;
the fixture value comes from the Zod-parsed `env` object. No new environment
variable is introduced.

This preserves both intended non-production workflows:

- ordinary development bundles expose the tools through `__DEV__`;
- fixture bundles expose them even when compiled without `__DEV__`, so the
  Maestro report-debug journey remains usable.

`EXPO_PUBLIC_USE_FIXTURES` remains a bundle-time mobile input flag. It does not
select API replay and changing it still requires a rebuild.

## Surface behavior

All mobile developer surfaces consume the shared policy:

- Profile passes the policy to `Profile.showDeveloperSection`; production no
  longer renders the Developer row.
- The saved-report route passes the policy to the actions menu and omits its
  debug callback when the policy is false.
- `/developer` redirects a disallowed direct navigation to Profile.
- `/projects/{project}/reports/{number}/debug` redirects a disallowed direct
  navigation to the saved report. Invalid route parameters fall back to
  Projects.
- The Generate screen shows and queries its Debug tab only when both the
  persisted `showGenerateDebugTab` preference and the build policy are true.
  A value left in AsyncStorage by a development build cannot expose the tab in
  production.

The unused `showDeveloperSection` prop on Project Home and its duplicated env
check are removed. A no-op prop must not imply that a surface is protected.

## Route and query contract

Route gates follow recurring-bug Pattern R3: every hook is called before any
conditional `<Redirect />` return. In particular, `/developer` still calls
`useRouter`, `useAiProvider`, and `useDeveloperFlags`, and report debug still
calls `useRouter`, `useLocalSearchParams`, and `useReportDebugQuery` in a stable
order on every render.

Stable hook order does not mean hidden routes may perform hidden work:

- `useAiProvider` accepts an `enabled` option and forwards it to the
  `/settings/ai` query. The developer route passes the build policy.
- The direct report-debug route includes the build policy in the generated
  query hook's `enabled` predicate.
- The Generate route includes the build policy as well as the persisted tab
  preference and valid route parameters in its debug-query predicate.

Mutation hooks may still be created while `/developer` is disallowed, but the
screen that can invoke them is not rendered. No read or write request is sent
from either disallowed direct route.

## Intentional API exposure

This is a mobile product-surface gate, not an API authorization boundary.

- `GET` and `PATCH /settings/ai` remain authenticated, self-scoped production
  APIs. The CLI also exposes AI settings, so removing or environment-gating
  these endpoints would be a separate product change.
- `GET /projects/{project}/reports/{number}/debug` remains an authenticated,
  read-only production API for project members, including viewers. It is used
  by report diagnostics and the dashboard live-AI parity check. Existing
  member scope and non-member `404` behavior remain unchanged.

The mobile app therefore provides defense in depth against accidental
discovery and queries. Any decision to reduce server-side debug access must be
designed separately because it changes the public contract and existing
diagnostic consumers.

## Regression coverage

Tests stay outside `apps/mobile/app/` per recurring-bug Pattern R4.

Required focused coverage:

1. A pure truth-table test proves production is the only hidden combination:
   both flags are false; development, fixtures, or both make it true.
2. Profile route coverage proves the screen receives the shared policy rather
   than an unconditional value.
3. A `/developer` route test proves a disallowed build renders Redirect, does
   not render `Developer`, and passes `enabled: false` to the AI-settings read.
4. A report-debug route test proves a disallowed direct link renders Redirect
   and calls `useReportDebugQuery` with `enabled: false`.
5. Route re-render tests cross the denied and allowed branches without a
   Rules-of-Hooks error. These tests must fail if a future early return moves
   ahead of a hook.
6. `useAiProvider` coverage proves `enabled: false` sends no fetch and the
   existing enabled path still reads and writes settings.
7. Generate coverage pins both halves of the gate: a persisted true preference
   does not render or query Debug in production, while a dev or fixture build
   can render and query it.
8. Saved-report coverage proves the production actions menu has no Report
   Debug row and no active navigation callback.

The existing fixture-mode Maestro report-debug module remains green. Store or
production smoke coverage should assert that Profile has no Developer row; it
must not deep-link into hidden routes merely to prove the redirect.

## Documentation updates

The implementation updates the gap descriptions in
`arch-mobile-navigation.md`, `arch-p2-6-app-shell.md`, and
`design-maestro-full-regression.md` to describe the resolved shared gate.
Source comments that name the nonexistent `DEV_TOOLS_VISIBLE` value are updated
to name the shared policy module instead.

## Acceptance

- A production mobile bundle cannot navigate to a developer screen through UI
  or a direct link and sends no developer-route query while redirecting.
- Development and fixture bundles retain Profile, Generate Debug, saved-report
  Report Debug, and both direct routes.
- Hook order is invariant across gate branches.
- The API contract and authorization behavior are unchanged.
- Focused tests, mobile typecheck, mobile lint, and the docs-link check pass.
