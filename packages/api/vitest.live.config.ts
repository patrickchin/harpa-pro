import { defineConfig } from 'vitest/config';

/**
 * Live-LLM lane — hits the real providers (OpenAI, Groq) using
 * repo-secret API keys. NEVER runs in the default unit or
 * integration suites; gated by the dedicated `ai-live.yml`
 * workflow (and runnable locally with
 * `AI_LIVE=1 OPENAI_API_KEY=… pnpm --filter @harpa/api test:live`).
 *
 * Catches prompt/schema drift in the report-generation path that
 * fixtures cannot detect — see docs/v4/pitfalls.md Pitfall 13 and
 * docs/bugs/README.md "Prompt/schema drift in generateReport".
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.live.test.ts'],
    // Real network calls — give the provider plenty of room and
    // run files serially so we don't burn rate limit.
    testTimeout: 120_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
