# Report edit modal redesign

**Status:** ✅ Shipped (commit f43565e5 + e2e in 4337fd32) · **Date:** 2026-06-03 · **Branch:** `agents/report-edit-modal-redesign`

## Problem

Editing a saved draft report today happens through a separate **Edit** tab on
`saved-report.tsx`. That tab mounts the monolithic `ReportEditForm` — every
field for every section in one long ScrollView, autosaving on every keystroke.
It works, but:

- It's a context switch away from the report you're trying to edit.
- All sections are visible whether you care about them or not.
- The same component is gated behind a developer flag in the _generate_
  flow (`showGenerateEditTab`), so the UX is inconsistent.
- A previous iteration in v3 used per-card pencil buttons that flipped each
  card into edit mode in place. That got visually noisy and is what we're
  replacing.

## Goal

Bring back per-card pencil buttons on the saved-report read view, but instead
of inline editing, tapping a pencil opens a **full-screen modal** that edits
just that section. Mobile space is limited; whatever the user is editing
should own the screen.

## Scope

In scope:

- Saved draft reports (`screens/saved-report.tsx`).
- The generate flow (`screens/generate-notes.tsx`) — same per-card pencil →
  modal experience on the Report tab. The dev-flagged `Edit` tab on that
  screen is removed (the `showGenerateEditTab` flag becomes a no-op for the
  tab bar; cleanup of the flag itself is a follow-up so we don't churn the
  developer screen).
- Removing the saved-report `Edit` tab.
- New full-screen modal shell + per-kind edit bodies that reuse the existing
  immutable edit helpers in `lib/reports/report-edit-helpers.ts`.

Out of scope:

- Removing the generate flow's `EditTabPane` from the pager / `'edit'` from
  `TAB_ORDER`. The pane is no longer reachable via the tab bar but is left
  mounted to keep the provider's well-tested `tabs.openEdit` contract intact.
  Future PR can clean these up alongside `showGenerateEditTab`.
- Adding new entries (new issue / new detailed section). The existing
  whole-form Edit tab was the escape hatch; once the tab is gone, reports
  can only edit and delete existing items in those two lists. A follow-up
  will add an "Add" affordance.
- Any change to autosave wiring on the saved-report screen — `onChangeReport`
  keeps its current contract.

## UX

### Pencil placement

Each read-view card grows a small pencil icon button at the top right of its
header (slotted into `SectionHeader.trailing` where one exists; otherwise into
the local layout). `SummaryLead` and `WeatherStrip` are not `Card`s today, so
they each get a trailing pencil added to their existing top row.

Mapping (one pencil per row unless noted):

| Read view card                      | Modal title    | What it edits                                                        |
| ----------------------------------- | -------------- | -------------------------------------------------------------------- |
| `SummaryLead`                       | Summary & meta | `meta.title`, `meta.visitDate`, `meta.summary`                       |
| `WeatherStrip`                      | Weather        | `weather.*`                                                          |
| `WorkersCard`                       | Workers        | `workers.totalWorkers` + full `workers.roles` list (add/edit/remove) |
| `MaterialsCard`                     | Materials      | full `materials` list (add/edit/remove)                              |
| `IssuesCard` — **per item**         | Issue          | one issue (all fields + Delete)                                      |
| `NextStepsCard`                     | Next steps     | full `nextSteps` list (add/edit/remove)                              |
| `SummarySectionCard` — **per item** | Section title  | one detailed section (title + content + Delete)                      |

`StatBar` is derived; no pencil.

### Modal behaviour

- Full-screen React Native `<Modal>` with `presentationStyle="fullScreen"` on
  iOS and the default on Android. We're not adding an Expo Router route — the
  modal is local UI owned by `saved-report.tsx`.
- Top bar: a left-aligned **X** (cancel), centered title, right-aligned
  **Save** button. Save is disabled when the draft equals the initial value.
- Body: `KeyboardAvoidingView` + `ScrollView` containing the per-kind form.
- Cancel:
  - if the draft is unchanged → close immediately;
  - if dirty → `AppDialogSheet` confirm "Discard changes?" before closing.
- Save: calls `onSave(draft)` and closes. The screen applies the edit through
  the existing immutable helpers, calls `onChangeReport(next)` once, and the
  parent's autosave hook (`use-report-body-autosave`) handles the rest.
- `Alert.alert` is **not** used (hard rule).

### Tab removal

