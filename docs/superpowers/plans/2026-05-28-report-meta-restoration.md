# Report Meta Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a `meta` envelope (title, summary, reportType, visitDate, location, projectPhase, riskLevel, tags) to `reportBody`, regenerate via LLM, surface across the mobile UI.

**Architecture:** Add `meta` to the `reportBody` Zod schema in `packages/api-contract`. Rewrite both report-generation prompts to produce it. Replace adapter seeding with 1:1 copy. Extend `GeneratedSiteReportMeta` in `report-core`. Wire pills, lead paragraph, StatBar field, and tag chips across mobile surfaces. Replace the v3-era drift guard with the new field set. Re-record fixtures. Stored legacy bodies coexist via an adapter-level shim.

**Tech Stack:** Zod (schemas), Hono (API), Drizzle (DB - no migration needed; body is JSONB), React Native / Expo / NativeWind v4 (mobile), Vitest + react-test-renderer (tests), `@harpa/ai-fixtures` (record/replay).

**Spec:** `docs/superpowers/specs/2026-05-28-report-meta-restoration-design.md`

---

## File map

### Modified

- `packages/api-contract/src/schemas/reports.ts` — add `reportMeta` object + enums; nest into `reportBody`; remove top-level `visitDate`.
- `packages/api/src/prompts/reportGeneration.ts` — rewrite both prompts to emit the meta envelope.
- `packages/api/src/__tests__/reportPrompt.drift.test.ts` — flip from forbid-`meta` to require-`meta`, extend `REQUIRED_FIELDS`.
- `packages/api/src/services/ai.ts` — error logging unchanged; only the Zod parse target changes (schema-driven).
- `packages/report-core/src/generated-report.ts` — extend `meta` shape with the four new fields; keep nullable + defaults.
- `apps/mobile/lib/reports/report-body-adapter.ts` — replace seeded-empty meta with 1:1 copy; add legacy-shape shim (`body.visitDate` → `body.meta.visitDate`); update inverse adapter to write meta back.
- `apps/mobile/components/reports/detail/StatBar.tsx` (or equivalent) — add `location` and `projectPhase` rows.
- `apps/mobile/components/reports/list/ReportListRow.tsx` (or wherever rows are rendered in `app/(app)/projects/[project]/reports/index.tsx`) — add `reportType` pill + `riskLevel` badge.
- `apps/mobile/components/reports/detail/ReportView.tsx` (or equivalent) — render `summary` as lead paragraph + `tags` chip row.
- `apps/mobile/lib/projects/project-reports-list.ts` — title rule already in place; verify `meta` is read from new location.
- `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx` — line 155-163 ad-hoc `reportRow.meta` typing now resolved through the contract; remove the inline `meta?: { title?: string | null }` block.
- `packages/ai-fixtures/transcripts/generate-report.*.json` — re-record after prompt change.

### Created

- `apps/mobile/components/reports/list/ReportListPills.tsx` — small pill primitives for `reportType` and `riskLevel`.
- `apps/mobile/components/reports/detail/SummaryLead.tsx` — italicized lead paragraph above `summarySections`.
- `apps/mobile/components/reports/detail/TagChips.tsx` — chip row for `meta.tags`.
- `apps/mobile/lib/reports/report-body-adapter.test.ts` — was already extended in PR #90 (verify; create if missing).

---

## Task 1: Contract — add `meta` envelope to `reportBody`

**Files:**
- Modify: `packages/api-contract/src/schemas/reports.ts`
- Test: `packages/api-contract/src/schemas/reports.test.ts` (create if missing)

- [ ] **Step 1: Write failing test for the new shape**

