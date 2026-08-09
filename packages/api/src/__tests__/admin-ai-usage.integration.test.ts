import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { getPool, resetPool } from '../db/client.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { newId } from '../lib/ids.js';
import {
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { setAdminPassword } from '../services/admin-auth.js';
import { makeUserId } from './factories/index.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'ai-usage-operations@harpapro.com';
const ADMIN_PASSWORD = 'ai usage operations admin password deliberately long';
const ADMIN_CLIENT_IP = '203.0.113.92';
const PRIVATE_EMAIL = 'private-ai-ledger-user@example.com';
const PRIVATE_VENDOR = 'private-vendor-secret';
const PRIVATE_MODELS = [
  'private-chat-model',
  'private-transcription-model',
  'private-missing-duration-model',
] as const;

interface AiCallOutcome {
  succeeded: number;
  failed: number;
  total: number;
}

interface AiOperationUsage {
  liveSucceeded: number;
  liveFailed: number;
  recordSucceeded: number;
  recordFailed: number;
  replaySucceeded: number;
  replayFailed: number;
}

interface SuccessfulProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputSeconds: number;
}

interface AiUsageWindowBody {
  windowStart: string;
  windowEnd: string;
  recordedEventCount: number;
  calls: Record<'live' | 'record' | 'replay', AiCallOutcome>;
  successfulProviderUsage: SuccessfulProviderUsage;
  operations: Record<'chat' | 'generateReport' | 'transcribe', AiOperationUsage>;
  providers: Array<{
    provider: 'openai' | 'groq' | 'kimi' | 'other';
    recordedEventCount: number;
    calls: Record<'live' | 'record' | 'replay', AiCallOutcome>;
    successfulProviderUsage: SuccessfulProviderUsage;
    lastRecordedAt: string;
  }>;
  unclassifiedVendorEventCount: number;
  missingInputSecondsEventCount: number;
  lastRecordedAt: string | null;
  warnings: Array<'unclassified_vendor_events' | 'missing_transcription_duration'>;
}

interface AvailableAiUsageObservation {
  observedAt: string;
  status: 'available';
  source: 'harpa_usage_ledger';
  monthToDate: AiUsageWindowBody;
  last24Hours: AiUsageWindowBody;
  providerCapacity: Record<
    'openai' | 'groq' | 'kimi',
    { status: 'unknown'; reason: 'not_observed' }
  >;
  caveats: string[];
}

let fx: PgFixture;
let adminFx: AdminPgFixture;
let seedClient: pg.Client;
let adminCookie: string;
let adminIdentityId: string;
let adminSessionId: string;
let privateUserId: string;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let adminRateLimiter: RecordingRateLimiter;

class RecordingRateLimiter implements RateLimiter {
  readonly calls: Array<{ key: string; limit: number; windowMs: number }> = [];

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return { success: true, limit, remaining: limit - 1, reset: Date.now() + windowMs };
  }
}

class FailingAppRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimiterResult> {
    throw new Error('application rate limiter must not run for dedicated admin operations');
  }
}

function limiterName(key: string): string {
  const separator = key.indexOf(':fn:');
  return separator === -1 ? key : key.slice(0, separator);
}

function expectExactAiUsageIdentitySessionLimit(
  call: { key: string; limit: number; windowMs: number } | undefined,
): void {
  const expectedPrefix = 'admin.operations.ai-usage.read.1m:fn:';
  expect(call).toEqual({
    key: `${expectedPrefix}${adminIdentityId}:${adminSessionId}`,
    limit: 12,
    windowMs: 60_000,
  });
  expect(call?.key).not.toBe(`${expectedPrefix}${ADMIN_CLIENT_IP}`);
  expect(call?.key).not.toBe(`${expectedPrefix}${adminIdentityId}`);
}

function adminRequest(cookie = adminCookie): RequestInit {
  return {
    headers: {
      cookie,
      origin: ADMIN_ORIGIN,
      'fly-client-ip': ADMIN_CLIENT_IP,
    },
  };
}

function failingProviderFetch() {
  return vi.fn<typeof fetch>(async () => {
    throw new Error('AI usage ledger observation must not call a provider');
  });
}