`ReportDetailTabBar` loses the `Edit` tab. The screen body's
`activeTab === 'edit'` branch (`<View testID="saved-report-edit-pane">…`) is
removed. The autosave-status header that lived above the form moves into the
modal as a small footer/header indicator (only when applicable; the modal's
own Save button is the primary signal, so the autosave status string stays
where it already lives in the saved-report header chrome — no new wiring).

## Architecture

### New files

- `apps/mobile/components/reports/edit/EditSectionSheet.tsx` — reusable
  full-screen modal shell. Generic in the draft type:

  ```ts
  export interface EditSectionSheetProps<T> {
    visible: boolean;
    title: string;
    initialValue: T;
    onCancel: () => void;
    onSave: (next: T) => void;
    children: (draft: T, setDraft: (next: T) => void) => ReactNode;
    testID?: string;
  }
  ```

  Owns: draft state (seeded from `initialValue` when `visible` flips
  `false → true`), dirtiness check (deep-equal via `JSON.stringify` — same
  approach the existing screen uses to compare reports), Cancel-with-confirm
  dialog, Save button enable/disable, `KeyboardAvoidingView` wrapping, and
  the top bar layout.

- `apps/mobile/components/reports/edit/bodies/` — one file per kind, each a
  pure controlled component (`{ value, onChange }`). The forms are extracted
  ~verbatim from the relevant blocks of `ReportEditForm.tsx`:
  - `EditMetaBody.tsx` — title + visit date + multiline summary.
  - `EditWeatherBody.tsx`
  - `EditWorkersBody.tsx` — totalWorkers + roles list (add/remove rows).
  - `EditMaterialsBody.tsx`
  - `EditNextStepsBody.tsx`
  - `EditIssueBody.tsx` — single issue + a destructive **Delete this issue**
    button at the bottom that calls a `onDelete` prop on the modal.
  - `EditSectionBody.tsx` — single detailed section + **Delete this section**.

  Per-item bodies (`EditIssueBody`, `EditSectionBody`) take an `onDelete?: ()
=> void` so the modal can render Delete in its top bar / body and still flow
  through the same Save/Cancel state machine. Delete also closes the modal.

- `apps/mobile/components/reports/edit/types.ts` — discriminated union for
  what's being edited:

  ```ts
  export type ReportEditTarget =
    | { kind: 'meta' }
    | { kind: 'weather' }
    | { kind: 'workers' }
    | { kind: 'materials' }
    | { kind: 'nextSteps' }
    | { kind: 'issue'; index: number }
    | { kind: 'section'; index: number };
  ```

- `apps/mobile/components/reports/edit/ReportEditModal.tsx` — switches on the
  `ReportEditTarget` and mounts the correct body inside `EditSectionSheet`.
  Centralizes the seed/apply/delete logic so each card doesn't need to know
  about the helpers.

### Edited files

- `apps/mobile/screens/saved-report.tsx`
  - Add `editing: ReportEditTarget | null` state.
  - Pass `onEdit` callbacks to each card.
  - Replace the `activeTab === 'edit'` branch with the always-visible read
    view; mount `<ReportEditModal />` at the screen level.
  - Drop the autosave-status header that wrapped the old Edit tab pane.
  - On modal save, compute `next` via the existing helpers, call
    `setLocalReport(next)` and `onChangeReport(next)` exactly as
    `handleEditChange` does today.

- `apps/mobile/components/reports/detail/ReportDetailTabBar.tsx`
  - Remove the `'edit'` tab and its label/icon. The remaining tabs are
    `'report'` and `'notes'`.
  - Update `ReportDetailTab` union type accordingly.

- Read-view cards add an optional `onEdit?: () => void` prop and render a
  pencil button when supplied:
  - `apps/mobile/components/reports/IssuesCard.tsx` — per-item: each row gets
    its own pencil; `IssuesCardProps` gains `onEditIssue?: (index: number) =>
void`.
  - `apps/mobile/components/reports/SummarySectionCard.tsx` — per-item:
    `onEdit?: () => void`.
  - `apps/mobile/components/reports/WorkersCard.tsx`
  - `apps/mobile/components/reports/MaterialsCard.tsx`
  - `apps/mobile/components/reports/NextStepsCard.tsx`
  - `apps/mobile/components/reports/WeatherStrip.tsx`
  - `apps/mobile/components/reports/detail/SummaryLead.tsx`
  - `apps/mobile/components/reports/ReportView.tsx` — accept and forward an
    `onEdit?: (target: ReportEditTarget) => void` prop.

