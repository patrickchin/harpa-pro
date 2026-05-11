# Report Tab (Draft & Finalized)

> **Prompt for design tool:** The Report tab displays an AI-generated site report as a vertical card stack. The composition order is: StatBar (key metrics) → WeatherStrip (weather conditions) → Summary text → IssuesCard (severity color-coded) → WorkersCard (horizontal bar chart) → MaterialsCard (material list with metadata) → NextStepsCard (numbered action items) → "Summary Sections" header + free-form SummarySectionCard list. At the top, CompletenessCard warns about missing data. During generation, skeleton placeholders animate. Empty state (no report yet) shows CompletenessCard skeleton + "Tap Generate report on the Notes tab to build this report" (Edit manually button removed in P1). Error banner with Retry button on failure.

**Route:** `app/(app)/projects/[projectId]/reports/generate.tsx` → Report tab
**Reference screenshot:** ../../../apps/docs/public/screenshots/08-report-generation.png
**v3 source:** apps/mobile-v3/components/reports/ReportView.tsx
**Mobile-old source:** [`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md) — `===== FILE: apps/mobile-old/components/reports/ReportView.tsx =====` (line 2028), component library lines 1562–2028 (StatBar, WeatherStrip, SummarySectionCard, IssuesCard, WorkersCard, MaterialsCard, NextStepsCard, CompletenessCard)

## Purpose

Display the AI-generated report in a read-only, card-based layout. Each card focuses on one domain (weather, workers, materials, issues, next steps, free-form sections). Cards auto-generate on the fly; user can regenerate or edit via Notes tab or (future) dedicated Edit tab. Completeness warnings help user identify missing data to capture before finalizing.

## Layout (top → bottom)

1. **Error banner** (if `generation.error` truthy): `InlineNotice tone="danger"` with error text + secondary `Retry` button (icon RotateCcw).
   
2. **Generating shimmer** (if `generation.isUpdating && !generation.report`): `InlineNotice tone="info"` "Generating your report from the notes collected so far…" + 4 shimmer placeholder cards (`h-20 rounded-lg bg-secondary` Animated FadeIn).

3. **Updating banner** (if `generation.isUpdating && generation.report` exists): `InlineNotice tone="info"` "Updating the draft with your newest notes…"

4. **StatBar** — horizontal flex row, 3 tiles (or more):
   - Component: `StatTile` (compact variant).
   - Data: getReportStats(report) — returns array of { value (number/string), label (string), tone ('warning' | 'default') }.
   - E.g., "5 Issues", "3 Workers", "8 Materials".
   - Each tile: number + label stacked, `gap-3` between tiles, `FadeIn.duration(250)` animation.

5. **WeatherStrip** — single Card (variant="default" padding="md"):
   - Conditional: `if (!weather) return null`.
   - Layout: First item (conditions) as a row with Cloud icon + text (full-width, text-sm font-medium). Below that, remaining items (temperature, wind) as flex-wrap row with soft badges (rounded-md bg-surface-muted px-3 py-2, icon + text).
   - If weather.impact exists: "Impact: {text}" as secondary text (text-sm text-muted-foreground).

6. **Summary text Card** (if `report.meta.summary` exists):
   - Card variant="default" padding="lg".
   - SectionHeader with title "Summary" + icon FileText.
   - Body: `mt-4 text-base leading-relaxed text-muted-foreground` (the summary text).

7. **IssuesCard** (if `issues.length > 0`):
   - Card variant="default" padding="lg".
   - SectionHeader with title "Issues" + AlertTriangle icon + trailing badge (soft-bg warning with count).
   - Body: `mt-4 gap-4` vertical list of issues:
     - Each issue: `flex-row gap-3`.
     - Left: 4px `rounded-full` stripe (color depends on severity: danger-border / warning-border / border).
     - Right (flex-1):
       - Title (text-base font-semibold text-foreground) + severity badge (soft-bg rounded-md px-2.5 py-1.5, uppercase tracking-wider, color danger-text / warning-text / muted-foreground).
       - Metadata: category + status (text-sm text-muted-foreground, joined with " · ").
       - Details: (text-base leading-relaxed text-muted-foreground).
       - If actionRequired: soft-yellow box (border-warning-border bg-warning-soft p-3) with "→ {actionRequired}" text (text-base font-medium text-warning-text).
     - Divider (border-t border-border pt-4) between items (except first).

8. **WorkersCard** (if `workers` object exists):
   - Card variant="default" padding="lg".
   - SectionHeader with title "Workers" + Users icon + subtitle "N on site." or "Crew breakdown recorded.".
   - Body: `mt-4 gap-3` list of roles:
     - Each role: rounded-md bg-surface-muted px-3 py-3, flex-row justify-between:
       - Left: role name (text-base text-foreground).
       - Right: count (text-base font-medium text-muted-foreground).
     - Below: horizontal bar chart `h-2 overflow-hidden rounded-full bg-secondary` with inner bar `h-2 rounded-full bg-foreground` width=`{(count/maxCount)*100}%`.
   - If workerHours: "Hours: {text}" (text-base text-muted-foreground).
   - If workers.notes: "{notes}" (text-base text-muted-foreground).

9. **MaterialsCard** (if `materials.length > 0`):
   - Card variant="default" padding="lg".
   - SectionHeader with title "Materials" + Package icon + subtitle "N material(s) recorded.".
   - Body: `mt-4 gap-3` list:
     - Each material: rounded-md bg-surface-muted px-3 py-3.
     - Name (text-base font-medium text-foreground).
     - Metadata from getItemMeta([quantity, quantityUnit, status, condition]) (text-sm text-muted-foreground).
     - If notes: (text-sm text-muted-foreground) `mt-1`.

10. **NextStepsCard** (if `steps.length > 0`):
    - Card variant="default" padding="lg".
    - SectionHeader with title "Next Steps" + ClipboardList icon + subtitle "N follow-up action(s).".
    - Body: `mt-4 gap-3` list:
      - Each step: `flex-row items-start gap-3`.
      - Left: number "1." / "2." (text-base font-semibold text-foreground, min-w-[18px]).
      - Right: step text (text-base leading-relaxed text-muted-foreground, flex-1).

11. **Summary Sections** (if `sections.length > 0`):
    - Header: "Summary Sections" label (text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground, `mt-1`).
    - List of `SummarySectionCard`:
      - Card variant="default" padding="lg" (each).
      - SectionHeader with icon (ClipboardList or per SECTION_ICONS) + section.title.
      - Body: `mt-4` section content text (text-base text-muted-foreground).

12. **CompletenessCard** (if missing fields detected):
    - Card variant="emphasis" (soft warning styling).
    - SectionHeader title "Still missing (N)" + subtitle "Add a note about the topics below to complete the report." + AlertTriangle icon.
    - Body: `mt-3 flex-row flex-wrap gap-2` list of missing-field badges:
      - Each: `flex-row items-center gap-1.5 rounded-md border-warning-border bg-warning-soft px-3 py-2`.
      - Icon (field.icon 12px warning-text) + label (text-sm font-semibold uppercase tracking-wider text-warning-text).

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `StatBar` | Functional | `report: GeneratedSiteReport`. Returns `getReportStats(report)` → array of { value, label, tone }. |
| `WeatherStrip` | Functional | `report: GeneratedSiteReport`. Renders weather properties conditionally. |
| `IssuesCard` | Functional | `issues: readonly GeneratedReportIssue[]`. Each issue has title, category, severity, status, details, actionRequired. |
| `WorkersCard` | Functional | `workers: GeneratedReportWorkers | null`. Has totalWorkers, roles[], workerHours, notes. |
| `MaterialsCard` | Functional | `materials: readonly GeneratedReportMaterial[]`. Each has name, quantity, quantityUnit, status, condition, notes. |
| `NextStepsCard` | Functional | `steps: readonly string[]`. List of numbered action items. |
| `SummarySectionCard` | Functional | `section: GeneratedReportSection`. Has title, content. |
| `CompletenessCard` | Functional | `report: GeneratedSiteReport`. Calls `getMissingFields(report)` to determine which fields need data. |
| `ReportView` | Functional | `report: GeneratedSiteReport`. Orchestrates all cards in the correct order. |

## Interactions

- **Error banner**: Tap Retry → `handleRegenerate()` (retrigger generation).
- **Cards**: Read-only; no tap interactions in draft. (Future Edit tab or inline edit can change this.)
- **Edit manually button** (old): **(REMOVED in v3 P1)** — no longer appears. If no report, show empty state message "Tap Generate report on the Notes tab to build this report".
- **Scrolling**: ScrollView fills flex-1, contentContainerStyle paddingBottom=100 to keep action row out of tap area.

## Data shown

- **Stats**: Count of issues, workers, materials, next steps, etc. (from getReportStats).
- **Weather**: Conditions (main), temperature, wind (compact badges below), impact note.
- **Issues**: Title + severity badge (danger/warning/neutral color) + category/status metadata + details + action callout.
- **Workers**: Role name + count + horizontal bar chart (pct = (count/maxCount)*100%) + hours + notes.
- **Materials**: Name + quantity/unit/status/condition metadata + notes.
- **Next steps**: Numbered 1. 2. 3. … text list.
- **Free-form sections**: Custom title + content blocks.
- **Completeness**: List of missing field names (Visit date, Weather, Workers, Materials, Issues, Next steps).

## Visual tokens

Use Unistyles tokens only:
- Container: `theme.colors.background` (page), `theme.colors.card` (card bg).
- Text: `theme.colors.foreground` (primary), `theme.colors.mutedForeground` (secondary).
- Severity stripes (IssuesCard): `theme.colors.dangerBorder` / `theme.colors.warningBorder` / `theme.colors.border`.
- Severity badges: danger-soft / warning-soft / secondary (bg) + danger-text / warning-text / muted-foreground (text).
- Bars (WorkersCard): `theme.colors.foreground` (full bar) over `theme.colors.secondary` (bg).
- Spacing: `gap-3` (card list), `mt-4` (card content), `px-3 py-3` (material/role rows).
- Radii: `theme.radii.lg` (cards), `theme.radii.md` (material bg, badges).
- Icons: 16px in SectionHeader, 14px secondary, 12px in badges.

## Acceptance checklist

- [ ] StatBar renders 3+ stat tiles with dynamic data.
- [ ] WeatherStrip shows conditions as full-width row, temp/wind as soft badges.
- [ ] IssuesCard renders severity stripe + title + severity badge + metadata + details + action box.
- [ ] WorkersCard shows role name + count + horizontal bar chart with correct percentage.
- [ ] MaterialsCard lists materials with metadata and notes.
- [ ] NextStepsCard shows numbered 1. 2. 3. … action items.
- [ ] SummarySectionCard renders free-form section title + content.
- [ ] CompletenessCard appears only when missing fields exist; lists them as badges.
- [ ] Empty state (no report yet): shows "Tap Generate report on the Notes tab to build this report" message instead of "Edit manually" button.
- [ ] Generating state: shows shimmer placeholders + info banner.
- [ ] Updating state: shows info banner while streaming new data.
- [ ] Error state: shows error banner with Retry button.
- [ ] All cards animate in with FadeIn when appearing.
