# 2026-06-06 — `reportBody` numeric/enum fields widened to `string | null`

**Pattern:** R5 (prompt/schema drift in `generateReport`) — structural
follow-up to four incidents on the same path in two weeks.

## Smell

Every R5 incident on the report path was the same shape: the
contract said "this field is `number | null`" or `"low"|"medium"|"high"`,
the LLM emitted something *adjacent* to that ("a few", "30" as a
string, "around 20", "Critical"), the strict Zod schema rejected
it, and the call 502'd. Examples:

| Date | Field | LLM emitted | Strict schema wanted |
|---|---|---|---|
| 2026-05-23 | `quantityUnit` → renamed `unit` | `quantityUnit` | `unit` |
| 2026-05-28 | `sections` → renamed `summarySections` | `sections` | `summarySections` |
| 2026-06-01 | `actionRequired` → renamed `action` | `actionRequired` | `action` |
| 2026-06-05 | `workers[].count` nullability | `null` | `number` |

The narrow fixes (rename a field, widen one to `.nullable()`)
chipped away at the surface but didn't address the root issue: the
schema was making a tighter claim about LLM output than was
warranted. The data is fundamentally text extracted from a voice
transcript. Forcing it through a numeric type was us pretending the
LLM extracted a measurement when it extracted a *phrase*.

## Why testing kept missing it

Two reinforcing gaps (see PR #133 for the partial fix):

1. **Offline drift guard checked field names, not types.** Patched in PR #133 (`reportPrompt.drift.test.ts` now reflects over the schema), but every nullability tweak still required a multi-file PR.
2. **Live-LLM lane was happy-path only.** Patched in PR #133 with three adversarial scenarios (vague headcount, image-only, no-unit).

Both improvements still leave the schema-too-narrow trap open for
the next field — they make drift *loud* but don't eliminate the
underlying class of bug.

## Fix

Widen every numeric / enum-ish leaf in `reportBody` to
`string | null`. The wire now accepts whatever text the model
extracted from the transcript. Consumers parse to number at the
1–2 places that need arithmetic.

**Fields changed in `packages/api-contract/src/schemas/reports.ts`:**

| Field | Before | After |
|---|---|---|
| `weather.temperatureC` | `z.number().nullable()` | `z.string().nullable()` |
| `weather.windKph` | `z.number().nullable()` | `z.string().nullable()` |
| `workers[].count` | `z.number().int().nonnegative().nullable()` | `z.string().nullable()` |
| `workers[].hours` | `z.number().nonnegative().nullable()` | `z.string().nullable()` |
| `materials[].quantity` | `z.number().nullable()` | `z.string().nullable()` |
| `issues[].severity` | `z.enum(['low','medium','high'])` | `z.string().nullable()` |

**Prompts** (`packages/api/src/prompts/reportGeneration.ts`): both
prompts now advertise these fields as `str|null` and explicitly
permit free-text values like "a few" / "around 20" / "12 m³".
Severity guidance shifted from "exactly one of low|medium|high" to
"prefer low|medium|high; other lower-case strings are accepted".

**Consumers:**

- `apps/mobile/lib/reports/report-body-adapter.ts` —
  - `totalWorkers` / `totalHours` reductions parse via a `toNum()`
    helper (non-numeric text contributes 0 but the raw text is
    still visible in the role row)
  - new `appendUnit` / `stripUnit` helpers replace
    `parseLeadingNumber` for round-tripping temperature/wind/quantity
    through the UI's display strings
  - `normaliseSeverity()` becomes total over `string | null`
- `apps/marketing/src/components/VoiceReportPreview.tsx` —
  - headcount reduce uses `Number.parseFloat`, falls back to 0
  - severity → badge lookup gated through a new `severityKey()`
    helper that collapses unknown values to `"medium"`
  - per-role `count` / `hours` segments render only when the string
    is non-empty (previously gated on `!= null` which now passes
    empty strings through)
- `apps/marketing/src/fixtures/demoReport.ts` — numeric
  values quoted to match the new wire shape

**Fixtures:** all 6 `generate-report.*.json` responses updated to
quote numeric values, then rehashed via the standard refresh
script.

**Drift guard:** no structural change. The reflection logic added
in PR #133 auto-adapts — every widened field now generates a
`str|null` assertion instead of `int>=0|null` / `num|null` /
`"low"|"medium"|"high"`. Verified locally by reverting one field;
the guard fails with a clear message.

## Recurrence guard

The whole class of "LLM emits free text where we wanted a number /
enum" bugs is structurally prevented. There is no narrower
schema to drift against — the schema accepts whatever text the
model produces, and the consumers that need a number parse on read
with explicit fallback semantics.

If a *new* numeric / enum field is added to `reportBody` in the
future, default it to `string | null`. Only narrow to `number` /
`enum` if there's a specific value-handling requirement on the
server side (there currently isn't one for any report field).

## Out of scope

- Voice transcript schemas (separate path, different bug class).
- Adopting the same pattern in other AI services — one at a time as
  R5 hits each one. The report path is the only repeat offender so
  far.
