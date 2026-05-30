# Report meta restoration — design spec

## Problem

PR #36 (commit `bf12d35`, 24 May 2026) realigned the report-generation
prompts to the v4 unwrapped `reportBody` schema and, as a side effect,
deleted the `meta` envelope: no `title`, no `summary`, no `reportType`.
The mobile UI still expects `report.meta.title` / `meta.summary` /
`meta.reportType`, so the adapter at `apps/mobile/lib/reports/report-body-adapter.ts`
seeds those fields with empty strings. Consequences:

- The saved-report header always falls back to `Report #N` — no human
  title ever lands, even after the title-consistency PR (#90).
- The list shows generic rows; users can't skim and recognize reports.
- We have no structural way to filter or search reports.

This spec restores the meta envelope, extends it with four
construction-domain fields the LLM can plausibly extract, wires
display surfaces across the mobile UI, and replaces the v3-era drift
guard.

## Decisions

- **Envelope, not flat.** Meta lives under `body.meta` (v3 grouping).
  `visitDate` moves inside meta alongside the rest of the descriptive
  fields. `weather`, `workers`, `materials`, `issues`, `nextSteps`,
  `summarySections` stay top-level — they're report content, not
  descriptors.
- **Every meta field nullable.** Existing DB rows pre-meta must still
  validate. The adapter substitutes nulls.
- **No invented data.** Prompt rules force `null` whenever notes don't
  support a value. Tags capped at 7 entries.
- **Header stays lean.** The saved-report header keeps the
  title-only treatment shipped in PR #90; meta surfaces inside the
  report body and on the list row.
- **Out of scope:** `attendees`, `duration`, `nextVisitDate`,
  `coverImageNoteId`, and a search/filter UI. Schema enables them
  later; this spec doesn't deliver them.

## Schema

`packages/api-contract/src/schemas/reports.ts` — replace flat
`reportBody` with a `meta` envelope:

```ts
const reportType = z.enum([
  'site_visit', 'daily', 'inspection', 'safety', 'incident', 'progress',
]);

const projectPhase = z.enum([
  'planning', 'foundation', 'structure', 'envelope',
  'services', 'interior', 'finishing', 'handover', 'other',
]);

const riskLevel = z.enum(['low', 'medium', 'high']);

const reportMeta = z.object({
  title:        z.string().nullable(),
  summary:      z.string().nullable(),
  reportType:   reportType.nullable(),
  visitDate:    z.string().datetime().nullable(),
  location:     z.string().nullable(),
  projectPhase: projectPhase.nullable(),
  riskLevel:    riskLevel.nullable(),
  tags:         z.array(z.string()).max(7).default([]),
});

export const reportBody = z.object({
  meta:            reportMeta,
  weather,           // unchanged
  workers,           // unchanged
  materials,         // unchanged
  issues,            // unchanged
  nextSteps,         // unchanged
  summarySections,   // unchanged
});
```

`visitDate` is removed from the top level. Any callers that read
`body.visitDate` (currently the adapter and at least one component)
move to `body.meta.visitDate`.

## Prompt changes

Both `REPORT_SYSTEM_PROMPT` and `REPORT_UPDATE_SYSTEM_PROMPT` in
`packages/api/src/prompts/reportGeneration.ts` get a new top-level
SCHEMA entry and matching RULES.

Cold-start additions (paraphrased — final wording lives in the file):

- Output begins with `"meta": { ... }`.
- `meta.title` — short human title, ≤ 60 chars
  (e.g. `"Site Visit — Wet Weather"`). Null only if notes are
  completely unidentifiable.
- `meta.summary` — one sentence summarizing the visit.
- `meta.reportType` — exactly one of the enum values. Default
  `"site_visit"` only when the notes describe a routine site walk;
  otherwise pick the closest match or null.
- `meta.visitDate` — ISO datetime, null if no date in notes.
- `meta.location` — site or zone name as stated in notes
  (`"Block C basement"`, `"North site, gate 2"`). Null otherwise.
- `meta.projectPhase` — only when clearly inferable; otherwise null
  (NOT `"other"` as a hedge).
- `meta.riskLevel` — roll up from issue severities and notes tone:
  any `"high"` issue ⇒ `"high"`; otherwise `"medium"` if any
  `"medium"`; else `"low"`. Null if no issues and no risk language.
- `meta.tags` — 3-7 short lowercase keywords drawn verbatim from
  notes (`"rebar"`, `"wet weather"`, `"delay"`). Never invent. Empty
  array allowed.

The update prompt adds: preserve existing meta values unless new
notes explicitly contradict; never blank a meta field that previously
had a value just because new notes are silent.

## Adapter

`apps/mobile/lib/reports/report-body-adapter.ts`:

- Drop the "seed `meta` with empty strings" block (lines 23-24,
  65-82). Replace with a 1:1 copy from `body.meta`, defaulting any
  missing meta object to all-null + empty `tags` so legacy rows still
  render.
- Update `GeneratedSiteReportMeta` in
  `packages/report-core/src/generated-report.ts` to add `location`,
  `projectPhase`, `riskLevel`, `tags`. Keep all fields nullable to
  match the contract.
- Read `visitDate` from `body.meta.visitDate` (was top-level).

## Display surfaces

| Surface | Fields shown |
|---|---|
| Reports list row (`projects/[project]/reports/index.tsx`) | `title` (with `Report #N` fallback) · `reportType` pill · `riskLevel` badge · existing date |
| Saved-report header (`ReportDetailHeader.tsx`) | `title` only — unchanged from PR #90 |
| Report body top (above `summarySections`) | `summary` as a lead paragraph, italicized |
| Report body StatBar | `visitDate` · `location` · `projectPhase` |
| Report body bottom | `tags` rendered as small chips |

Pills/badges use the existing design-token palette
(`packages/report-core` / mobile design tokens). Null fields render
nothing — no empty rows, no `—` placeholders.

## Drift guard

`packages/api/src/__tests__/reportPrompt.drift.test.ts` flips from
**forbid** to **require**:

- Both prompts MUST contain the substring `"meta"`.
- Both prompts MUST mention every meta field name (`title`,
  `summary`, `reportType`, `visitDate`, `location`, `projectPhase`,
  `riskLevel`, `tags`).
- Drop the rule that forbids `"meta"`, the v3 wrapper, `"sections"`,
  etc. Keep the v3-vocabulary forbid list for `quantityUnit`,
  `actionRequired`, `roles`.

## Tests

- **Contract unit** — `reportBody.parse(...)` with empty meta, full
  meta, null meta object, oversize tags array (>7).
- **Adapter unit** — empty meta from API → all-null UI meta + `[]`
  tags. Populated meta → 1:1 copy. Legacy body with no `meta` key →
  graceful default.
- **List row test** — render with `reportType: "incident"` +
  `riskLevel: "high"` → both pills visible; with both null → no
  pills.
- **Report body test** — `summary` present → italic lead paragraph
  renders; null → not rendered. `tags: []` → no chip row.
- **Drift guard** — fails when either prompt drops a meta field name.
- **Live CI lane** — already wired; runs on prompt or schema change.

## Fixtures

Prompt change forces hash refresh on every
`packages/ai-fixtures/transcripts/generate-report.*.json`. Recorder
(`pnpm --filter @harpa/ai-fixtures fixtures:record`) needs a real
`OPENAI_API_KEY` (Doppler dev config supplies it locally; CI uses
the dev token). After re-record, run
`pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`
to update hashes.

## Migration / backfill

No DB migration. `reportBody` is stored as JSONB; the new envelope
is additive at the type level. Existing rows lack `meta`; the
adapter and the contract default both supply nulls so the UI renders
fallbacks (`Report #N`, no pills, no chips). Future regeneration
runs will populate meta naturally.

Legacy rows with top-level `visitDate`: the contract no longer
accepts that shape, so a one-off shim in the read path
(`packages/api/src/services/reports.ts` or wherever bodies are
parsed) maps top-level `visitDate` → `meta.visitDate` before Zod
validation. Removed once all rows are regenerated.

## Risk

- **Hallucinated `riskLevel` or `projectPhase`** — mitigated by null
  defaults in the prompt rules and by the drift guard catching prompt
  regressions. Live CI covers schema drift.
- **Hash churn on fixture refresh** — expected; the recorder is the
  source of truth and CI re-records on prompt edits.
- **Top-level `visitDate` removal breaks readers** — grep for
  `body.visitDate` and migrate. Shim covers stored rows.

## Out of scope (yagni)

- `attendees`, `duration` / `startTime` / `endTime`, `nextVisitDate`,
  `coverImageNoteId`.
- User-editable meta fields in the UI (the title-edit flow exists;
  extending it to other meta fields is a separate spec).
- Search and filter UI driven by `tags` / `reportType` / `riskLevel`.
- Localized field labels.

## Open questions

None at spec time. Sequence and PR boundaries get planned in the
companion implementation plan via `writing-plans`.
