# Report Edit Tab (Manual Editing)

> **Status: STRIPPED IN P1 — FUTURE REDESIGN ONLY.** This screen is temporarily removed from the v3 app. The Edit tab will be re-added in a future phase under a new design. This doc is provided for future reference and design continuity only.

**Route:** `app/(app)/projects/[projectId]/reports/generate.tsx` → Edit tab (removed; component ReportEditForm.tsx remains but unreferenced)
**Reference screenshot:** ../../../apps/docs/public/screenshots/09-report-edit.png (legacy; design will change)
**v3 source:** apps/mobile-v3/components/reports/ReportEditForm.tsx (dormant)
**Mobile-old source:** [`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md) — `===== FILE: apps/mobile-old/components/reports/generate/EditTabPane.tsx =====` (line 616)

## Purpose

[DEFERRED] Allow manual editing of report fields when the AI-generated version needs corrections. Edit mode shows a form with all report sections editable: project meta, title, report type, visit date, summary, weather, workers, materials, issues, next steps, and free-form sections. Auto-save status badge ("Saving…" / "Saved") was shown in header.

## Layout (top → bottom)

1. **Header row**: "Edit report" label + autosave status badge ("Saving…" / "Saved" / empty) on the right. `flex-row items-center justify-between px-5 pt-2 pb-1`.

2. **Form** (ScrollView flex-1):
   - Project metadata section (read-only or editable?): title, type, visit date.
   - Summary text field: multiline input.
   - Weather section: conditions, temperature, wind, impact fields.
   - Workers section: total count, roles list (each with role name + count), hours, notes.
   - Materials section: list of items, each with name + quantity + unit + status + condition + notes.
   - Issues section: list of issues, each with title + category + severity + status + details + action-required.
   - Next steps: list of action item text fields, add/remove buttons.
   - Free-form sections: list of custom section title + content blocks, add/remove buttons.

3. **Save button** (was autosave; manual save for v3?): Only enabled when form state is dirty. On success, clear dirty state and show "Saved" badge.

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `ReportEditForm` | Functional | `report: GeneratedSiteReport`, `onChange: (updated: GeneratedSiteReport) => void`. Maintains internal form state for each field. |
| Form fields | Input / TextInput / Picker | One for each report property: meta, summary, weather.*, workers.*, materials[], issues[], nextSteps[], sections[]. |
| Status badge | Text | Reads `draft.isAutoSaving` / `draft.lastSavedAt` state. |

## Interactions

- **Edit field**: Tap input → edit value. On change, call onChange handler.
- **Add item**: Tap "+ Add material" / "+ Add issue" / etc. → append blank item to list.
- **Remove item**: Tap trash icon on list item → remove from list.
- **Auto-save** (or manual save for v3): Debounce field changes; POST updated report body to backend. Show "Saving…" while request is pending, then "Saved" on success. On error, show error banner.

## Data shown

- **Project meta**: title, type (single/daily/weekly), visit date (date picker).
- **Summary**: freeform text.
- **Weather**: conditions (text), temperature (text), wind (text), impact (text).
- **Workers**: total on site (number), roles (list of { role: text, count: number }), worker hours (text), notes (text).
- **Materials**: list of { name, quantity, quantityUnit, status, condition, notes }.
- **Issues**: list of { title, category, severity (picker), status (picker), details (text), actionRequired (text) }.
- **Next steps**: list of { text }.
- **Free-form sections**: list of { title, content (text) }.

## Visual tokens

[DEFERRED] Use Unistyles tokens matching the rest of the app:
- Form background: `theme.colors.card` (card inputs), `theme.colors.secondary` (section backgrounds).
- Text: `theme.colors.foreground` (label) / `theme.colors.mutedForeground` (hint).
- Buttons: secondary variant for "+ Add" buttons; destructive for remove/trash.
- Spacing: `px-5` (form padding), `gap-3` (list items), `mt-4` (form sections).

## Acceptance checklist

- [ ] DEFERRED — Edit tab is removed from v3 P1; no implementation needed yet.
- [ ] ReportEditForm component file remains in place (apps/mobile-v3/components/reports/ReportEditForm.tsx) but is not referenced.
- [ ] v3 guide for "Edit a report manually" in apps/docs/content/guides.ts has a "(temporarily removed — redesign in progress)" banner.
- [ ] Future redesign will address form layout, field validation, auto-save UX, and conflict handling (what if user edits while AI is regenerating?).