Create or extend `packages/api-contract/src/schemas/reports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reportBody } from './reports.js';

describe('reportBody with meta envelope', () => {
  it('accepts a populated meta object', () => {
    const result = reportBody.safeParse({
      meta: {
        title: 'Site Visit — Wet Weather',
        summary: 'Wet conditions delayed concrete pour.',
        reportType: 'site_visit',
        visitDate: '2026-05-28T00:00:00Z',
        location: 'Block C basement',
        projectPhase: 'foundation',
        riskLevel: 'medium',
        tags: ['rebar', 'wet weather'],
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts all-null meta fields and empty tags', () => {
    const result = reportBody.safeParse({
      meta: {
        title: null, summary: null, reportType: null,
        visitDate: null, location: null, projectPhase: null,
        riskLevel: null, tags: [],
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('defaults tags to [] when omitted', () => {
    const result = reportBody.safeParse({
      meta: {
        title: null, summary: null, reportType: null,
        visitDate: null, location: null, projectPhase: null,
        riskLevel: null,
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.meta.tags).toEqual([]);
  });

  it('rejects more than 7 tags', () => {
    const result = reportBody.safeParse({
      meta: {
        title: null, summary: null, reportType: null,
        visitDate: null, location: null, projectPhase: null,
        riskLevel: null,
        tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects top-level visitDate (moved into meta)', () => {
    const result = reportBody.safeParse({
      visitDate: '2026-05-28T00:00:00Z',
      meta: {
        title: null, summary: null, reportType: null,
        visitDate: null, location: null, projectPhase: null,
        riskLevel: null, tags: [],
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    // strict-mode behaviour: passes (extra prop ignored). The
    // explicit assertion is that the data shape doesn't expose it.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).visitDate).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```
pnpm --filter @harpa/api-contract test reports.test.ts
```
Expected: tests fail because `meta` doesn't exist on `reportBody`.

- [ ] **Step 3: Edit `packages/api-contract/src/schemas/reports.ts`**

Replace the body block (above `export const reportBody = z.object({…})`) with:

```ts
const reportType = z.enum([
  'site_visit', 'daily', 'inspection', 'safety', 'incident', 'progress',
]);
export type ReportTypeValue = z.infer<typeof reportType>;

const projectPhase = z.enum([
  'planning', 'foundation', 'structure', 'envelope',
  'services', 'interior', 'finishing', 'handover', 'other',
]);
export type ProjectPhaseValue = z.infer<typeof projectPhase>;

const riskLevel = z.enum(['low', 'medium', 'high']);
export type RiskLevelValue = z.infer<typeof riskLevel>;

export const reportMeta = z.object({
  title:        z.string().nullable(),
  summary:      z.string().nullable(),
  reportType:   reportType.nullable(),
  visitDate:    isoDateTime.nullable(),
  location:     z.string().nullable(),
  projectPhase: projectPhase.nullable(),
  riskLevel:    riskLevel.nullable(),
  tags:         z.array(z.string()).max(7).default([]),
});
export type ReportMeta = z.infer<typeof reportMeta>;

export const reportBody = z.object({
  meta: reportMeta,
  weather: z.object({
    condition: z.string().nullable(),
    temperatureC: z.number().nullable(),
    windKph: z.number().nullable(),
    impact: z.string().nullable(),
  }).nullable(),
  workers: z.array(z.object({
    role: z.string(),
    count: z.number().int().nonnegative(),
    hours: z.number().nonnegative().nullable(),
    notes: z.string().nullable(),
  })),
  materials: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    status: z.string().nullable(),
    condition: z.string().nullable(),
    notes: z.string().nullable(),
  })),
  issues: z.array(z.object({
    title: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    description: z.string().nullable(),
    action: z.string().nullable(),
  })),
  nextSteps: z.array(z.string()),
  summarySections: z.array(z.object({
    title: z.string(),
    body: z.string(),
  })),
});
export type ReportBody = z.infer<typeof reportBody>;
```

The `report` object (`export const report = z.object({...})`) keeps its top-level `visitDate` column (that's the DB column, separate from body content).

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @harpa/api-contract test reports.test.ts
```
Expected: all 5 cases green.

- [ ] **Step 5: Build the contract package + downstream type check**

