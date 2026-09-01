# 2026-08-21 — mobile developer tools exposed in production

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** An ordinary production mobile bundle showed the Developer row in
Profile, accepted direct links to `/developer` and report diagnostics, and
could start the routes' read queries. A persisted Generate Debug preference
could also survive from a development build without an overriding build gate.

**Root cause.** Developer visibility was enforced by several local checks
rather than one policy. Profile was unconditional, direct routes trusted their
navigation entries, and one dead Project Home prop made the coverage appear
broader than it was.

**Fix.** Derive one policy from `__DEV__ || EXPO_PUBLIC_USE_FIXTURES`, use it at
every mobile navigation and query boundary, redirect hidden or invalid deep
links, remove the Generate Debug selector and pane when hidden, and remove the
dead prop. The authenticated API contracts remain unchanged.

**Test.** A pure truth table pins the build policy. Route rerender tests use real
React hook markers to prove stable hook order, redirects, strict report-number
validation, and disabled queries. Screen tests cover Profile, saved-report
actions, and complete Generate Debug removal with a safe active-tab fallback.
Tests live outside `app/` so Expo Router cannot bundle them.

**Pattern.** The exposure itself did not match an existing numbered pattern.
The regression deliberately covers R3 (feature-gate redirects must preserve
hook order) and R4 (route tests stay outside `app/`).