- `apps/mobile/components/reports/generate/ReportTabPane.tsx` keeps calling
  `<ReportView />` without `onEdit`. The pencils don't render in the generate
  flow.

### Data flow

```
ReportView (read-only cards)
  ├── card.onEdit() ──► saved-report.setEditing({ kind, index? })
ReportEditModal (visible when editing != null)
  └── EditSectionSheet
        └── <Body value=… onChange=… />
              ▲ Save ─► applyEdit(localReport, target, draft) ─► onChangeReport
              ▲ Delete (per-item only) ─► applyDelete(...) ─► onChangeReport
              ▲ Cancel ─► (dirty? confirm) ─► setEditing(null)
```

`applyEdit` / `applyDelete` are tiny pure functions in
`ReportEditModal.tsx` (or alongside, in `report-edit-modal-helpers.ts` if it
keeps the modal file slim) that wrap the existing helpers in
`lib/reports/report-edit-helpers.ts`:

```
meta       → updateMeta(report, draft)
weather    → updateWeather(report, draft)
workers    → updateWorkers(report, draft)
materials  → setMaterials(report, draft)
nextSteps  → setNextSteps(report, draft)
issue, i   → setIssues(report, replaceAt(issues, i, draft))
                  delete: setIssues(report, removeAt(issues, i))
section, i → setSections(report, replaceAt(sections, i, draft))
                  delete: setSections(report, removeAt(sections, i))
```

## Error handling

The modal does no I/O. Save is purely a state hand-off; persistence and
error-handling stay in the existing autosave hook. The modal closes on Save
regardless of network state, matching today's behaviour. If the draft is
invalid (e.g. blank section title), Save remains enabled — the existing
helpers/back-end already accept partial values, and we don't add validation
here. The dirty-cancel confirm uses `AppDialogSheet`.

## Testing

Component tests (Vitest + React Native Testing Library):

- `EditSectionSheet.test.tsx`
  - Save is disabled when draft equals initial.
  - Typing flips Save to enabled.
  - Save fires `onSave` with the current draft and closes.
  - Cancel without dirty closes immediately.
  - Cancel when dirty opens the confirm dialog; confirming closes; declining
    keeps the modal open.

- One body smoke test per kind (covers field wiring), e.g.
  `EditIssueBody.test.tsx`: typing into severity flows into `onChange`.

- `saved-report.test.tsx` updates:
  - Edit tab no longer rendered.
  - Tapping the issue-row pencil opens the modal with the issue's fields
    populated.
  - Saving an edited title calls `onChangeReport` with a report whose
    `issues[i].title` equals the new value.
  - Tapping Delete on a per-item modal calls `onChangeReport` with that item
    removed.

Existing tests touched:

- `apps/mobile/screens/saved-report.test.tsx` — drop the `'edit' tab` case;
  add modal cases.
- Any snapshot for `ReportDetailTabBar` re-recorded.

Maestro:

- `.maestro/helpers/edit-report-cards.yaml` drives the generated draft through
  every per-card edit modal body on Android: meta, weather, issue, workers,
  materials, next steps, and detailed section.
- `WeatherStrip` keeps rendering an editable empty-state card when `onEdit`
  is present, so sparse generated drafts can still open the Weather modal.
- `.maestro/modules/11-generate-finalize.yaml` runs that helper after
  generation and before finalize, then leaves the report finalized so the
  debug module's precondition stays intact.

## Migration notes

Nothing user-data-shaped changes. The autosave wire format is identical.
Reports created before/after this change are interchangeable.

## Open questions

None at design time. The "no Add affordance" gap is captured under Scope and
will be revisited.

## Acceptance contract

- [ ] Saved draft reports show a pencil on each editable card; tapping it
      opens a full-screen modal scoped to that card's data.
- [ ] Issues and Detailed Sections show one pencil per item.
- [ ] The modal has X / title / Save in the top bar; dirty-cancel confirms;
      clean-cancel closes immediately.
- [ ] Per-item modals (issue, detailed section) have a Delete button that
      removes that item and closes the modal.
- [ ] Saved-report `Edit` tab is removed; the tab bar shows Report and Notes
      only.
- [ ] The generate flow is unchanged.
- [ ] No new `Alert.alert` calls; everything goes through `AppDialogSheet`.
- [ ] All existing saved-report tests pass; new modal tests pass.
