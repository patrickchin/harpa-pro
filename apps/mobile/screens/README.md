# `apps/mobile/screens/`

Props-driven body components — one per shipped screen.

## Why this directory exists

Each screen the v4 app ships lives here as a presentational component
that takes typed props and has **no** API / auth / persistence
dependencies of its own. A thin route file mounts each body:

- `app/(auth|app)/<path>.tsx` — the real route. Wires real hooks
  (auth session, generated React Query hooks, navigation params)
  and passes them as props.

The body/route split keeps screens testable in isolation (snapshot
+ behaviour tests run against the body with mock props, no Hono /
network / native modules required) and makes per-screen wiring
errors land in the thin route file where they're easy to spot.

> Note: the `app/(dev)/<name>.tsx` dev-gallery mirrors that used to
> live alongside each route were removed once UI parity stopped
> being a goal (see `docs/v4/plan-p3-feature-build.md`). The
> body/route split itself remains useful and is still required for
> new screens.

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
