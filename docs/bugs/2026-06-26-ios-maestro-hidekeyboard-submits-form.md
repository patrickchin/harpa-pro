# 2026-06-26 - iOS Maestro hideKeyboard can submit or fail on focused inputs

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local iOS Simulator `.maestro/regression-journey.yaml`
failed in module 01 at `btn-onboarding-submit`. After pre-onboarding the
test accounts to continue, it failed again in module 02 at
`btn-save-project`. A later full rerun then failed in
`modules/08-text-notes.yaml` because `hideKeyboard` could not dismiss the
focused multiline `input-note`. The next rerun exposed the same command-level
failure in `helpers/edit-report-cards.yaml` after editing a full-screen report
modal field.
A subsequent module 14 check exposed the destructive variant: after the
delete-account dialog accepted the exact confirmation email, `hideKeyboard`
submitted account deletion before the flow could tap Cancel.

**Root cause.** On iOS, `hideKeyboard` can complete the form action before
the following explicit `tapOn` command runs. The failure screenshots showed
the app had already navigated to the destination screen: Projects after
onboarding, then the project home after project creation. Maestro then looked
for the original button on the previous screen and failed because the button
was gone. For RN multiline text inputs, XCTest can also fail the
`hideKeyboard` command itself even when the Add button or modal header action
is still visible above the software keyboard.

**Fix.** Match the already-working `core-end-to-end.yaml` pattern: after
`hideKeyboard`, wrap submit/save taps in a conditional `runFlow` that only
taps when the button is still visible, then assert the destination screen.
Applied to the modular local/dev regression paths and the current top-level
flows that create/onboard accounts. For `input-note`, do not call
`hideKeyboard` before saving. Tap `btn-add-note` while it is visible above the
keyboard, then swipe the notes list down to trigger
`keyboardDismissMode="on-drag"` and restore the generate screen chrome.
For full-screen report edit modals, skip `hideKeyboard` and tap the visible
header Cancel/Save action directly.
For cancellable destructive dialogs, do not type the exact confirmation value
unless the flow intends to submit. For flows that do intend to submit, guard
the explicit destructive tap with `runFlow` because `hideKeyboard` may have
already fired it.

**Test.** Reproduced with four iOS Simulator runs on iPhone 17 Pro / iOS 26.5.
The first failed at `btn-onboarding-submit`; the second passed module 01 and
failed at `btn-save-project`, confirming the same pattern on project creation.
The third passed modules 01 through 07 and failed at `input-note`
`hideKeyboard`, confirming the multiline input failure mode. The fourth passed
modules 01 through 10c and failed at weather edit modal `hideKeyboard`,
confirming the modal-input variant.

**Pattern.** Treat `hideKeyboard` on iOS forms as an action that may submit,
not just a passive keyboard dismissal. Follow it with conditional submit taps
and a destination assertion instead of an unconditional tap.
For multiline note entry, prefer Add-while-visible plus a downward list swipe
over `hideKeyboard`.
For full-screen modals with visible header actions, tap the header action
directly after text input.
For destructive confirmation inputs, avoid exact confirmation values in
cancellation smoke tests; otherwise `hideKeyboard` can turn the smoke test
into the destructive path.
