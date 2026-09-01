# Report Title Consistency + Finalized Layout Cleanup — Implementation Plan

> **Status: historical working plan.** The checkboxes preserve the state of
> this plan when it was written. They are not the current backlog. Check the
> current implementation and `docs/v4/` before using any step.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the report title consistently across the reports list, draft/generate screen, and finalized screen; show the per-project report number in small text alongside; remove the dead one-pill tab bar on finalized.

**Architecture:** Pure mobile-side change. The list endpoint already returns the report `body` (and therefore `meta.title`); no API or DB changes needed. The shared rule `title = meta.title?.trim() || "Report #N"` is applied in three places, with `#N` always rendered as small text alongside. The finalized `ReportDetailTabBar` is removed and the Report pane renders directly.

**Tech Stack:** React Native (Expo), NativeWind v4, vitest + react-test-renderer.

**Spec:** [`docs/v4/design-report-title-consistency.md`](../../v4/design-report-title-consistency.md).

---

## File map

| File                                                           | Change      | Responsibility                                                                                                                             |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/lib/projects/project-reports-list.ts`             | modify      | Extend `ReportListItem` with structural `body?` field; rewrite `getReportTitle` + `getReportMeta` to apply the new rule.                   |
| `apps/mobile/lib/projects/project-reports-list.test.ts`        | **create**  | Unit-test the two helpers across the three states (no body, body with title, optimistic row irrelevant — covered by isOptimisticReportId). |
| `apps/mobile/screens/reports-list.tsx`                         | (no change) | Already calls `getReportTitle` / `getReportMeta`.                                                                                          |
| `apps/mobile/screens/reports-list.test.tsx`                    | modify      | Adjust snapshot assertions for the new title/meta.                                                                                         |
| `apps/mobile/features/generate/GenerateReportProvider.tsx`     | modify      | Change the `"New Report"` fallback to `Report #${reportNumber}`.                                                                           |
| `apps/mobile/screens/generate-notes.tsx`                       | modify      | Pass `subtitle={`#${reportNumber}`}` to `ScreenHeader`.                                                                                    |
| `apps/mobile/screens/generate-report-tab.test.tsx`             | modify      | Update the `reportTitle` fallback assertions.                                                                                              |
| `apps/mobile/components/reports/detail/ReportDetailHeader.tsx` | modify      | Apply title fallback, drop the report-type eyebrow + visit-date pill `<View>`, use `ScreenHeader` subtitle for `#N · {visit date}`.        |
| `apps/mobile/screens/saved-report.tsx`                         | modify      | Skip `ReportDetailTabBar` and the tab-switch ternary when `isFinal`; render the Report pane directly.                                      |
| `apps/mobile/screens/saved-report.test.tsx`                    | modify      | Add finalized-mode assertions (no tab bar, no eyebrow, title fallback).                                                                    |

---

## Task 1 — Helper rule + unit tests (TDD)

**Files:**

- Modify: `apps/mobile/lib/projects/project-reports-list.ts`
- Create: `apps/mobile/lib/projects/project-reports-list.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/mobile/lib/projects/project-reports-list.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { getReportTitle, getReportMeta, type ReportListItem } from './project-reports-list';

const base: ReportListItem = {
  id: 'rep_1',
  number: 7,
  status: 'draft',
  visitDate: '2026-05-20T00:00:00.000Z',
  createdAt: '2026-05-19T12:00:00.000Z',
  updatedAt: '2026-05-21T09:30:00.000Z',
};

describe('getReportTitle', () => {
  it('falls back to "Report #N" when body is absent', () => {
    expect(getReportTitle(base)).toBe('Report #7');
  });

  it('falls back to "Report #N" when meta.title is empty / whitespace', () => {
    expect(getReportTitle({ ...base, body: { meta: { title: '   ' } } })).toBe('Report #7');
  });

  it('uses meta.title when present', () => {
    expect(
      getReportTitle({
        ...base,
        body: { meta: { title: 'Highland Tower — Phase 2' } },
      }),
    ).toBe('Highland Tower — Phase 2');
  });

  it('trims a non-empty meta.title', () => {
    expect(
      getReportTitle({
        ...base,
        body: { meta: { title: '  Highland Tower  ' } },
      }),
    ).toBe('Highland Tower');
  });
});

describe('getReportMeta', () => {
  it('shows "#N · {visit date} · Draft" for a draft with visit date', () => {
    expect(getReportMeta(base)).toBe('#7 · May 20, 2026 · Draft');
  });

  it('falls back to createdAt when visitDate is null', () => {
    expect(getReportMeta({ ...base, visitDate: null })).toBe('#7 · May 19, 2026 · Draft');
  });

  it('shows "#N · {visit date} · Finalized {updatedAt}" for finalized', () => {
    expect(getReportMeta({ ...base, status: 'finalized' })).toBe(
      '#7 · May 20, 2026 · Finalized May 21, 2026',
    );
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `cd apps/mobile && pnpm test -- project-reports-list`
Expected: FAIL — `getReportTitle` currently returns `'Report #7 · May 20, 2026'`; `getReportMeta` returns `'Draft · in progress'`.

- [ ] **Step 3: Update the helpers**

Edit `apps/mobile/lib/projects/project-reports-list.ts`. Replace the existing `ReportListItem`, `getReportTitle`, and `getReportMeta` definitions with:

```ts
/**
 * Minimal structural shape of the body field returned by the
 * `/projects/{project}/reports` list endpoint. We only read
 * `meta.title` — everything else is irrelevant to the list row.
 */
