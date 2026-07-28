/**
 * Authenticated route guard for live AI mode.
 *
 * The test boots the real app + scoped Postgres wiring with AI_LIVE=1
 * and stubs only the provider HTTP boundary. A caller-controlled
 * fixtureName must not downgrade the request to checked-in replay data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type App = Awaited<typeof import('../app.js')>['createApp'];
type PgFixture = import('./setup-pg.js').PgFixture;
type FetchArgs = [input: string | URL | Request, init?: RequestInit];

let createApp: App;
let signTestToken: typeof import('../middleware/auth.js').signTestToken;
let fx: PgFixture;
let alice: string;
let aliceSid: string;

beforeAll(async () => {
  vi.stubEnv('AI_LIVE', '1');
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai-fixture-safety');
  vi.stubEnv('GROQ_API_KEY', 'gsk-test-groq-fixture-safety');
  vi.resetModules();

  const pgHelpers = await import('./setup-pg.js');
  fx = await pgHelpers.startPg();
  process.env.DATABASE_URL = fx.url;

  const db = await import('../db/client.js');
  db.getPool(fx.url);

  const factories = await import('./factories/index.js');
  alice = factories.makeUserId();
  aliceSid = factories.makeSessionId();
  await pgHelpers.seedAuthUsers(fx.url, [{ id: alice }]);

  ({ createApp } = await import('../app.js'));
  ({ signTestToken } = await import('../middleware/auth.js'));
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fx?.stop();
}, 60_000);

describe('authenticated AI fixture safety', () => {
  it('POST /voice/summarize stays live when the caller supplies fixtureName', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Live provider response',
                  summary: 'The authenticated request reached the live provider boundary.',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const token = await signTestToken(alice, aliceSid);
    const res = await createApp().request('/voice/summarize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        transcript: 'Current authenticated site observation.',
        fixtureName: 'summarize.voice-1',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      summary: 'The authenticated request reached the live provider boundary.',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
  });
});