function expectWindowTotals(window: AvailableAiUsageObservation['monthToDate']): void {
  expect(window).toMatchObject({
    recordedEventCount: 4,
    calls: {
      live: { succeeded: 2, failed: 0, total: 2 },
      record: { succeeded: 1, failed: 0, total: 1 },
      replay: { succeeded: 0, failed: 1, total: 1 },
    },
    successfulProviderUsage: {
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 10,
      inputSeconds: 12.345,
    },
    operations: {
      chat: {
        liveSucceeded: 1,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
      generateReport: {
        liveSucceeded: 0,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 1,
      },
      transcribe: {
        liveSucceeded: 1,
        liveFailed: 0,
        recordSucceeded: 1,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
    },
    unclassifiedVendorEventCount: 1,
    missingInputSecondsEventCount: 1,
    lastRecordedAt: expect.any(String),
  });
  expect(window.warnings).toHaveLength(2);
  expect(window.warnings).toEqual(
    expect.arrayContaining(['unclassified_vendor_events', 'missing_transcription_duration']),
  );
  expect(window.providers).toHaveLength(4);
  expect(window.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        provider: 'openai',
        recordedEventCount: 1,
        calls: {
          live: { succeeded: 1, failed: 0, total: 1 },
          record: { succeeded: 0, failed: 0, total: 0 },
          replay: { succeeded: 0, failed: 0, total: 0 },
        },
        successfulProviderUsage: {
          inputTokens: 100,
          outputTokens: 20,
          cachedTokens: 10,
          inputSeconds: 0,
        },
      }),
      expect.objectContaining({
        provider: 'groq',
        recordedEventCount: 1,
        calls: {
          live: { succeeded: 0, failed: 0, total: 0 },
          record: { succeeded: 1, failed: 0, total: 1 },
          replay: { succeeded: 0, failed: 0, total: 0 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 12.345,
        },
      }),
      expect.objectContaining({
        provider: 'kimi',
        recordedEventCount: 1,
        calls: {
          live: { succeeded: 1, failed: 0, total: 1 },
          record: { succeeded: 0, failed: 0, total: 0 },
          replay: { succeeded: 0, failed: 0, total: 0 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 0,
        },
      }),
      expect.objectContaining({
        provider: 'other',
        recordedEventCount: 1,
        calls: {
          live: { succeeded: 0, failed: 0, total: 0 },
          record: { succeeded: 0, failed: 0, total: 0 },
          replay: { succeeded: 0, failed: 1, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 0,
        },
      }),
    ]),
  );
}

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  await resetAdminPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);

  privateUserId = makeUserId();
  await seedAuthUsers(fx.url, [
    {
      id: privateUserId,
      email: PRIVATE_EMAIL,
      displayName: 'Private AI Ledger User',
    },
  ]);

  const now = Date.now();
  seedClient = new pg.Client({ connectionString: fx.url });
  await seedClient.connect();
  await seedClient.query(
    `INSERT INTO app.llm_usage_events
       (id, user_id, vendor, model, operation, input_tokens, output_tokens,
        cached_tokens, input_seconds, latency_ms, fixture_mode, status, created_at)
     VALUES
       ($1, $5, 'openai', $6, 'chat', 100, 20, 10, NULL, 1, 'live', 'ok', $10),
       ($2, $5, 'groq', $7, 'transcribe', 0, 0, 0, 12.345, 1, 'record', 'ok', $11),
       ($3, $5, $8, $8, 'generate_report', 777, 888, 99, NULL, 1, 'replay', 'error', $12),
       ($4, $5, 'kimi', $9, 'transcribe', 555, 666, 44, NULL, 1, 'live', 'ok', $13)`,
    [
      newId('lue'),
      newId('lue'),
      newId('lue'),
      newId('lue'),
      privateUserId,
      PRIVATE_MODELS[0],
      PRIVATE_MODELS[1],
      PRIVATE_VENDOR,
      PRIVATE_MODELS[2],
      new Date(now - 4 * 60_000),
      new Date(now - 3 * 60_000),
      new Date(now - 2 * 60_000),
      new Date(now - 60_000),
    ],
  );

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const login = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
      'fly-client-ip': ADMIN_CLIENT_IP,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (login.status !== 200) throw new Error(`dedicated admin login failed with ${login.status}`);
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('dedicated admin login did not set a cookie');
  adminCookie = setCookie.split(';')[0]!;

  const activeSession = await getAdminPool().query<{
    identity_id: string;
    session_id: string;
  }>(
    `SELECT identity.id::text AS identity_id,
            session.id::text AS session_id
     FROM admin.sessions AS session
     JOIN admin.identities AS identity
       ON identity.id = session.admin_identity_id
     WHERE identity.email = $1
       AND session.revoked_at IS NULL
     ORDER BY session.created_at DESC
     LIMIT 1`,
    [ADMIN_EMAIL],
  );
  const loggedInSession = activeSession.rows[0];
  if (!loggedInSession) throw new Error('dedicated admin login did not persist an active session');
  adminIdentityId = loggedInSession.identity_id;
  adminSessionId = loggedInSession.session_id;
}, 120_000);

