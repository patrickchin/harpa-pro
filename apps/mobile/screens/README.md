# `apps/mobile/screens/`

Props-driven body components — one per shipped screen.

## Why this directory exists

Every screen the v4 app ships lives here as a presentational component
that takes typed props and has **no** API / auth / persistence
dependencies of its own. Two thin route files mount each body:

- `app/(auth|app)/<path>.tsx` — the real route. Wires real hooks
  (auth session, generated React Query hooks, navigation params)
  and passes them as props.
- `app/(dev)/<name>.tsx` — the dev mirror. Imports the same body
  with hand-crafted mock props. Listed in the dev gallery
  (`app/(dev)/index.tsx`) for fast manual visual review against
  `../haru3-reports/apps/mobile@dev`.

This is the canonical workflow for catching cosmetic drift
([Pitfall 3](../../../docs/v4/pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design))
— there is no automated screenshot-diff gate.

## Body component rules

- Accept all data, callbacks, and navigation params as **typed props**.
- No `lib/api/*`, no `useAuthSession`, no `expo-secure-store`,
  no `useRouter().push` for primary navigation (accept an
  `onNavigate` callback instead).
- Modals, sheets, tabs, form-local state, and `goBack()` are
  allowed and expected to work inside the body.
- No `Alert.alert` (rule #9). Use `AppDialogSheet`.
- Snapshot test + behaviour tests per interaction live next to
  the body file.

See [`docs/v4/prompts/page-template.md`](../../../docs/v4/prompts/page-template.md)
for the per-screen port prompt.
