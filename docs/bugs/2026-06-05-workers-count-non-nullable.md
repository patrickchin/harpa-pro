# 2026-06-05 — `workers[].count` non-nullable rejected valid LLM output

**Pattern:** R5 (prompt/schema drift in `generateReport`).

**Sentry:** [HARPA-PRO-6](https://harpa-pro.sentry.io/issues/123533122/)
— `AiProviderError: generateReport: provider response did not match
report schema (issues=workers.0.count:invalid_type)`. 10 events between
2026-05-29 and 2026-06-05, environments `development` + `production`,
on `POST /projects/:project/reports/:number/regenerate`.

## Smell

Generate / Regenerate Report 502'd whenever site notes mentioned a
worker role without a specific headcount (e.g. "a few electricians",
"image of crew on site"). The model emitted a worker entry with
`count: null`, which `reportBody.workers[].count` rejected because the
contract required `z.number().int().nonnegative()` (strict).

The companion `hours` field on the same object was already nullable —
`count` was the only strict numeric in the workers row, so this was
inconsistent rather than load-bearing.

## Why the drift guard didn't catch it

`__tests__/reportPrompt.drift.test.ts` only verifies that field
*names* appear in both prompts and that the v3 wrapper / forbidden
vocabulary is absent. It did not assert the *type hint* that the
prompt advertises for each field, so prompts and schema could agree on
field names and still disagree on nullability.

The replay fixtures all contained valid integer counts, so unit tests
+ replay-mode integration tests stayed green; the bug only surfaced
in live mode (dev environment regenerate, plus one prod hit on
`harpa-pro-api@0.1.5+6dc0bd5`).

## Fix

1. **Contract** (`packages/api-contract/src/schemas/reports.ts`):
   widen `workers[].count` to
   `z.number().int().nonnegative().nullable()`. Mirrors the existing
   `hours` field on the same object.
2. **Prompts** (`packages/api/src/prompts/reportGeneration.ts`):
   advertise the field as `"count": int>=0|null` in both the
   cold-start (`REPORT_SYSTEM_PROMPT`) and update
   (`REPORT_UPDATE_SYSTEM_PROMPT`) schemas. Add an explicit RULE:
   "Use null for `count` when the notes mention a role without a
   specific headcount; do NOT guess a number." The update prompt also
   says "preserve the existing count when the new notes are silent".
3. **Drift guard** (`__tests__/reportPrompt.drift.test.ts`): assert
   `"count": int>=0|null` is present in both prompts AND that the
   strict `"count": int>=0` form is absent. This adds *type-hint*
   coverage to the existing field-name guard so future schema changes
   to nullability will fail the offline test.
4. **Mobile adapter** (`apps/mobile/lib/reports/report-body-adapter.ts`):
   `totalWorkers` reduction now uses `(w.count ?? 0)` so a null entry
   doesn't NaN the aggregate. `WorkersCard` already rendered
   `role.count ?? 0`, so no UI change.
5. **Fixtures**: re-emit `openapi.json`, regenerate
   `api-contract/src/generated/types.ts`, and rehash all
   `generate-report.*` fixtures via the standard refresh script
   (`pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`).
   The recorded responses themselves did not need changes — widening
   the schema is backwards-compatible with previously valid payloads.

## Recurrence guard

The drift-guard test now asserts the prompt's nullability hint, not
just the field name. Any future change that makes a `reportBody`
scalar nullable must update both the schema and the prompt's type
hint together; if they disagree, the offline test fails on the next
PR.

The complementary live-LLM CI lane (`.github/workflows/ai-live.yml`)
continues to exercise the cold-start prompt against the real model,
which is what would have caught a future *value*-shape drift that
the offline drift guard cannot see.
