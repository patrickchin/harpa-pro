# iOS account deletion design

Apple requires apps that support account creation to let users initiate
whole-account deletion inside the app. The option should be easy to find
in account settings, the consequences should be transparent, and the
flow should not require a support-only path for ordinary apps.

Sources:

- <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- <https://developer.apple.com/app-store/review/guidelines/>

## Route shape

Account deletion hangs off the current-user surface:

- `GET /me/deletion-preview` returns the signed-in user's email and a
  conservative summary of what deletion will do.
- `DELETE /me` recomputes the same server-side facts and deletes the
  authenticated account. It returns `204`.

The endpoint is authenticated and must use the same per-request scoped
Postgres accessor as the rest of `/me`.

## Data semantics

The API deletes the better-auth `public."user"` row, which cascades
auth sessions, linked auth accounts, user settings, user limit override
rows, and personal file rows with existing foreign keys. It also
deletes the user's LLM usage events and verification rows for that
email.

Project data is handled to preserve shared work and owner invariants:

- Projects where the deleting user is the only member are deleted.
- Shared projects where the deleting user is the only owner are
  transferred to the oldest remaining member, then the deleting user's
  membership is removed.
- Shared projects that already have another owner simply lose the
  deleting user's membership.
- Reports and notes authored by the user remain inside shared projects
  as project records for the remaining members. The deleting user's
  account, email, sessions, settings, usage events, and personal file
  rows are removed.

This is the least surprising App Store-compliant behavior for a
collaborative field-reporting app: personal account data is deleted,
solo work disappears with the account, and shared customer/project
records are not destroyed out from under teammates.

## Mobile flow

The entry point belongs on the Account Details screen so it is easy to
find from Profile. The screen uses `AppDialogSheet`, not `Alert.alert`.

The first dialog warns that deletion is permanent, signs the user out
of all devices, deletes solo projects, and preserves shared projects for
remaining members. It requires the user to type their account email
before the destructive confirm button enables. On success the route
clears React Query and local image caches, then signs out locally and
lets the auth gate redirect.

Errors stay in the themed sheet and let the user retry or cancel.

## Test plan

API tests cover preview output, solo-project deletion, shared-project
ownership transfer, editor/member removal, session revocation, and a
scope pair proving `DELETE /me` only affects the caller.

Mobile tests cover the destructive entry point, email confirmation gate,
success callback, pending copy, and themed error state.
