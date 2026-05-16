# AI fixtures (`packages/ai-fixtures`)

> Resolves [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in).

## Goals

1. **No real LLM calls in CI**, ever.
2. **Easy to record a new fixture** when a new endpoint or prompt
   is added (`pnpm fixtures:record <name>`).
3. **Deterministic replay** in tests + `:mock` builds — same input
   always produces the same fixture output.
4. **Provider-agnostic** — same API for Kimi, OpenAI, Anthropic,
   Google, Z.AI, DeepSeek.
5. **Redacted by default** — no PII / no API keys in committed
   fixtures.

## Layout

```
packages/ai-fixtures/
  src/
    index.ts           # createProvider({ fixtureMode })
    providers/
      openai.ts
      anthropic.ts
      kimi.ts
      google.ts
      zai.ts
      deepseek.ts
    fixture-store.ts   # read/write fixtures/<name>.json
    redact.ts          # PII redaction
    hash.ts            # canonical-json hash for fixture lookup
  fixtures/
    transcribe.basic.json              # openai (Whisper) — only vendor with transcribe
    summarize.basic.json               # openai default
    summarize.basic.<vendor>.json      # one per non-default vendor
    generate-report.full.json          # openai default
    generate-report.full.<vendor>.json
    generate-report.incomplete.json    # openai default
    generate-report.incomplete.<vendor>.json
    …
  package.json
```

`<vendor>` ∈ {`kimi`, `anthropic`, `google`, `zai`, `deepseek`}.
OpenAI keeps the un-suffixed names for backwards compat.
`services/ai.ts` picks the per-vendor fixture name based on the
caller's `vendor` argument (which the route handler reads from
`getAiSettings()` once that's wired). Each vendor has its own
canonical model id (e.g. `claude-3-5-haiku` for anthropic
summarize) — see `VENDOR_MODELS` in `packages/api/src/services/ai.ts`.

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
  "fixtureName": "transcribe.basic",
  "recordedAt": "2026-05-12T00:00:00Z",
  "requestHash": "sha256:a7c3…",
  "request": { "...redacted summary..." : true },
  "response": {
    "text": "Site arrival 8:15. Crew of three…",
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
    fixtureName: 'transcribe.basic',
  }).transcribe({ audioUrl });
```

Route handlers pick the fixture name based on a deterministic
mapping (e.g. by report id in `:mock` builds, or by an explicit
header `X-Fixture-Name` accepted only when
`AI_FIXTURE_MODE !== 'live'`).

## Recording a new fixture

```bash
# 1. Set creds, set mode, run a single test that exercises the path.
AI_FIXTURE_MODE=record OPENAI_API_KEY=… pnpm test:api -- transcribe.basic

# 2. Inspect, commit.
git add packages/ai-fixtures/fixtures/transcribe.basic.json
git commit -m "test(ai-fixtures): record transcribe.basic"
```

Pre-commit hook checks fixture files for un-redacted strings
matching API key patterns or +1[0-9]{10} phone numbers other than
`+10000000000`.

## Mobile `:mock` build

The `:mock` build sets `EXPO_PUBLIC_USE_FIXTURES=true`, which makes
the API client always send `X-Fixture-Mode: replay` and pick a
predictable fixture name based on the screen flow being demoed
(e.g. recording a voice note in `:mock` always replays
`transcribe.basic` then `summarize.basic`).
