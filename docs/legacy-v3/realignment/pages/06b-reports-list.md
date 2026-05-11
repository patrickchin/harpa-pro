# Reports List

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a paginated reports list within a project. Top bar: "Reports" title, project name subtitle, back button. Below: a dashed-outline "New report" header card (Plus icon, subtitle "Start a draft for this project.", testID="btn-new-report"). FlatList of report cards: status badge (draft/saved), date, title. Use warm-paper palette. Output iOS sizing, list scrolling.

**Route:** `/(app)/projects/[projectId]/reports`
**Reference screenshot:** (none)
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/[projectId]/reports/index.tsx

## Purpose
Display all reports (draft and saved) for a project. New report card to start a draft. Tap a report to view or edit (draft) / view only (saved).

## Layout (top → bottom)
1. **Header** — "Reports" title (left), project.name subtitle, back button
2. **New report card** — Dashed border, Plus icon, text "New report", subtitle "Start a draft for this project.", testID="btn-new-report", filled variant (not muted)
3. **Reports list** — FlatList of ReportCard components, testID="report-row-{status}-{index}", shows status badge (draft/saved), date, title, tappable

## Components
| Component | Type | Props / state |
|---|---|---|
| ScreenHeader | ScreenHeader (ui) | title="Reports", subtitle={project.name}, onBack |
| Add card | Pressable + View | testID="btn-new-report", dashed border, Plus icon, subtitle text |
| ReportCard | ReportCard (ui) | testID="report-row-{status}-{index}", status badge, date, title |
| FlatList | FlatList (RN) | data={reports}, ListHeaderComponent={addCard}, onRefresh, refreshing |

## Interactions
- Tap New report card → Call `createReport.mutate()`, navigate to generate screen with reportId
- Tap report card (draft) → Navigate to generate screen with reportId
- Tap report card (saved) → Navigate to report detail (read-only) screen with reportId
- Pull-to-refresh → Refetch reports

## Data shown
- reports array — from `useReports(projectId)`, mixed status (draft / saved)
- project.name — from `useProject()`
- report.status — draft or saved, affects navigation and styling
- createReport.isPending — show loading state on add card

## Visual tokens
- Background: `theme.colors.background`
- Add card: dashed border `theme.colors.border`, Plus icon `theme.colors.mutedForeground`
- Report card: delegated to ReportCard component (tbd)
- Status badge: (tbd, likely draft=warning tone, saved=default)

## Acceptance checklist
- [ ] "New report" dashed header card visible (testID="btn-new-report")
- [ ] Subtitle "Start a draft for this project." shown on add card
- [ ] Report cards render with testID="report-row-{status}-{index}"
- [ ] Tap add card creates report and navigates to generate screen
- [ ] Tap draft report navigates to generate screen
- [ ] Tap saved report navigates to detail screen (read-only)
- [ ] Pull-to-refresh reloads reports
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
