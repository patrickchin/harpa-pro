# 2026-05-28 — Debug tab showed "no prompt / no input / no response" on cold load (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Opening the Generate Report page → Debug tab on a report
that had already been generated showed empty state ("No prompt yet",
"No input captured yet", "No response yet"), even though the body
was rendered and the persisted `app.reports.last_generation` jsonb
column was populated.

**Root cause.** The Generate route
(`apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx`)
fed `lastGeneration` to `<GenerateNotes />` from a plain `useState`
populated only by the `useGenerateReportMutation` / `useRegenerateReportMutation`
`onSuccess` callback. Nothing hydrated it from the server on cold
load. The standalone `/debug` route did hit
`useReportDebugQuery`, but the in-page Debug tab did not. The API
side of the contract (persist + `GET /reports/{n}/debug`) was correct
all along — only the mobile route wiring was missing.

**Fix.** PR <pending> — in the Generate route, call
`useReportDebugQuery` (gated on the `showGenerateDebugTab` dev flag
so it's a no-op when the dev flag is off), adapt
`{ systemPrompt, userPrompt, response, model, vendor }` →
`GenerationDebug { …, rawText }`, and pass
`effectiveLastGeneration = lastGeneration ?? persisted` to the
provider. In-session generates still win immediately; persisted
DB row is the cold-load fallback. Also added `'reportDebug'` to the
generate / regenerate invalidation rules so the cache refreshes after
a (re)generate completes.

**Test.** Existing `invalidation.test.ts` covers the new rule entry.
A route-level integration test that mounts the Generate screen with
a server-backed report (no in-session generate) and asserts the
Debug tab surfaces the persisted system prompt would have caught
this — not added in this PR, called out for follow-up.

**Pattern.** R5 — default wiring untested. The mutation success
path was tested; the cold-load hydration path was not. Same shape
as `2026-05-17-edit-manually-missing-onsetreport.md`: route owns
the screen's data wiring, and one of the surfaces silently
defaulted to `null` because the route forgot to pass it.
