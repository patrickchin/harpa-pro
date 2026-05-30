# 2026-05-24 — Android back gesture required two presses on every nested screen because `useNavigation()` in a layout returns the parent navigator

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** On Android, swiping/pressing back inside any nested
screen (e.g. `projects/[id]`) showed the "Press back again to exit"
toast and required a second press to actually navigate back.
The double-press behaviour was supposed to apply only at the app
root (when back would otherwise close the app).

**Root cause.** `app/(app)/_layout.tsx` called
`useNavigation()` and gated the toast on `navigation.canGoBack()`.
In expo-router, `useNavigation()` called inside a layout returns the
**parent** navigator's navigation object — i.e. the root layout's
stack, NOT the `<Stack>` defined inside this same layout. The parent
navigator has nothing to pop, so `canGoBack()` is always `false`,
making every back press hit the "at root" branch.

**Fix.** Use `router.canGoBack()` from `expo-router`
(`useRouter()`), which inspects the global router state across all
nested navigators. Commit on this branch.

**Test.** `__tests__/layouts/app-layout.test.tsx` —
`Android back handler` block: mocks `useRouter` so `canGoBack()`
returns `true` (nested) vs `false` (root), exercises the handler
registered on `BackHandler`, and asserts the toast / return value
in each case.

**Pattern.** New variant of misuse of layout-level navigation
hooks — prefer `useRouter()`+`router.canGoBack()` over
`useNavigation().canGoBack()` whenever the question is "could the
user navigate back anywhere in the app", not "can THIS navigator
pop". Captured here rather than as a new Rn because it's a
one-call-site lesson.
