# 2026-05-17 — invite-member form auto-closes on submit, hiding the API error (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A failed `POST /projects/:slug/members` invite (e.g.
the invited phone has no account → 404 "User not found.") looked
identical to a successful one from the user's perspective: the
invite form collapsed back to the "Add member" CTA with no error
notice visible. The Members list stayed empty and the user had no
clue why. First caught by `core-end-to-end.yaml` Maestro flow,
which expected the invited user to show up under "Editor" filter.

**Root cause.** `screens/project-members.tsx` had:

```tsx
onAdd={(input) => {
  onAddMember(input);
  if (!addError) setShowAdd(false);
}}
```

`onAddMember` triggers a TanStack mutation (async). `addError` is
read from the *current* render's props — which is `null` because
the mutation hasn't completed yet. So the form unconditionally
closes on submit, hiding the error notice that arrives on the
next render. Classic stale-state-in-an-event-handler bug.

**Fix.** Drive the close from the *route*, not from inside the
form. The mutation hook's `onSuccess` increments an
`addSuccessNonce` counter passed to the screen; an effect there
closes the form when the nonce changes. On failure, `nonce` does
not change, the form stays open, and the error notice renders
normally. Same PR adds two regression tests in
`screens/project-members.test.tsx`: one for the form-stays-open
path on error, one for the form-closes path on success.

**Test.** `screens/project-members.test.tsx` —
"keeps invite form open when the mutation fails (error stays visible)"
and "closes invite form when addSuccessNonce increments (success)".
Plus the Maestro `core-end-to-end.yaml` flow that originally
exposed the bug.

**Pattern.** R5 (default wiring broken, only DI-stubbed tests
pass). The existing screen-level test asserted the form's
behaviour with `addError={null}` and never combined it with a
post-submit close, so the synchronous stale read sailed through.
