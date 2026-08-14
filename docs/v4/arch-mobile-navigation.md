# Mobile navigation policy

> **Status: implemented.** This document describes the current Expo
> Router graph and back-stack rules. It supersedes the former Tabs and
> phone-auth route design.

## Route graph

The root layout renders a `Slot`. Each route group owns its Stack.

```text
app/
  index.tsx
  (auth)/
    _layout.tsx
    sign-in/email.tsx
    sign-in/code.tsx
    onboarding.tsx
    e2e-password-login.tsx
  (app)/
    _layout.tsx
    projects/index.tsx
    projects/new.tsx
    projects/[project]/index.tsx
    projects/[project]/edit.tsx
    projects/[project]/members.tsx
    projects/[project]/reports/index.tsx
    projects/[project]/reports/[number]/generate.tsx
    projects/[project]/reports/[number]/index.tsx
    projects/[project]/reports/[number]/notes.tsx
    projects/[project]/reports/[number]/debug.tsx
    profile.tsx
    account.tsx
    usage.tsx
    developer.tsx
    p/[project].tsx
    r/[report].tsx
  (camera)/
    _layout.tsx
    capture.tsx
```

Route groups do not add a URL segment. For example,
`(app)/projects/[project]/index.tsx` maps to `/projects/{project}`.

## Shell model

The protected application uses a single headerless Stack. It does not
use an Expo Router `Tabs` navigator. Each screen renders its own
`ScreenHeader`; `AppHeaderActions` adds a Profile shortcut.

The camera group uses a separate full-screen modal Stack. Entering that
group can unmount the protected Stack, so the camera session stores an
explicit `returnTo` URL.

## Authentication redirects

The route layouts derive redirects from `useAuthSession()`:

| Session state      | Protected group             | Authentication group                |
| ------------------ | --------------------------- | ----------------------------------- |
| `loading`          | Show the shell loader.      | Keep the Stack mounted.             |
| `unauthenticated`  | Redirect to email sign-in.  | Permit the auth route.              |
| `needs-onboarding` | Redirect to onboarding.     | Redirect to onboarding when needed. |
| `authenticated`    | Permit the protected route. | Redirect to Projects.               |

Email entry pushes the code route so Back returns to the email field.
Successful code verification and onboarding replace with `/`. The
root route then redirects to Projects.

`e2e-password-login` exists for non-production test accounts. The
screen rejects the production application variant.

## Push, replace, and dismiss rules

Use navigation operations by intent:

| Intent                                                      | Operation                         | Example                                  |
| ----------------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| Open a child or peer screen that Back should undo           | `router.push`                     | Project to Members; Profile to Usage     |
| Finish a one-way authentication step                        | `router.replace`                  | Code verification to `/`                 |
| Resolve a short or universal link                           | `router.replace`                  | `/p/{slug}` to the canonical project URL |
| Return from an explicit Back control                        | `safeBack`                        | Account to Profile                       |
| Return to an existing parent after deletion or finalization | `dismissOrReplaceTo`              | Deleted report to the reports list       |
| Return from camera capture                                  | Stored `returnTo`, then `replace` | Camera to the generating report          |

Do not use `replace` to return to a parent that may already sit below
the current route. That can create two adjacent copies of the parent.
Use `dismissOrReplaceTo()` for this case.

Do not call raw `router.back()` from a screen that can open through a
deep link. Use `safeBack(router, fallback)` so a cold Stack has a known
destination.

## Canonical and short URLs

Canonical application URLs identify a project by its prefixed project
ID and a report by its project-local number:

```text
/projects/{project}
/projects/{project}/reports/{number}
```

Short links use the resolver routes:

```text
/p/{project-slug}
/r/{report-slug}
```

Each resolver loads the canonical identifiers from the API and
replaces itself. A failed resolution offers a replacement to Projects.
This keeps resolver routes out of Back history.

Production and preview builds include the associated-domain and App
Link settings from `apps/mobile/app.config.ts`. Development builds omit
iOS associated domains to avoid simulator code-signing requirements.

## Android hardware Back

`(app)/_layout.tsx` installs one hardware Back handler:

1. If `router.canGoBack()` is true, React Navigation handles Back.
2. At the Stack root, the first press shows a toast.
3. A second press within two seconds exits the app.

Use Expo Router's `router.canGoBack()`. A parent React Navigation
object can report the wrong history for nested Expo Router screens.

## Camera return contract

Callers create a camera session with a `returnTo` URL and then push the
capture route. The capture screen commits the URI list to the registry.
It then replaces with `returnTo`. The caller drains the session after
focus returns and submits the files to the upload queue.

If no valid session exists, the capture route calls `safeBack` with
`/` as the fallback.

## Developer route gap

The current Profile route always shows its Developer section and
always links to `/developer`. The Generate-screen Debug tab is an opt-in
flag stored in AsyncStorage. Generate has no Edit tab; draft report editing
opens from the Report pane's per-card controls.

This behavior differs from the original rule that required a
development or fixture gate around all developer surfaces. Treat the
route exposure as an open implementation decision. Navigation tests
must describe the current unconditional link until product code adds a
gate.

## Review checklist

For each new navigation call:

1. Decide whether Back must return to the caller.
2. Test a normal in-app entry.
3. Test a cold deep-link entry when the route is linkable.
4. Use a fallback for every explicit Back control.
5. Use `dismissOrReplaceTo` after a destructive child mutation.
6. Keep authentication redirects in group layouts.
7. Add or update a route test and the relevant Maestro module.

Relevant tests include:

- `apps/mobile/lib/nav/dismiss-or-replace.test.ts`
- `apps/mobile/lib/auth/auth-gate.test.ts`
- route-level screen tests under `apps/mobile/screens/`
- `.maestro/regression-journey.yaml`