beforeEach(() => {
  resetRateLimiter();
  setRateLimiter(new FailingAppRateLimiter());
  adminRateLimiter = new RecordingRateLimiter();
  setAdminRateLimiter(adminRateLimiter);
  fetchImpl = failingProviderFetch();
  vi.stubGlobal('fetch', fetchImpl);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetRateLimiter();
  resetAdminRateLimiter();
  await seedClient?.end();
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

describe('GET /admin/operations/ai-usage', () => {
  it('uses one default-wired database query and returns only aggregate ledger data', async () => {
    const query = vi.spyOn(getPool(), 'query');
    const response = await (async () => {
      try {
        const result = await createApp().request('/admin/operations/ai-usage', adminRequest());
        expect(query).toHaveBeenCalledOnce();
        return result;
      } finally {
        query.mockRestore();
      }
    })();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = (await response.json()) as AvailableAiUsageObservation;
    expect(body.status).toBe('available');
    if (body.status !== 'available') throw new Error('expected available AI usage observation');

    expect(Object.keys(body).sort()).toEqual([
      'caveats',
      'last24Hours',
      'monthToDate',
      'observedAt',
      'providerCapacity',
      'source',
      'status',
    ]);
    expect(body).toMatchObject({
      status: 'available',
      source: 'harpa_usage_ledger',
      providerCapacity: {
        openai: { status: 'unknown', reason: 'not_observed' },
        groq: { status: 'unknown', reason: 'not_observed' },
        kimi: { status: 'unknown', reason: 'not_observed' },
      },
      caveats: [
        'best_effort_ledger',
        'not_provider_billing',
        'replay_not_provider_usage',
        'record_mode_calls_provider',
        'deleted_history_excluded',
      ],
    });

    expect(body.monthToDate.windowEnd).toBe(body.observedAt);
    expect(body.last24Hours.windowEnd).toBe(body.observedAt);
    const observedAt = new Date(body.observedAt);
    expect(body.monthToDate.windowStart).toBe(
      new Date(Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), 1)).toISOString(),
    );
    expect(new Date(body.last24Hours.windowStart).getTime()).toBe(
      observedAt.getTime() - 24 * 60 * 60 * 1_000,
    );
    expectWindowTotals(body.monthToDate);
    expectWindowTotals(body.last24Hours);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.ai-usage.read.1m',
    ]);
    expect(adminRateLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expectExactAiUsageIdentitySessionLimit(adminRateLimiter.calls[1]);

    const serialized = JSON.stringify(body);
    for (const secret of [privateUserId, PRIVATE_EMAIL, PRIVATE_VENDOR, ...PRIVATE_MODELS]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps private no-store and skips the ledger when the admin cookie is absent', async () => {
    const query = vi.spyOn(getPool(), 'query');
    try {
      const response = await createApp().request('/admin/operations/ai-usage', {
        headers: { 'fly-client-ip': ADMIN_CLIENT_IP },
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const serializedBody = JSON.stringify(await response.json());
      for (const secret of [
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
        adminIdentityId,
        adminSessionId,
        privateUserId,
        PRIVATE_EMAIL,
        PRIVATE_VENDOR,
        ...PRIVATE_MODELS,
      ]) {
        expect(serializedBody).not.toContain(secret);
      }
      expect(query).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(adminRateLimiter.calls).toEqual([
        {
          key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
          limit: 120,
          windowMs: 60_000,
        },
      ]);
    } finally {
      query.mockRestore();
    }
  });

  it('keeps private no-store and skips the ledger on the isolated 12/min limit', async () => {
    class RejectingAiUsageLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.ai-usage.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    const rejectingLimiter = new RejectingAiUsageLimiter();
    setAdminRateLimiter(rejectingLimiter);
    const query = vi.spyOn(getPool(), 'query');
    try {
      const response = await createApp().request('/admin/operations/ai-usage', adminRequest());

      expect(response.status).toBe(429);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const serializedBody = JSON.stringify(await response.json());
      for (const secret of [
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
        adminIdentityId,
        adminSessionId,
        privateUserId,
        PRIVATE_EMAIL,
        PRIVATE_VENDOR,
        ...PRIVATE_MODELS,
      ]) {
        expect(serializedBody).not.toContain(secret);
      }
      expect(query).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(rejectingLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
        'admin.auth.ip.1m',
        'admin.operations.ai-usage.read.1m',
      ]);
      expect(rejectingLimiter.calls[0]).toEqual({
        key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
        limit: 120,
        windowMs: 60_000,
      });
      expectExactAiUsageIdentitySessionLimit(rejectingLimiter.calls[1]);
    } finally {
      query.mockRestore();
    }
  });
});