type ListReportBody = {
  meta?: { title?: string | null } | null;
} | null;

export type ReportListItem = {
  id: string;
  number: number;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Optional `body` from the list endpoint. We only need
   * `body.meta.title` for the title heading — everything else is
   * read via the detail query. Absent on optimistic-create rows.
   */
  body?: ListReportBody;
};

/**
 * Title rule (see `docs/v4/design-report-title-consistency.md`):
 *   title = meta.title?.trim() || `Report #N`
 *
 * Applied identically on the list row, the draft header, and the
 * finalized header so all three surfaces agree.
 */
export function getReportTitle(r: ReportListItem): string {
  const metaTitle = r.body?.meta?.title?.trim();
  return metaTitle && metaTitle.length > 0 ? metaTitle : `Report #${r.number}`;
}

/**
 * Small-text meta line shown under the row title:
 *   #N · {visit date or created date} · {Draft | Finalized {updatedAt}}
 */
export function getReportMeta(r: ReportListItem): string {
  const dateIso = r.visitDate ?? r.createdAt;
  const visit = formatDate(dateIso);
  const status = r.status === 'draft' ? 'Draft' : `Finalized ${formatDate(r.updatedAt)}`;
  return `#${r.number} · ${visit} · ${status}`;
}
```

Leave `isOptimisticReportId`, `ReportSection`, and `buildReportsSections` unchanged.

- [ ] **Step 4: Run the helper tests and confirm they pass**

Run: `cd apps/mobile && pnpm test -- project-reports-list`
Expected: PASS — all 7 assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/projects/project-reports-list.ts \
        apps/mobile/lib/projects/project-reports-list.test.ts
git commit -m "refactor(reports): unify list-row title rule + add #N · date meta line

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2 — Reports list screen test fixes

**Files:**

- Modify: `apps/mobile/screens/reports-list.test.tsx`

- [ ] **Step 1: Inspect the existing assertions that mention `Report #` or the meta string**

Run: `cd apps/mobile && grep -n "Report #\|Draft · in progress\|· in progress" screens/reports-list.test.tsx`
Expected: a small number of lines (typically inside snapshot expectations or `expect(...).toContain(...)` checks). If none match by string, the assertions are snapshot-based and Step 2 covers them.

- [ ] **Step 2: Run the screen suite to see which expectations need updating**

Run: `cd apps/mobile && pnpm test -- screens/reports-list`
Expected: failures (if any) point at strings like `'Report #1 · May 19, 2026'` and `'Draft · in progress'`. Note each failure.

- [ ] **Step 3: Update the failing assertions**

For every assertion that hard-codes the old strings, replace with the new ones:

- `'Report #N · {date}'` → `'Report #N'` (title)
- `'Draft · in progress'` → `'#N · {date} · Draft'` (meta line)
- `'Finalized · {updatedAt}'` → `'#N · {visitDate} · Finalized {updatedAt}'`

If the failures are snapshot-based (`toMatchSnapshot`), delete the stale `.snap` content for the failing tests and re-run with `pnpm test -- screens/reports-list -u` to regenerate; then visually scan the regenerated snapshot diff before committing.

