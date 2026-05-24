# AI fixtures (`packages/ai-fixtures`)

> Resolves [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in).

## Goals

1. **No real LLM calls in CI**, ever.
2. **Easy to record a new fixture** when a new endpoint or prompt
   is added (`pnpm fixtures:record <name>`).
3. **Deterministic replay** in tests + `:mock` builds — same input
   always produces the same fixture output.
4. **Provider-agnostic API design.** Currently implemented for
   OpenAI (chat / report generation), Groq (transcription via
   whisper-large-v3-turbo) and Kimi/Moonshot (chat, OpenAI-compatible
   REST at `https://api.moonshot.cn/v1` — selected per-user via the
   `AiVendor` preference). Anthropic, Google, Z.AI and DeepSeek are
   intentionally deferred — the per-user `AiVendor` preference will
   widen once those adapters land.
5. **Redacted by default** — no PII / no API keys in committed
   fixtures.

## Layout

```
packages/ai-fixtures/
  src/
    index.ts           # createProvider({ fixtureMode })
    providers/
      openai.ts          # chat / report generation (live + replay)
      groq.ts            # transcription (live + replay)
      kimi.ts            # chat via Moonshot REST (live + replay)
      error.ts
      factory-from-env.ts
    fixture-store.ts   # read/write fixtures/<name>.json
    redact.ts          # PII redaction
    hash.ts            # canonical-json hash for fixture lookup
  fixtures/
    transcribe.voice-{1..5}.json        # five real site-walk transcripts
    summarize.voice-{1..5}.json         # title + summary per transcript
    generate-report.voice-{1..5}.json   # full report body per transcript
    …
  package.json
```

Five scenarios — `voice-1` … `voice-5` — each backed by a single
real construction-site voice memo. `voice-1` is the rich default; `voice-4`
is the sparse case (empty `workers`/`materials`, one summary section)
exercised by the regenerate test. Per-vendor fixture variants were
removed: a single set of OpenAI fixtures covers every scenario in
replay mode. The per-user `AiVendor` preference is still tracked for
live-mode routing and accounting; it no longer steers fixture
selection.

## Modes

```ts
type FixtureMode = 'replay' | 'record' | 'live';

const provider = createProvider({
  vendor: 'openai',
  fixtureMode: process.env.AI_FIXTURE_MODE as FixtureMode,
  fixtureName: 'transcribe.basic', // declared by caller
});
```

| Mode | Behaviour |
|---|---|
| `replay` | Look up `fixtures/<name>.json`. Hash the request body; if hash matches `fixture.requestHash`, return `fixture.response`. If missing or mismatched, throw `FixtureMissError`. **Default in CI + tests + `:mock`.** |
| `record` | Hit the real provider, redact, write to `fixtures/<name>.json`, then return the response. Used by humans running `pnpm fixtures:record <name>` once per new endpoint. |
| `live` | Hit the real provider with no fixture interaction. **Only enabled when `AI_LIVE=1`.** Production deploys set this. |

CI asserts `AI_FIXTURE_MODE=replay` and `AI_LIVE` unset.

## Hashing

Fixture lookup uses a canonical-JSON hash of:

- model id,
- system + user messages (post-prompt-build),
- temperature, max_tokens, etc.

The hash is included in the fixture file so a stale fixture (prompt
template changed) fails loudly with a clear error pointing at the
fixture name to re-record.

## Redaction (`src/redact.ts`)

Before writing a fixture:

- Strip API keys, bearer tokens, and any header.
- Replace phone numbers with `+10000000000`.
- Replace email addresses with `redacted@example.com`.
- Replace UUIDs in user content with `00000000-0000-0000-0000-000000000000`.
- Truncate file URLs to host + last path segment.

A fixture file:

```json
{
  "vendor": "openai",
  "model": "gpt-4o-mini",
  "fixtureName": "transcribe.voice-1",
  "recordedAt": "2026-05-12T00:00:00Z",
  "requestHash": "sha256:a7c3…",
  "request": { "...redacted summary..." : true },
  "response": {
    "text": "I just arrived at the site, so the construction site…",
    "usage": { "input": 12, "output": 88 }
  }
}
```

## Usage in the API

```ts
// packages/api/src/services/ai.ts
import { createProvider } from '@harpa/ai-fixtures';

export const transcribe = (audioUrl: string) =>
  createProvider({
    vendor: 'openai',
    fixtureMode: env.AI_FIXTURE_MODE,
    fixtureName: 'transcribe.voice-1',
  }).transcribe({ audioUrl });
```

Route handlers pick the fixture name based on a deterministic
mapping (e.g. by report id in `:mock` builds, or by an explicit
header `X-Fixture-Name` accepted only when
`AI_FIXTURE_MODE !== 'live'`).

## Recording a new fixture

```bash
# 1. Set creds, set mode, run a single test that exercises the path.
AI_FIXTURE_MODE=record OPENAI_API_KEY=… pnpm test:api -- transcribe.voice-1

# 2. Inspect, commit.
git add packages/ai-fixtures/fixtures/transcribe.voice-1.json
git commit -m "test(ai-fixtures): record transcribe.voice-1"
```