```
pnpm --filter @harpa/api-contract build
pnpm -w tsc --noEmit
```
Expected: clean. Any `body.visitDate` reader in non-test code surfaces here; pause and fix it (the adapter will be fixed in Task 4, so an error there is expected — note it but don't fix yet).

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/schemas/reports.ts packages/api-contract/src/schemas/reports.test.ts
git commit -m "feat(api-contract): add meta envelope to reportBody (title, summary, reportType, location, projectPhase, riskLevel, tags)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Prompts — emit the meta envelope (cold-start + update)

**Files:**
- Modify: `packages/api/src/prompts/reportGeneration.ts`
- Tests covered by Task 3 (drift guard) + Task 8 (live recorder).

- [ ] **Step 1: Rewrite `REPORT_SYSTEM_PROMPT`**

Open `packages/api/src/prompts/reportGeneration.ts` and edit the cold-start prompt. The SCHEMA block becomes:

```
SCHEMA (top-level keys are exhaustive; types in parens)
{
  "meta": {
    "title":        str | null,             // ≤60 chars, e.g. "Site Visit — Wet Weather"
    "summary":      str | null,             // one sentence
    "reportType":   "site_visit" | "daily" | "inspection" | "safety" | "incident" | "progress" | null,
    "visitDate":    ISO-8601 datetime ("YYYY-MM-DDTHH:MM:SSZ") | null,
    "location":     str | null,             // site or zone name from notes
    "projectPhase": "planning" | "foundation" | "structure" | "envelope" | "services" | "interior" | "finishing" | "handover" | "other" | null,
    "riskLevel":    "low" | "medium" | "high" | null,
    "tags":         [ str ]                 // 0-7 short lowercase keywords
  },
  "weather":          { "condition": str|null, "temperatureC": num|null, "windKph": num|null, "impact": str|null } | null,
  "workers":          [ { "role": str, "count": int>=0, "hours": num>=0|null, "notes": str|null } ],
  "materials":        [ { "name": str, "quantity": num|null, "unit": str|null, "status": str|null, "condition": str|null, "notes": str|null } ],
  "issues":           [ { "title": str, "severity": "low"|"medium"|"high", "description": str|null, "action": str|null } ],
  "nextSteps":        [ str ],
  "summarySections":  [ { "title": str, "body": str } ]
}
```

The OUTPUT line changes — replace the prior `do NOT include a "meta" field` directive with:

```
Return ONLY valid minified JSON matching the SCHEMA below. The top-level value MUST be the report object itself — do NOT wrap it in a "report" envelope, do NOT wrap in markdown fences, do NOT add prose before or after.
```

Add these RULES (above the existing visitDate/weather/workers rules):

```
- "meta.title" — short human title; null only if notes are completely unidentifiable.
- "meta.summary" — single sentence summarising the visit.
- "meta.reportType" — pick the closest enum value; null when uncertain. Default "site_visit" only when notes clearly describe a routine site walk.
- "meta.location" — site name or zone as stated in notes ("Block C basement"). Null if not stated.
- "meta.projectPhase" — only when clearly inferable. Use null over guessing; do NOT use "other" as a hedge.
- "meta.riskLevel" — derive from issues: any "high" issue ⇒ "high"; else any "medium" ⇒ "medium"; else "low". Null if there are no issues AND no risk language in notes.
- "meta.tags" — 3-7 short lowercase keywords drawn from notes. Never invent. Empty array allowed.
```

Update the EXAMPLE JSON to match:

```json
{"meta":{"title":"Site Visit — Wet Weather","summary":"Wet conditions delayed concrete pour.","reportType":"site_visit","visitDate":null,"location":"North site","projectPhase":"foundation","riskLevel":"medium","tags":["wet weather","rebar","delay"]},"weather":{"condition":"wet","temperatureC":20,"windKph":null,"impact":"Pour delayed by 1 hour"},"workers":[{"role":"Concrete worker","count":4,"hours":8,"notes":null}],"materials":[{"name":"Concrete","quantity":50,"unit":"m³","status":"delivered","condition":null,"notes":null}],"issues":[{"title":"Wet ground","severity":"medium","description":"Overnight rain left site waterlogged.","action":"Reassess drainage."}],"nextSteps":["Order rebar"],"summarySections":[{"title":"Foundation Work","body":"Concrete pour started in zone A despite wet weather."}]}
```

Also update the JSDoc header at the top of the file to mention the meta envelope (drop the "no meta field" comment shipped in PR #36).

- [ ] **Step 2: Rewrite `REPORT_UPDATE_SYSTEM_PROMPT`**

In the same file, apply the same SCHEMA + RULES additions to the update prompt. Add one extra RULE specific to updates:

```
- Preserve existing meta values when new notes are silent. Only overwrite a meta field when new notes explicitly contradict it. Never blank a meta field just because new notes are silent.
```

- [ ] **Step 3: Build + lint**

```
pnpm --filter @harpa/api build
pnpm --filter @harpa/api lint
```
Expected: clean (no behaviour change yet — tests follow in Task 3).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/prompts/reportGeneration.ts
git commit -m "feat(api): teach report prompts to emit meta envelope

Cold-start and update prompts now produce meta.title, summary,
reportType, visitDate, location, projectPhase, riskLevel, tags.
Reverses the meta drop from #36 — required because mobile UI
consumes meta directly. Update path preserves existing meta on
silent notes.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Drift guard — require meta fields

**Files:**
- Modify: `packages/api/src/__tests__/reportPrompt.drift.test.ts`

- [ ] **Step 1: Run the existing guard — confirm what fails after Task 2**

```
pnpm --filter @harpa/api test reportPrompt.drift
```
Expected: failures on `does NOT contain v3 vocab "category"` if the new RULES mention the word, and on the `forbids the "report" wrapper` regex if you reworded that section. Note actual failures, fix prompt wording if needed before changing the guard.

- [ ] **Step 2: Update `REQUIRED_FIELDS` to include meta keys**

Edit `packages/api/src/__tests__/reportPrompt.drift.test.ts` — add the meta keys to the top of `REQUIRED_FIELDS`:

```ts
const REQUIRED_FIELDS = [
  // meta
  'meta',
  'title',      // already needed for issues.title — keep position
  'summary',
  'reportType',
  'location',
  'projectPhase',
  'riskLevel',
  'tags',
  // top-level (visitDate now under meta, but the literal string
  // still appears in both prompts)
  'visitDate',
  'weather',
  // ... (rest unchanged)
];
```

Add the reportType / projectPhase / riskLevel enum literals to a new constant + test block:

```ts
const META_ENUM_VALUES = [
  '"site_visit"', '"daily"', '"inspection"', '"safety"', '"incident"', '"progress"',
  '"planning"', '"foundation"', '"structure"', '"envelope"', '"services"',
  '"interior"', '"finishing"', '"handover"', '"other"',
];

// inside the describe.each block:
it.each(META_ENUM_VALUES)('mentions meta enum literal %s', (lit) => {
  expect(prompt).toContain(lit);
});
```

- [ ] **Step 3: Run guard — expect pass**

```
pnpm --filter @harpa/api test reportPrompt.drift
```
Expected: all cases green for both prompts.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/__tests__/reportPrompt.drift.test.ts
git commit -m "test(api): drift guard requires meta fields + enum literals

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Mobile adapter — read meta directly + legacy shim

**Files:**
- Modify: `apps/mobile/lib/reports/report-body-adapter.ts`
- Modify: `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx` (clean up the ad-hoc `meta?: { title?: string | null }` typing)
- Test: `apps/mobile/lib/reports/report-body-adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Open `apps/mobile/lib/reports/report-body-adapter.test.ts` (the file should exist from PR #90 territory; if it doesn't, create it). Add these cases:

```ts
import { describe, it, expect } from 'vitest';
import { reportBodyToGeneratedReport } from './report-body-adapter';

const emptyMeta = {
  title: null, summary: null, reportType: null,
  visitDate: null, location: null, projectPhase: null,
  riskLevel: null, tags: [],
};

const baseBody = {
  meta: emptyMeta,
  weather: null, workers: [], materials: [], issues: [],
  nextSteps: [], summarySections: [],
};

describe('reportBodyToGeneratedReport — meta mapping', () => {
  it('copies populated meta 1:1 into the UI shape', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      meta: {
        title: 'My Title',
        summary: 'My summary.',
        reportType: 'inspection',
        visitDate: '2026-05-28T00:00:00Z',
        location: 'Block C',
        projectPhase: 'foundation',
        riskLevel: 'medium',
        tags: ['rebar', 'delay'],
      },
    });
    expect(out.report.meta.title).toBe('My Title');
    expect(out.report.meta.summary).toBe('My summary.');
    expect(out.report.meta.reportType).toBe('inspection');
    expect(out.report.meta.visitDate).toBe('2026-05-28T00:00:00Z');
    expect(out.report.meta.location).toBe('Block C');
    expect(out.report.meta.projectPhase).toBe('foundation');
    expect(out.report.meta.riskLevel).toBe('medium');
    expect(out.report.meta.tags).toEqual(['rebar', 'delay']);
  });

  it('renders all-null meta as empty UI fields with empty tags', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.meta.title).toBe('');         // trimmedString collapses null/missing
    expect(out.report.meta.summary).toBe('');
    expect(out.report.meta.reportType).toBe('site_visit'); // schema default
    expect(out.report.meta.location).toBeNull();
    expect(out.report.meta.projectPhase).toBeNull();
    expect(out.report.meta.riskLevel).toBeNull();
    expect(out.report.meta.tags).toEqual([]);
  });

  it('shims a legacy body with top-level visitDate', () => {
    const legacyBody: any = {
      visitDate: '2026-04-01T00:00:00Z',
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    };
    const out = reportBodyToGeneratedReport(legacyBody);
    expect(out.report.meta.visitDate).toBe('2026-04-01T00:00:00Z');
    expect(out.report.meta.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```
cd apps/mobile && pnpm test report-body-adapter
```
Expected: failures because adapter still reads `body.visitDate` and ignores `meta`.

- [ ] **Step 3: Update the adapter**

In `apps/mobile/lib/reports/report-body-adapter.ts`:

1. Drop the second `meta?` parameter on `reportBodyToGeneratedReport` (no longer needed; meta is part of the body now).
2. Add a normaliser at the top of the function that handles legacy rows:

```ts
type LegacyBodyShim = ReportBody & { visitDate?: string | null };

function normaliseLegacy(body: ReportBody | LegacyBodyShim): ReportBody {
  if ((body as ReportBody).meta) return body as ReportBody;
  const legacy = body as LegacyBodyShim;
  return {
    ...legacy,
    meta: {
      title: null, summary: null, reportType: null,
      visitDate: legacy.visitDate ?? null,
      location: null, projectPhase: null,
      riskLevel: null, tags: [],
    },
  };
}
```

3. Replace the meta block inside the returned object:

```ts
const m = body.meta;
return {
  report: {
    meta: {
      title: m.title ?? '',
      reportType: m.reportType ?? 'site_visit',
      summary: m.summary ?? '',
      visitDate: m.visitDate,
      location: m.location,
      projectPhase: m.projectPhase,
      riskLevel: m.riskLevel,
      tags: m.tags ?? [],
    },
    // ... weather/workers/etc unchanged
  },
};
```

4. Update the inverse `generatedReportToReportBody` to write the meta envelope back:

```ts
return {
  meta: {
    title: r.meta.title || null,
    summary: r.meta.summary || null,
    reportType: r.meta.reportType || null,
    visitDate: r.meta.visitDate ?? null,
    location: r.meta.location ?? null,
    projectPhase: r.meta.projectPhase ?? null,
    riskLevel: r.meta.riskLevel ?? null,
    tags: r.meta.tags ?? [],
  },
  weather: r.weather ? { /* unchanged */ } : null,
  workers: /* unchanged */,
  materials: /* unchanged */,
  issues: /* unchanged */,
  nextSteps: r.nextSteps,
  summarySections: r.sections.map((s) => ({ title: s.title, body: s.content })),
};
```

5. Update the JSDoc field map at the top to reflect new sources.

- [ ] **Step 4: Update generate.tsx caller**

In `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx`:

- Line 155-163: remove the `meta?: { title?: string | null }` from the `reportRow` type. The `body` now carries meta.
- Line 262: drop the second arg from `reportBodyToGeneratedReport`:
  ```ts
  ? reportBodyToGeneratedReport(reportRow.body)
  ```
- Line 512: replace `reportRow?.meta?.title` with `reportRow?.body?.meta?.title`.

Also grep for `reportRow?.meta` and `reportRow.meta` in any other file in `apps/mobile/` and migrate to `reportRow.body?.meta`.

- [ ] **Step 5: Run tests + tsc**

```
cd apps/mobile && pnpm test report-body-adapter && pnpm tsc --noEmit
```
Expected: adapter tests green, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/reports/report-body-adapter.ts apps/mobile/lib/reports/report-body-adapter.test.ts apps/mobile/app/\(app\)/projects/\[project\]/reports/\[number\]/generate.tsx
git commit -m "feat(mobile/reports): adapter reads meta envelope, shims legacy bodies

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: report-core — extend `GeneratedSiteReportMeta`

**Files:**
- Modify: `packages/report-core/src/generated-report.ts`
- Test: `packages/report-core/src/generated-report.test.ts` (add if missing)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeGeneratedReportPayload } from './generated-report';

describe('GeneratedSiteReportSchema — meta extensions', () => {
  it('accepts location/projectPhase/riskLevel/tags', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: 'T', summary: 'S', reportType: 'site_visit', visitDate: null,
          location: 'Site A', projectPhase: 'foundation', riskLevel: 'medium',
          tags: ['a', 'b'],
        },
        weather: null, workers: null, materials: [], issues: [],
        nextSteps: [], sections: [],
      },
    });
    expect(out.report.meta.location).toBe('Site A');
    expect(out.report.meta.projectPhase).toBe('foundation');
    expect(out.report.meta.riskLevel).toBe('medium');
    expect(out.report.meta.tags).toEqual(['a', 'b']);
  });

  it('defaults missing extended fields to null / empty array', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: { title: 'T', summary: '', reportType: 'site_visit', visitDate: null },
        weather: null, workers: null, materials: [], issues: [],
        nextSteps: [], sections: [],
      },
    });
    expect(out.report.meta.location).toBeNull();
    expect(out.report.meta.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @harpa/report-core test generated-report
```
Expected: failures because `location`/`tags` don't exist on the schema.

- [ ] **Step 3: Extend the meta schema**

In `packages/report-core/src/generated-report.ts`, find `GeneratedSiteReportSchema` (around line 103) and extend the `meta` object:

```ts
meta: z.object({
  title: trimmedString,
  reportType: trimmedString.transform((s) => s || 'site_visit'),
  summary: trimmedString,
  visitDate: nullableTrimmed,
  location: nullableTrimmed,
  projectPhase: z.string().nullable().optional().default(null).catch(null),
  riskLevel: z.enum(['low', 'medium', 'high']).nullable().optional().default(null).catch(null),
  tags: z.array(z.string()).optional().default([]).catch([]),
}),
```

(We keep `projectPhase` as plain string-nullable here because the strict enum lives in the API contract; the UI layer is permissive on input.)

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @harpa/report-core test generated-report && pnpm --filter @harpa/report-core build
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/report-core/src/generated-report.ts packages/report-core/src/generated-report.test.ts
git commit -m "feat(report-core): extend meta with location/projectPhase/riskLevel/tags

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Mobile — list-row pills (`reportType` + `riskLevel`)

**Files:**
- Create: `apps/mobile/components/reports/list/ReportListPills.tsx`
- Modify: `apps/mobile/app/(app)/projects/[project]/reports/index.tsx` (or the row component it uses; find with `grep -n 'ReportListRow\|projects.*reports' apps/mobile/app/\(app\)/projects/\[project\]/reports/index.tsx`)
- Test: `apps/mobile/app/(app)/projects/[project]/reports/index.test.tsx`

- [ ] **Step 1: Write failing list-row test**

Add to the existing index test file:

```ts
it('renders reportType and riskLevel pills when meta is populated', () => {
  const tree = render(<ReportsList reports={[{
    id: 'r1', number: 7, status: 'finalized',
    body: {
      meta: {
        title: 'T', summary: null, reportType: 'incident',
        visitDate: null, location: null, projectPhase: null,
        riskLevel: 'high', tags: [],
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    },
    // ...
  }]} />);
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('incident');
  expect(json).toContain('high');
});

it('renders no pills when reportType + riskLevel are null', () => {
  // similar fixture with both null
  // assert no pill testIDs found
});
```

(Adapt the fixture to your actual `ReportsList` props — check the existing tests in the same file.)

- [ ] **Step 2: Run — expect failure**

```
cd apps/mobile && pnpm test projects/\[project\]/reports/index
```

- [ ] **Step 3: Build the pill primitives**

Create `apps/mobile/components/reports/list/ReportListPills.tsx`:

```tsx
import { Text, View } from 'react-native';
import type { reports as reportSchemas } from '@harpa/api-contract';

const REPORT_TYPE_LABEL: Record<NonNullable<reportSchemas.ReportTypeValue>, string> = {
  site_visit: 'Site visit',
  daily: 'Daily',
  inspection: 'Inspection',
  safety: 'Safety',
  incident: 'Incident',
  progress: 'Progress',
};

const RISK_COLOR: Record<NonNullable<reportSchemas.RiskLevelValue>, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export function ReportTypePill({ value }: { value: reportSchemas.ReportTypeValue | null }) {
  if (!value) return null;
  return (
    <View className="rounded-full bg-slate-100 px-2 py-0.5">
      <Text className="text-xs text-slate-700">{REPORT_TYPE_LABEL[value]}</Text>
    </View>
  );
}

export function RiskLevelBadge({ value }: { value: reportSchemas.RiskLevelValue | null }) {
  if (!value) return null;
  return (
    <View className={`rounded-full px-2 py-0.5 ${RISK_COLOR[value].split(' ')[0]}`}>
      <Text className={`text-xs ${RISK_COLOR[value].split(' ')[1]}`}>{value.toUpperCase()}</Text>
    </View>
  );
}
```

(Match exact NativeWind token usage to the existing design system — colors imported from `@/lib/design-tokens/colors` if pills should not be Tailwind palette. Check `apps/mobile/components/primitives/` for a reference pill before finalising.)

- [ ] **Step 4: Wire into the row**

In `apps/mobile/app/(app)/projects/[project]/reports/index.tsx`, find the row render block. Read `body?.meta?.reportType` and `body?.meta?.riskLevel` from each report. Mount:

```tsx
<View className="flex-row items-center gap-1.5">
  <ReportTypePill value={report.body?.meta?.reportType ?? null} />
  <RiskLevelBadge value={report.body?.meta?.riskLevel ?? null} />
</View>
```

- [ ] **Step 5: Run tests — expect pass**

```
cd apps/mobile && pnpm test projects/\[project\]/reports/index
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/reports/list/ReportListPills.tsx apps/mobile/app/\(app\)/projects/\[project\]/reports/index.tsx apps/mobile/app/\(app\)/projects/\[project\]/reports/index.test.tsx
git commit -m "feat(mobile/reports): show reportType + riskLevel pills on list rows

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Mobile — summary lead, StatBar additions, tag chips

**Files:**
- Create: `apps/mobile/components/reports/detail/SummaryLead.tsx`
- Create: `apps/mobile/components/reports/detail/TagChips.tsx`
- Modify: `apps/mobile/components/reports/detail/StatBar.tsx` (or current StatBar — locate with `grep -rn 'StatBar' apps/mobile`)
- Modify: `apps/mobile/components/reports/detail/ReportView.tsx` (or whichever component renders the report body — find via `grep -rln 'summarySections\|sections.map' apps/mobile/components`)
- Test: `apps/mobile/components/reports/detail/SummaryLead.test.tsx`, `apps/mobile/components/reports/detail/TagChips.test.tsx`

- [ ] **Step 1: Build `SummaryLead`**

```tsx
// apps/mobile/components/reports/detail/SummaryLead.tsx
import { Text, View } from 'react-native';

export function SummaryLead({ summary }: { summary: string | null }) {
  const trimmed = summary?.trim();
  if (!trimmed) return null;
  return (
    <View className="px-5 pb-4">
      <Text className="italic text-base text-slate-700">{trimmed}</Text>
    </View>
  );
}
```

Add a tiny test asserting null/empty → renders nothing; populated → text appears.

- [ ] **Step 2: Build `TagChips`**

```tsx
// apps/mobile/components/reports/detail/TagChips.tsx
import { Text, View } from 'react-native';

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5 px-5 py-3">
      {tags.map((tag) => (
        <View key={tag} className="rounded-full bg-slate-100 px-2 py-0.5">
          <Text className="text-xs text-slate-700">#{tag}</Text>
        </View>
      ))}
    </View>
  );
}
```

Test: empty array → renders nothing; populated → each tag with `#` prefix.

- [ ] **Step 3: Add `location` + `projectPhase` rows to StatBar**

Find StatBar (likely `apps/mobile/components/reports/detail/StatBar.tsx`). Add two new rows beneath `visitDate`:

```tsx
{location ? <StatRow icon="map-pin" label="Location" value={location} /> : null}
{projectPhase ? <StatRow icon="layers" label="Phase" value={PROJECT_PHASE_LABEL[projectPhase] ?? projectPhase} /> : null}
```

Where `PROJECT_PHASE_LABEL` is a small const map (Planning, Foundation, Structure, etc.) declared at the top of the file. Read the new props off the parent.

- [ ] **Step 4: Wire into the report view**

In the report-view component, mount `<SummaryLead summary={report.meta.summary} />` immediately above the `summarySections` rendering block, and `<TagChips tags={report.meta.tags} />` immediately below.

- [ ] **Step 5: Tests + tsc**

```
cd apps/mobile && pnpm test components/reports/detail && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/reports/detail/SummaryLead.tsx apps/mobile/components/reports/detail/TagChips.tsx apps/mobile/components/reports/detail/StatBar.tsx apps/mobile/components/reports/detail/ReportView.tsx apps/mobile/components/reports/detail/SummaryLead.test.tsx apps/mobile/components/reports/detail/TagChips.test.tsx
git commit -m "feat(mobile/reports): render summary lead, location/phase in StatBar, tag chips

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Re-record fixtures

**Files:**
- Modify: `packages/ai-fixtures/transcripts/generate-report.*.json`

- [ ] **Step 1: Make sure OPENAI_API_KEY is available**

```
doppler run --project harpa-pro --config dev -- env | grep OPENAI_API_KEY
```
Expected: a value. If absent, ask the user to fix Doppler before continuing.

- [ ] **Step 2: Re-record**

```
doppler run --project harpa-pro --config dev -- pnpm --filter @harpa/ai-fixtures fixtures:record -- --pattern 'generate-report.*'
```
Expected: each `generate-report.*.json` updated with new request hash + new response.text that includes the meta envelope.

- [ ] **Step 3: Refresh stale hashes (if recorder skipped any)**

```
pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts
```

- [ ] **Step 4: Replay the integration suite**

```
pnpm --filter @harpa/api test reports
```
Expected: green. The recorded responses now feed the validator which now expects meta.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-fixtures/transcripts/generate-report.*.json
git commit -m "chore(ai-fixtures): re-record generate-report transcripts with meta envelope

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Whole-repo verification

- [ ] **Step 1: Full mobile test**

```
cd apps/mobile && pnpm test
```
Expected: all green (the title-consistency snapshot from PR #90 may need refresh if the report view added the lead paragraph or tag row — update snapshots after manual review).

- [ ] **Step 2: API test**

```
pnpm --filter @harpa/api test
```

- [ ] **Step 3: Contract + report-core**

```
pnpm --filter @harpa/api-contract test
pnpm --filter @harpa/report-core test
```

- [ ] **Step 4: Root-level type check + lint**

```
pnpm -w tsc --noEmit
cd apps/mobile && pnpm lint
pnpm --filter @harpa/api lint
```

- [ ] **Step 5: Live LLM smoke (optional — confirms prompt actually produces the meta the schema expects)**

```
doppler run --project harpa-pro --config dev -- pnpm --filter @harpa/api test:live
```
Expected: live OpenAI returns meta + passes schema. If this skews flaky, re-run once before flagging.

- [ ] **Step 6: Doc updates**

Update `docs/v4/arch-ai-fixtures.md`:
- Note the meta envelope is now the contract.
- Drop any phrasing about "v4 unwrapped, no meta".

Update `docs/v4/design-report-title-consistency.md`:
- In the per-surface table, change list row entry to include `reportType + riskLevel pills`.
- Add a "Restored meta envelope" note at the bottom pointing to the new spec.

Update `docs/bugs/README.md`:
- Add an entry under "Prompt/schema drift" noting the inverse direction (meta dropped, restored in this work).

```bash
git add docs/v4/arch-ai-fixtures.md docs/v4/design-report-title-consistency.md docs/bugs/README.md
git commit -m "docs(v4): record meta envelope restoration

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 7: Push + update PR**

```bash
git push
```

The work continues on existing branch `agents/report-title-consistency-issue` (PR #90). If the user prefers a separate PR, branch off `dev` first.

---

## Self-review notes

- **Spec coverage:** Each spec section (Schema, Prompt, Adapter, Display, Drift guard, Tests, Fixtures, Migration) maps to a task above. Display surfaces split across Tasks 6 + 7 (list vs detail).
- **Type consistency:** `ReportTypeValue`, `RiskLevelValue`, `ProjectPhaseValue` exported from the contract (Task 1) and consumed by the pills (Task 6) and tests. Adapter (Task 4) types the meta off `body.meta`. `GeneratedSiteReportMeta` extended in Task 5.
- **No placeholders:** Each code block is complete; legacy shim spelled out; pill labels enumerated; tag chip uses `#` prefix; StatBar phase labels declared. Locate-this-file lines explicitly call out grep commands when the exact path isn't pinned.
- **Watch-outs:** (a) NativeWind class names in pills are illustrative — replace with project design tokens before merging if conventions differ. (b) Live recorder needs Doppler access. (c) Snapshot tests from PR #90 likely need refresh after Task 7.
