# Shared packages

## `packages/api-contract`

Single source of truth for HTTP shape.

- `src/schemas/*.ts` — Zod schemas, organised by resource
  (projects, reports, notes, files, voice, settings, auth).
- `src/openapi.ts` — `@hono/zod-openapi` route definitions
  re-exported so `packages/api` builds its router from them.
- `src/generated/types.ts` — `openapi-typescript` output. Never
  hand-edit. Regenerated via `pnpm gen:types`.
- `src/index.ts` — re-exports schemas + types for clients.

CI gate: `pnpm spec:emit && pnpm gen:types && git diff --exit-code`.

## `packages/ai-fixtures`

See [arch-ai-fixtures.md](arch-ai-fixtures.md).

- `src/index.ts` — `createProvider` factory.
- `src/providers/*.ts` — per-vendor adapters (openai, anthropic,
  kimi, google, zai, deepseek).
- `src/fixture-store.ts` — read/write JSON.
- `src/redact.ts` — PII redaction.
- `fixtures/*.json` — committed fixtures.

## `packages/ui` (optional, P2.1+)

Started only if two runtime apps need the same component implementation.
`apps/site` is Astro/Tailwind and does not share UI primitives with NativeWind
mobile code. Default: keep primitives inside
`apps/mobile/components/primitives/` and do not extract them for docs.

## `packages/api`

Not "shared" — it's the API server. Lives alongside the others
because the workspace is a monorepo. See
[arch-api-design.md](arch-api-design.md).