Pre-commit hook checks fixture files for un-redacted strings
matching API key patterns or +1[0-9]{10} phone numbers other than
`+10000000000`.

### `generate-report.*` — dedicated recorder

The report fixtures have a custom recorder
(`packages/ai-fixtures/scripts/record.ts`, exposed as
`pnpm --filter @harpa/ai-fixtures record`) because their request
hash depends on the API's `REPORT_SYSTEM_PROMPT`. Every time that
prompt changes the fixtures go stale; the recorder regenerates them
in one pass, using the recorded `transcribe.voice-N.json`
transcripts as the realistic notes payload and writing back the
canonical placeholder user prompt (`<notes payload voice-N>`) so
replay-mode lookup still hits the file.

```bash
AI_LIVE=1 OPENAI_API_KEY=sk-… pnpm --filter @harpa/ai-fixtures record
# optionally restrict to one scenario:
AI_LIVE=1 OPENAI_API_KEY=sk-… pnpm --filter @harpa/ai-fixtures record -- --scenario voice-3
```

The recorder refuses to run without `AI_LIVE=1` so it cannot
silently clobber fixtures from an unrelated test or script import.

## Usage accounting (`app.llm_usage_events`)

Every call routed through `services/ai.ts` lands one row in
`app.llm_usage_events` via the `withUsageAccounting` chokepoint
(see [P3.15.5](plan-p3-feature-build.md#p3155--llm-token-accounting)).
Token-count conventions per operation — full doc lives on
`RecordLlmUsageParams` in `services/ai-usage.ts`:

| `operation`        | `input_tokens`            | `output_tokens`     | `cached_tokens`              |
|--------------------|---------------------------|---------------------|------------------------------|
| `chat` / `generate_report` | prompt tokens     | completion tokens   | subset of input that hit the provider's prompt cache (0 if vendor does not report) |
| `transcribe`       | `ceil(durationSec)`       | `0`                 | `0`                          |

Vendor extraction (live mode):

- **OpenAI** — `response.usage.{prompt_tokens, completion_tokens,
  prompt_tokens_details.cached_tokens}`.
- **Kimi (Moonshot)** — same shape; Moonshot's REST API is
  OpenAI-compatible.
- **Groq (Whisper-class transcription)** — bills by audio seconds, no
  per-token field. `services/ai.ts::transcribe()` derives
  `input_tokens = ceil(durationSec)` so the unified column stays
  non-zero.

Replay mode reads `usage` straight from the recorded fixture file,
so replay-mode tests have deterministic token counts that match the
checked-in fixture without re-hitting the provider.

## Live-CI lane

Replay fixtures cannot catch prompt/schema drift on their own —
the fixture `response.text` is hand-massaged to match whatever
shape the contract currently expects, so a broken prompt
("emit v3 wrapped JSON") looks healthy in CI while the live
production path 502s ("AI provider request failed."). That's
Pitfall 13 in `pitfalls.md`, and it is exactly the bug recorded
in `docs/bugs/README.md` as **"Prompt/schema drift in
generateReport"**.

Three guards run at three layers:

| Lane | When | What it catches |
| --- | --- | --- |
| **Offline drift guard** (`packages/api/src/__tests__/reportPrompt.drift.test.ts`) | Every PR, in the unit lane | Prompt text no longer mentions every required `reportBody` field, or has re-acquired v3 vocabulary (`"report":` wrapper, `quantityUnit`, `actionRequired`, `totalWorkers`, `"category"`). |
| **Replay integration** (`reports.integration.test.ts`) | Every PR | The fixture-driven happy path still produces a schema-valid `reportBody` end-to-end. |
| **Live-LLM** (`.github/workflows/ai-live.yml` → `pnpm --filter @harpa/api test:live`) | Weekly schedule, manual dispatch, push/PR touching prompts / `services/ai.ts` / `schemas/reports.ts` / providers / `generate-report.*.json` | The real model, with the real prompt, still returns a payload that parses against `reportBody`. |

The live lane is opt-in by file path so we don't burn OpenAI
budget on every PR. It needs the `OPENAI_API_KEY` repo secret
(and `GROQ_API_KEY` once the transcribe path is added). Fork PRs
are skipped automatically because they can't read secrets.

When the live lane fails, the next step is almost always:

1. Look at the failure — Zod issue paths are in the test output
   AND (in production) in the Fly log line
   `ai_provider_error … issues=<path>:<code>, …`.
2. Update `packages/api/src/prompts/reportGeneration.ts` to match
   the schema (or update the schema if the contract is changing).
3. Re-record fixtures: `pnpm --filter @harpa/ai-fixtures record`.

## Mobile `:mock` build

The `:mock` build sets `EXPO_PUBLIC_USE_FIXTURES=true`, which makes
the API client always send `X-Fixture-Mode: replay` and pick a
predictable fixture name based on the screen flow being demoed
(e.g. recording a voice note in `:mock` always replays
`transcribe.voice-1` then `summarize.voice-1`).