- [ ] **Step 4: Re-run the screen suite and confirm green**

Run: `cd apps/mobile && pnpm test -- screens/reports-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/screens/reports-list.test.tsx
# include any updated snapshot files under apps/mobile/screens/__snapshots__
git add -u apps/mobile/screens
git commit -m "test(reports-list): update assertions for new title + meta line

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3 — Draft / generate header fallback

**Files:**

- Modify: `apps/mobile/features/generate/GenerateReportProvider.tsx`
- Modify: `apps/mobile/screens/generate-notes.tsx`
- Modify: `apps/mobile/screens/generate-report-tab.test.tsx`

- [ ] **Step 1: Update the failing assertion first (TDD)**

In `apps/mobile/screens/generate-report-tab.test.tsx` locate the line:

```ts
reportTitle: 'Highland Tower',
```

That's the _non-fallback_ case and stays. **Add** a new test in the same file (right after the existing `describe('GenerateNotes — Report tab', () => { ... })` block):

```ts
describe('GenerateNotes — title fallback', () => {
  it('falls back to "Report #N" when no title is set', () => {
    const tree = render(
      <GenerateNotes {...baseProps} reportTitle={null} reportNumber={7} />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Report #7');
    expect(json).toContain('#7');
  });
});
```

If `baseProps` does not already declare `reportNumber`, add `reportNumber: 7,` to it (after the existing `reportTitle:` line). If `reportNumber` isn't a `GenerateNotesProps` field yet, this test will fail to type-check — that's expected and drives Step 3.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/mobile && pnpm test -- generate-report-tab`
Expected: FAIL — either a type error on `reportNumber` or the assertion `'Report #7'` not found (the current fallback renders `'New Report'`).

- [ ] **Step 3: Thread `reportNumber` into `GenerateNotesProps` and fix the fallback**

In `apps/mobile/features/generate/GenerateReportProvider.tsx`:

a. Add `reportNumber: number | null;` to `GenerateNotesProps` (it's already on the `props` destructure as a route-level value, but verify — search for `reportNumber` in the file). If `GenerateNotesProps` already declares it, skip.

b. Change line 702 from:

```ts
reportTitle: reportTitle?.trim() || 'New Report',
```

to:

```ts
reportTitle:
  reportTitle?.trim() ||
  (reportNumber !== null ? `Report #${reportNumber}` : 'New report'),
```

(The `'New report'` lowercase branch only fires on the brief route mount before `reportNumber` resolves; matches the optimistic list row.)

c. Also expose `reportNumber` on the context value if it isn't already (search for `reportNumber:` in the `useMemo` value — line ~701 area). It is already in the type — confirm it stays.

- [ ] **Step 4: Render the `#N` subtitle in the draft header**

In `apps/mobile/screens/generate-notes.tsx` line 120 area:

```ts
const { reportTitle, tabs } = useGenerateReport();
```

Add `reportNumber`:

```ts
const { reportTitle, reportNumber, tabs } = useGenerateReport();
```

Then update the `<ScreenHeader>` call (lines ~209-213) to pass a subtitle:

```tsx
<ScreenHeader
  title={reportTitle}
  subtitle={reportNumber !== null ? `#${reportNumber}` : undefined}
  onBack={onBack}
  backLabel="Reports"
  actions={actions}
  trailing={
    showDeleteOption ? (
      // ...unchanged
    ) : null
  }
/>
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd apps/mobile && pnpm test -- generate-report-tab`
Expected: PASS, including the new fallback test and the existing `'Highland Tower'` test (which still wins because `reportTitle` is non-empty).

- [ ] **Step 6: Run the broader generate suite for regressions**

Run: `cd apps/mobile && pnpm test -- features/generate screens/generate`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/features/generate/GenerateReportProvider.tsx \
        apps/mobile/screens/generate-notes.tsx \
        apps/mobile/screens/generate-report-tab.test.tsx
git commit -m "feat(generate): fall back to Report #N in draft header + add #N subtitle

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4 — Finalized header: title fallback + drop eyebrow + #N · date subtitle

**Files:**

- Modify: `apps/mobile/components/reports/detail/ReportDetailHeader.tsx`

- [ ] **Step 1: Rewrite `ReportDetailHeader.tsx`**

Replace the file contents with:

```tsx
/**
 * ReportDetailHeader — title + small `#N · {visit date}` subtitle +
 * Actions button row for the saved-report screen.
 *
 * Title rule (see `docs/v4/design-report-title-consistency.md`):
 *   title = report.meta.title?.trim() || `Report #N`
 *
 * The previous standalone visit-date pill and report-type eyebrow
 * have been folded into the subtitle so the title always anchors the
 * header (no more empty whitespace when `meta.title` is blank).
 */
import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react-native';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';
import { formatDate } from '@/lib/util/date';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface ReportDetailHeaderProps {
  report: GeneratedSiteReport;
  onBack: () => void;
  onOpenActions: () => void;
  actionsDisabled: boolean;
  actions?: ReactNode;
  /** Per-project report number — drives the `#N` subtitle + testID. */
  reportNumber?: number | null;
}

export function ReportDetailHeader({
  report,
  onBack,
  onOpenActions,
  actionsDisabled,
  actions,
  reportNumber,
}: ReportDetailHeaderProps) {
  const numStr = reportNumber ?? 'x';
  const rawTitle = report.report.meta.title?.trim();
  const title =
    rawTitle && rawTitle.length > 0
      ? rawTitle
      : reportNumber !== null && reportNumber !== undefined
        ? `Report #${reportNumber}`
        : 'Report';

  const visitDate = report.report.meta.visitDate;
  const subtitleParts: string[] = [];
  if (reportNumber !== null && reportNumber !== undefined) {
    subtitleParts.push(`#${reportNumber}`);
  }
  if (visitDate) {
    subtitleParts.push(formatDate(visitDate));
  }
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined;

  return (
    <View className="px-5 py-4">
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        backLabel="Reports"
        actions={actions}
        titleTestID={`report-title-${numStr}`}
      />

      <View className="mt-3 flex-row items-center justify-end">
        <Button
          variant="secondary"
          size="default"
          accessibilityLabel="Open report actions menu"
          testID="btn-report-actions"
          onPress={onOpenActions}
          disabled={actionsDisabled}
        >
          <View className="flex-row items-center gap-1.5">
            <MoreHorizontal size={16} color={colors.foreground} />
            <Text className="text-sm font-semibold text-foreground">Actions</Text>
          </View>
        </Button>
      </View>
    </View>
  );
}
```

Note: `toTitleCase` import is removed; verify no other usages remain in this file with `grep -n toTitleCase apps/mobile/components/reports/detail/ReportDetailHeader.tsx` (should return nothing).

- [ ] **Step 2: Type-check + run header-adjacent tests**

Run:

```bash
cd apps/mobile && pnpm tsc --noEmit
```

Expected: no new errors. Then:

```bash
pnpm test -- saved-report
```

Expected: failures pointing at the dropped eyebrow / pill — handled in Task 5.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/reports/detail/ReportDetailHeader.tsx
git commit -m "feat(reports/detail): title fallback + #N · date subtitle in header

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5 — Finalized screen: drop the one-pill tab bar

**Files:**

- Modify: `apps/mobile/screens/saved-report.tsx`
- Modify: `apps/mobile/screens/saved-report.test.tsx`

- [ ] **Step 1: Add the failing assertions**

Append to `apps/mobile/screens/saved-report.test.tsx`:

```tsx
describe('SavedReport — finalized layout', () => {
  it('does not render the tab bar when finalized', () => {
    const tree = render(
      <SavedReport
        {...finalizedDefaults}
        reportStatus="finalized"
        report={SAMPLE_GENERATED_REPORT}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('btn-tab-report');
    expect(json).not.toContain('btn-tab-notes');
    expect(json).not.toContain('btn-tab-edit');
  });

  it('falls back to "Report #N" when meta.title is empty', () => {
    const blank = {
      ...SAMPLE_GENERATED_REPORT,
      report: {
        ...SAMPLE_GENERATED_REPORT.report,
        meta: { ...SAMPLE_GENERATED_REPORT.report.meta, title: '' },
      },
    };
    const tree = render(
      <SavedReport
        {...finalizedDefaults}
        reportStatus="finalized"
        reportNumber={7}
        report={blank}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Report #7');
  });
});
```

If `finalizedDefaults` doesn't exist in the file, add it next to the existing `defaults` (it can be `{...defaults, reportStatus: 'finalized' as const}`). Reuse the imports already present.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/mobile && pnpm test -- saved-report`
Expected: FAIL — `btn-tab-report` is present (the one-pill tab bar still renders) and the empty-title case still renders an empty header.

- [ ] **Step 3: Skip the tab bar + short-circuit the Report pane when finalized**

In `apps/mobile/screens/saved-report.tsx` lines ~401-453 (the `<ReportDetailTabBar>` block and the `activeTab === 'report' ? ... : activeTab === 'edit' ? ... : ...` ternary), restructure to:

```tsx
{
  !isFinal ? (
    <ReportDetailTabBar
      activeTab={activeTab}
      onChange={setActiveTab}
      notesCount={notesCount}
      showEditTab={!isFinal}
      showNotesTab={!isFinal}
    />
  ) : null;
}

{
  !isFinal && activeTab === 'edit' ? (
    <View className="flex-row items-center justify-between px-5 pt-1 pb-1">
      <Text className="text-sm font-medium text-muted-foreground">Edit report</Text>
      <Text className="text-xs text-muted-foreground" testID="edit-autosave-status">
        {isAutoSaving ? 'Saving…' : lastSavedAt ? 'Saved' : ''}
      </Text>
    </View>
  ) : null;
}

{
  isFinal || activeTab === 'report' ? (
    <Animated.View entering={FadeIn.duration(250)} className="px-5" testID="saved-report-pane">
      <ReportView report={displayReport} reportNumber={reportNumber ?? undefined} />
      <View className="mt-4">
        <ReportPhotos noteRows={noteRows} onOpenPhoto={handleOpenPhoto} />
      </View>
    </Animated.View>
  ) : !isFinal && activeTab === 'edit' ? (
    <View className="px-5" testID="saved-report-edit-pane">
      <ReportEditForm report={displayReport} onChange={handleEditChange} />
    </View>
  ) : (
    <Animated.View entering={FadeIn.duration(250)}>
      <ReportNotesPane
        noteRows={noteRows}
        reportId={reportId ?? null}
        onOpenPhoto={handleOpenPhoto}
        isLoading={notesLoading}
      />
    </Animated.View>
  );
}
```

The existing `useEffect` that resets `activeTab` to `'report'` when `isFinal` stays — it's now belt-and-braces.

- [ ] **Step 4: Re-run the saved-report suite and confirm green**

Run: `cd apps/mobile && pnpm test -- saved-report`
Expected: PASS, including both new finalized-layout assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/screens/saved-report.tsx \
        apps/mobile/screens/saved-report.test.tsx
git commit -m "feat(reports/detail): drop one-pill tab bar on finalized reports

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6 — Documentation + verification

**Files:**

- Modify: `docs/v4/pitfalls.md` _only if_ you add a pitfall note (optional, see step).
- Verify: full mobile test suite + type-check.

- [ ] **Step 1: Run the full mobile test suite**

Run: `cd apps/mobile && pnpm test`
Expected: PASS. Investigate any failures end-to-end before moving on.

- [ ] **Step 2: Run type-check**

Run: `cd apps/mobile && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the repo lint (mobile workspace)**

Run: `cd apps/mobile && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Smoke check the design doc cross-link**

The design doc already lives at `docs/v4/design-report-title-consistency.md` (committed during brainstorming). Verify it's still linked from no other doc that needs updating: `grep -rn "design-report-title-consistency\|ReportDetailTabBar\|New Report" docs/v4 | head -20`. If any architecture doc references the old layout, update it; otherwise nothing to commit here.

- [ ] **Step 5: Final commit (if any docs changed)**

Only run if a doc actually changed in Step 4:

```bash
git add docs/v4
git commit -m "docs(reports): refresh references after title/finalized layout change

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Otherwise skip — the design doc commit already covers the docs-in-same-PR rule.

---

## Done criteria

- Reports list row shows the LLM/user title (or `Report #N`) as the heading, with `#N · {date} · {status}` underneath.
- Draft/generate header shows the LLM/user title (or `Report #N`), with `#N` underneath.
- Finalized header shows the LLM/user title (or `Report #N`), with `#N · {visit date}` underneath; no report-type eyebrow; no standalone visit-date pill.
- Finalized screen renders no tab bar; the Report pane + photos render directly under the header.
- `pnpm test`, `pnpm tsc --noEmit`, `pnpm lint` all pass in `apps/mobile`.
