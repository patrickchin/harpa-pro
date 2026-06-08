# Mobile text & label audit findings

> Style guide: [`style-guide.md`](./style-guide.md). Every recommendation in
> this doc cites a style-guide section by anchor.
>
> Format per file:
>
> - **Findings** — table with columns `Current` | `Recommended` | `Reason`
>   (style-guide anchor).
> - **Gaps** — bullet list. Flagged only when clearly missing: silent failure
>   paths, icon-only controls without `accessibilityLabel`, lists without empty
>   states, async UI without loading/error state, destructive actions without
>   confirmation copy.
> - `**No findings.**` is a valid section body.
>
> Recommendations show the proposed string only; applying them may require
> swapping JS quote style (e.g. single → double quotes) to handle apostrophes.
> That code-level concern is out of scope here.

## (auth)

### `apps/mobile/app/(auth)/onboarding.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Please enter your full name.'` | `'Enter your full name.'` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |
| `'Please enter your company name.'` | `'Enter your company name.'` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |
| `'Failed to save profile.'` | `"Couldn't save profile. Try again."` | [Error messages](./style-guide.md#error-messages) |

**Gaps**

- Form inputs (full name, company) have no `accessibilityLabel` — VoiceOver will fall back to placeholder. ([Accessibility labels](./style-guide.md#accessibility-labels))

### `apps/mobile/app/(auth)/sign-in/email.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Please enter a valid email address.'` | `'Enter a valid email address.'` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/app/(auth)/sign-in/code.tsx`

**No findings.**

### `apps/mobile/app/(auth)/e2e-password-login.tsx`

**No findings.**

### `apps/mobile/app/(auth)/_layout.tsx`

**No findings.**

### `apps/mobile/screens/onboarding.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Saving...'` | `'Saving…'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/screens/auth-email.tsx`

**No findings.**

### `apps/mobile/screens/auth-code.tsx`

**No findings.**

## (app) — account, profile, usage, developer

### `apps/mobile/app/(app)/account.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not save profile.'` (line 48) | `"Couldn't save profile. Try again."` | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/app/(app)/profile.tsx`

**No findings.** Props-only wrapper.

### `apps/mobile/app/(app)/usage.tsx`

**No findings.** Props-only wrapper.

### `apps/mobile/app/(app)/developer.tsx`

> Dev-only — lower priority.

**No findings.** Props-only wrapper.

### `apps/mobile/screens/account.tsx`

**No findings.**

### `apps/mobile/screens/profile.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Loading your account details...'` (line 174) | `'Loading your account details…'` | [Loading & skeleton states](./style-guide.md#loading--skeleton-states) |

### `apps/mobile/screens/usage.tsx`

**Gaps**

- Line 307: empty state `'No usage data yet. Generate your first report to see stats here.'` combines headline + prompt in one run-on. Split: headline `'No usage data yet'` + subtext `'Generate your first report to see stats here.'` ([Empty states](./style-guide.md#empty-states))

### `apps/mobile/screens/developer.tsx`

> Dev-only — lower priority.

**No findings.**

### `apps/mobile/components/account/AvatarUploader.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not upload avatar'` (line 127) | `"Couldn't upload avatar."` | [Error messages](./style-guide.md#error-messages) |
| `'Photo library permission denied'` (line 89) | `'Photos access is off. Open Settings to allow.'` | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/components/account/UsageLimitDialog.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `"You've used ${usedLimit} ${kindLabel} this month."` (line 56) | `"You've used ${usedLimit} ${kindLabel}."` | [Dialog & sheet copy](./style-guide.md#dialog--sheet-copy) |
| `'Your limit resets on ${resetLabel}. To keep working before then, please upgrade your plan or contact support.'` (line 59) | `'Your limit resets on ${resetLabel}. Upgrade your plan or contact support to keep working.'` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/components/account/UsageLimitsCard.tsx`

**No findings.**

## (app) — projects

### `apps/mobile/app/(app)/projects/new.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Failed to create project.'` (line 15) | `"Couldn't create project. Check your connection."` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/screens/project-new.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `label="Project Name"` | `label="Project name"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `label="Project Address"` | `label="Project address"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `label="Client Name"` | `label="Client name"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `'Create Project'` | `'Create project'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/screens/project-edit.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `title="Edit Project"` (lines 127, 138) | `title="Edit project"` | [Screen titles & headers](./style-guide.md#screen-titles--headers) |
| `label="Project Name"` | `label="Project name"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `label="Project Address"` | `label="Project address"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `label="Client Name"` | `label="Client name"` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |
| `title="Use delete carefully"` | `title="Heads up"` | [Dialog & sheet copy](./style-guide.md#dialog--sheet-copy) |
| `'Delete Project'` | `'Delete project'` | [Button labels](./style-guide.md#button-labels) |
| `'Save Changes'` | `'Save changes'` | [Button labels](./style-guide.md#button-labels) |
| `fallbackMessage: 'Failed to delete project.'` (line 83) | `fallbackMessage: "Couldn't delete project. Try again."` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

**Gaps**

- Lines 184–187: destructive-action notice copy is too long. Tighten to one sentence stating consequence + irreversibility. ([Dialog & sheet copy](./style-guide.md#dialog--sheet-copy))

### `apps/mobile/screens/projects-list.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `accessibilityLabel="Add new project"` | `accessibilityLabel="Add project"` | [Accessibility labels](./style-guide.md#accessibility-labels) |
| `'Add new project'` (line 103) | `'Add project'` | [Voice & tone](./style-guide.md#voice--tone) |

### `apps/mobile/screens/project-home.tsx`

**No findings.**

### `apps/mobile/screens/project-members.tsx`

**No findings.** Role tokens (`Owner`/`Editor`/`Viewer`) render in badges where capitalization is the platform convention.

## (app) — reports

### `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not delete the note. Please try again.'` (line 217) | `"Couldn't delete note."` + a separate `Try again` action | [Error messages](./style-guide.md#error-messages) |
| `'Could not update the note. Please try again.'` (line 238) | `"Couldn't update note."` + a separate `Try again` action | [Error messages](./style-guide.md#error-messages) |
| `'Could not save the note. Please try again.'` (line 256) | `"Couldn't save note."` + a separate `Try again` action | [Error messages](./style-guide.md#error-messages) |
| `` `${failed} of ${outcome.total} photo${outcome.total === 1 ? '' : 's'} failed to upload. Open the report queue to retry.` `` (line 523) | Hoist ternary into a `pluralize(n, 'photo')` helper; keep the rest. | [Numbers, dates & units](./style-guide.md#numbers-dates--units) |
| `'Could not pick photos.'` (line 534) | `"Couldn't pick photos."` | [Error messages](./style-guide.md#error-messages) |
| `` `${failed} of ${allUris.length} photo${allUris.length === 1 ? '' : 's'} failed to upload. Open the report queue to retry.` `` (line 556) | Hoist ternary into a `pluralize(n, 'photo')` helper; keep the rest. | [Numbers, dates & units](./style-guide.md#numbers-dates--units) |

### `apps/mobile/app/(app)/r/[report].tsx`

**Gaps**

- `handleConfirmDelete` (line 206) has `catch {}` with `TODO(P4)` — delete failure is silent and the confirm sheet stays open. Surface an inline error or toast. ([Error messages](./style-guide.md#error-messages))
- `handleConfirmUnfinalize` (line 222) has the same silent-`catch` pattern. ([Error messages](./style-guide.md#error-messages))

### `apps/mobile/screens/reports-list.tsx`

**No findings.**

### `apps/mobile/screens/saved-report.tsx`

**No findings.** Props-only wrapper.

### `apps/mobile/screens/generate-notes.tsx`

**No findings.** Props-only wrapper.

### `apps/mobile/screens/report-notes.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Failed to load notes'` | `"Couldn't load notes"` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/screens/saved-report.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Failed to load report'` (line 357) | `"Couldn't load report"` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/components/notes/NoteTimeline.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `` `Could not load notes: ${error.message}` `` (line 135) | `` `Couldn't load notes: ${error.message}` `` | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/screens/report-debug.tsx`

> Dev-only — lower priority.

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Failed to load debug data.'` | `"Couldn't load debug data."` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/components/reports/MaterialsCard.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `` `${materials.length} material${materials.length === 1 ? '' : 's'} recorded.` `` | Hoist ternary into a `pluralize(n, 'material')` helper. | [Numbers, dates & units](./style-guide.md#numbers-dates--units) |

### `apps/mobile/components/reports/PdfPreviewModal.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not generate PDF.'` (line 75) | `"Couldn't generate PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Could not share the PDF.'` (line 98) | `"Couldn't share PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Could not open the PDF.'` (line 114) | `"Couldn't open PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Could not display PDF.'` (line 203) | `"Couldn't display PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Generating PDF...'` | `'Generating PDF…'` | [Button labels](./style-guide.md#button-labels) |
| `'Sharing...'` | `'Sharing…'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/components/reports/detail/SavedReportSheet.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not generate PDF.'` (line 96) | `"Couldn't generate PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Opening PDF...'` | `'Opening PDF…'` | [Button labels](./style-guide.md#button-labels) |
| `'Sharing PDF...'` | `'Sharing PDF…'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/components/reports/detail/ReportActionsMenu.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Saving PDF...'` | `'Saving PDF…'` | [Button labels](./style-guide.md#button-labels) |
| `'Sharing PDF...'` | `'Sharing PDF…'` | [Button labels](./style-guide.md#button-labels) |
| `'Unfinalizing...'` | `'Unfinalizing…'` | [Button labels](./style-guide.md#button-labels) |
| `'Deleting...'` | `'Deleting…'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/components/reports/generate/GenerateReportDialogs.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not attach the file to this report.'` (line 37) | `"Couldn't attach file."` | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/components/reports/generate/GenerateReportInputBar.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Type a site note...'` | `'Type a site note…'` | [Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text) |

### `apps/mobile/components/reports/generate/ReportTabPane.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Generating your report from the notes collected so far...'` | `'Generating your report from the notes collected so far…'` | [Loading & skeleton states](./style-guide.md#loading--skeleton-states) |
| `'Updating the draft with your newest notes...'` | `'Updating the draft with your newest notes…'` | [Loading & skeleton states](./style-guide.md#loading--skeleton-states) |

### Other report components

**No findings** for `CompletenessCard.tsx`, `NextStepsCard.tsx`, `WeatherStrip.tsx`, `detail/ReportDetailTabBar.tsx`, `detail/ReportNotesPane.tsx`, `detail/DocumentNoteRow.tsx`, `generate/GenerateReportActionRow.tsx`, `generate/NotesTabPane.tsx`, `generate/EditTabPane.tsx`, `edit/bodies/EditWorkersBody.tsx`, `edit/bodies/EditMaterialsBody.tsx`. Existing copy is sentence case, uses U+2026, and surfaces clear empty states.

## (camera)

### `apps/mobile/app/(camera)/capture.tsx`

**Gaps**

- Lines 114–127: permission-blocked dialog tells the user to open Settings but the action button is `'OK'`, which dismisses. Replace with `'Open Settings'` as the primary action and `'Not now'` as the secondary so the dialog provides the path forward. ([Dialog & sheet copy](./style-guide.md#dialog--sheet-copy))

### `apps/mobile/screens/camera-capture.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `accessibilityLabel={`Save to gallery: ${saveToCameraRoll ? 'on' : 'off'}`}` (line 598) | `accessibilityLabel="Save to gallery"` (rely on `accessibilityState={{ checked }}` for state) | [Accessibility labels](./style-guide.md#accessibility-labels) |
| `'Keep editing'` (line 723) | `'Cancel'` | [Dialog & sheet copy](./style-guide.md#dialog--sheet-copy) |

**Gaps**

- Line 616: flash-mode `accessibilityLabel` interpolates raw state values (`off` / `auto` / `on`, all lowercase). VoiceOver reads "Flash off". Wrap the value in a sentence-cased label map. ([Accessibility labels](./style-guide.md#accessibility-labels))

## Shared components

### `apps/mobile/lib/dialogs/app-dialog-copy.ts`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `title: 'Delete Draft'` (line 23) | `title: 'Delete draft'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Delete Project'` (line 35) | `title: 'Delete project'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Delete Report'` (line 48) | `title: 'Delete report'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Finalize Report'` (line 60) | `title: 'Finalize report'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Unfinalize Report'` (line 73) | `title: 'Unfinalize report'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Remove Member'` (line 86) | `title: 'Remove member'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Delete Voice Note'` (line 98) | `title: 'Delete voice note'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Delete Note'` (line 110) | `title: 'Delete note'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `title: 'Delete File'` (line 122) | `title: 'Delete file'` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case) |
| `confirmLabel: 'Finalize Report'` (in `getFinalizeReportDialogCopy`) | `confirmLabel: 'Finalize report'` | [Button labels](./style-guide.md#button-labels) |

### `apps/mobile/lib/dialogs/DialogSheetProvider.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `label: 'OK'` (line 116) | `label: 'Done'` | [Dialog & sheet copy](./style-guide.md#dialog--sheet-copy) |

### `apps/mobile/lib/reports/use-report-pdf-actions.ts`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not generate PDF.'` (lines 85, 153, 154) | `"Couldn't generate PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Could not open the saved PDF.'` (line 102) | `"Couldn't open the saved PDF."` | [Error messages](./style-guide.md#error-messages) |
| `'Could not share the saved PDF.'` (line 124) | `"Couldn't share the saved PDF."` | [Error messages](./style-guide.md#error-messages) |
| `title: 'Export Failed'` (line 152) | `title: "Couldn't export PDF"` | [Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case), [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |

### `apps/mobile/lib/reports/export-report-pdf.ts`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Could not open the saved PDF. Use Share PDF to choose another app.'` (line 30) | `"Couldn't open the saved PDF. Tap Share PDF to choose another app."` | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/lib/api/client.ts`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `message: 'Failed to parse JSON response'` (line 208) | `message: "Couldn't read server response."` (only flag if this message ever surfaces to users via `error.message`; otherwise leave as a developer string) | [Error messages](./style-guide.md#error-messages) |

### `apps/mobile/app/_layout.tsx`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `'Something went wrong'` (line 96) | `"The app hit an error. Pull to retry, or restart the app."` | [Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation) |
