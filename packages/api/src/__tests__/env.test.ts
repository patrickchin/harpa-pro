/**
 * Env parse-time refines.
 *
 * env.ts calls `Env.parse(process.env)` at module load (single eager
 * parse), so each case mutates `process.env`, calls `vi.resetModules()`
 * to drop the cached module graph, and dynamic-imports the module to
 * re-trigger the parse.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEYS = [
  'NODE_ENV',
  'HARPAPRO_PR_BUILD',
  'EMAIL_OTP_LIVE',
  'MIGRATIONS_REQUIRED_HEAD',
  'ADMIN_MIGRATIONS_REQUIRED_HEAD',
  'DATABASE_URL',
  'ADMIN_DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ADMIN_CORS_ORIGINS',
  'AI_FIXTURE_MODE',
  'AI_LIVE',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'R2_FIXTURE_MODE',
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'TURNSTILE_LIVE',
  'TURNSTILE_SECRET_KEY',
  'RESEND_LIVE',
  'RESEND_API_KEY',
  'RATE_LIMIT_BACKEND',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_PASSWORD',
  'DEMO_ACCOUNT_EMAILS',
  'DEMO_ACCOUNT_PASSWORD',
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
    string,
    string | undefined
  >;
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k] as string;
  }
  vi.resetModules();
});

async function freshImportEnv(): Promise<typeof import('../env.js')> {
  vi.resetModules();
  return await import('../env.js');
}

function setValidProductionEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HARPAPRO_PR_BUILD: '0',
    EMAIL_OTP_LIVE: '1',
    MIGRATIONS_REQUIRED_HEAD: '0000_test.sql',
    ADMIN_MIGRATIONS_REQUIRED_HEAD: '0001_admin_auth.sql',
    DATABASE_URL: 'postgres://app:test@localhost:5432/harpa',
    ADMIN_DATABASE_URL: 'postgres://admin:test@localhost:5433/harpa_admin',
    BETTER_AUTH_SECRET: 'test-only-production-auth-secret-over-32-chars',
    AI_FIXTURE_MODE: 'live',
    AI_LIVE: '1',
    OPENAI_API_KEY: 'test-openai-key',
    GROQ_API_KEY: 'test-groq-key',
    R2_FIXTURE_MODE: 'live',
    R2_ACCOUNT_ID: 'test-r2-account',
    R2_ACCESS_KEY_ID: 'test-r2-access-key',
    R2_SECRET_ACCESS_KEY: 'test-r2-secret-key',
    TURNSTILE_LIVE: '1',
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
    RESEND_LIVE: '1',
    RESEND_API_KEY: 'test-resend-key',
    RATE_LIMIT_BACKEND: 'postgres',
  });
}

describe('env: email OTP transport', () => {
  it('rejects fake OTP transport on real production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    await expect(freshImportEnv()).rejects.toThrow(/EMAIL_OTP_LIVE/);
  });

  it('accepts fake OTP transport on PR previews', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD = '0001_admin_auth.sql';
    process.env.ADMIN_DATABASE_URL = 'postgres://admin:test@localhost:5433/harpa_admin';
    process.env.BETTER_AUTH_SECRET = 'test-only-preview-auth-secret-over-32-chars';
    process.env.BETTER_AUTH_URL = 'https://harpa-pro-api-pr-42.fly.dev';
    process.env.ADMIN_CORS_ORIGINS = 'https://pr-42.harpa-pro-admin.pages.dev';

    const mod = await freshImportEnv();
    expect(mod.env.EMAIL_OTP_LIVE).toBe('0');
  });
});

describe('env: production services fail closed', () => {
  it('accepts a fully configured production environment', async () => {
    setValidProductionEnv();

    const mod = await freshImportEnv();

    expect(mod.env.RATE_LIMIT_BACKEND).toBe('postgres');
  });

  it('rejects the development Better Auth secret in production', async () => {
    setValidProductionEnv();
    delete process.env.BETTER_AUTH_SECRET;

    await expect(freshImportEnv()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it('rejects a short Better Auth secret in production', async () => {
    setValidProductionEnv();
    process.env.BETTER_AUTH_SECRET = 'test-secret-24-characters';

    await expect(freshImportEnv()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each([
    ['AI_FIXTURE_MODE', 'replay'],
    ['AI_LIVE', '0'],
    ['R2_FIXTURE_MODE', 'replay'],
    ['TURNSTILE_LIVE', '0'],
    ['RESEND_LIVE', '0'],
    ['RATE_LIMIT_BACKEND', 'memory'],
  ] as const)('rejects %s=%s in production', async (key, value) => {
    setValidProductionEnv();
    process.env[key] = value;

    await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
  });

  it.each(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const)(
    'rejects live R2 without %s',
    async (key) => {
      setValidProductionEnv();
      delete process.env[key];

      await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
    },
  );

  it('accepts an explicit R2 endpoint instead of an account ID', async () => {
    setValidProductionEnv();
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ENDPOINT = 'http://localhost:9000';

    const mod = await freshImportEnv();

    expect(mod.env.R2_ENDPOINT).toBe('http://localhost:9000');
  });

  it('rejects live Turnstile without its secret', async () => {
    setValidProductionEnv();
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(freshImportEnv()).rejects.toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('rejects live Resend without its API key', async () => {
    setValidProductionEnv();
    delete process.env.RESEND_API_KEY;

    await expect(freshImportEnv()).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('allows fixture-backed services on PR previews', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      HARPAPRO_PR_BUILD: '1',
      EMAIL_OTP_LIVE: '0',
      MIGRATIONS_REQUIRED_HEAD: '0000_test.sql',
      ADMIN_MIGRATIONS_REQUIRED_HEAD: '0001_admin_auth.sql',
      ADMIN_DATABASE_URL: 'postgres://admin:test@localhost:5433/harpa_admin',
      BETTER_AUTH_SECRET: 'test-only-preview-auth-secret-over-32-chars',
      BETTER_AUTH_URL: 'https://harpa-pro-api-pr-42.fly.dev',
      ADMIN_CORS_ORIGINS: 'https://pr-42.harpa-pro-admin.pages.dev',
      AI_FIXTURE_MODE: 'replay',
      AI_LIVE: '0',
      R2_FIXTURE_MODE: 'replay',
      TURNSTILE_LIVE: '0',
      RESEND_LIVE: '0',
      RATE_LIMIT_BACKEND: 'memory',
    });

    const mod = await freshImportEnv();

    expect(mod.env.HARPAPRO_PR_BUILD).toBe('1');
  });

  it('requires the independent admin database in production', async () => {
    setValidProductionEnv();
    delete process.env.ADMIN_DATABASE_URL;

    await expect(freshImportEnv()).rejects.toThrow(/ADMIN_DATABASE_URL/);
  });

  it('requires the admin migration head in production', async () => {
    setValidProductionEnv();
    delete process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD;

    await expect(freshImportEnv()).rejects.toThrow(/ADMIN_MIGRATIONS_REQUIRED_HEAD/);
  });

  it('rejects an identical app and admin database URL in production', async () => {
    setValidProductionEnv();
    process.env.ADMIN_DATABASE_URL = process.env.DATABASE_URL;

    await expect(freshImportEnv()).rejects.toThrow(/ADMIN_DATABASE_URL/);
  });

  it('rejects direct and pooled forms of the same Neon endpoint', async () => {
    setValidProductionEnv();
    process.env.DATABASE_URL =
      'postgres://app:test@ep-example-pooler.eu-central-1.aws.neon.tech/harpa';
    process.env.ADMIN_DATABASE_URL =
      'postgres://admin:test@ep-example.eu-central-1.aws.neon.tech/harpa_admin';

    await expect(freshImportEnv()).rejects.toThrow(/ADMIN_DATABASE_URL/);
  });
});

describe('env: admin database isolation', () => {
  it.each(['development', 'test'] as const)('rejects the app endpoint in %s', async (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;
    process.env.DATABASE_URL =
      'postgres://app:test@ep-example-pooler.eu-central-1.aws.neon.tech/harpa';
    process.env.ADMIN_DATABASE_URL =
      'postgres://admin:test@ep-example.eu-central-1.aws.neon.tech/harpa_admin';

    await expect(freshImportEnv()).rejects.toThrow(/same Postgres endpoint/);
  });

  it('accepts separate Testcontainers endpoints', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:54320/harpa';
    process.env.ADMIN_DATABASE_URL = 'postgres://test:test@127.0.0.1:54321/harpa_admin';

    const mod = await freshImportEnv();

    expect(mod.env.DATABASE_URL).toBe(process.env.DATABASE_URL);
    expect(mod.env.ADMIN_DATABASE_URL).toBe(process.env.ADMIN_DATABASE_URL);
  });
});

describe('env: Postgres connection URLs', () => {
  it.each(['DATABASE_URL', 'ADMIN_DATABASE_URL'] as const)(
    'rejects a non-Postgres %s',
    async (key) => {
      process.env.NODE_ENV = 'test';
      process.env[key] = 'https://example.com/database';

      await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
    },
  );

  it.each(['DATABASE_URL', 'ADMIN_DATABASE_URL'] as const)(
    'rejects a malformed %s that only has a Postgres prefix',
    async (key) => {
      process.env.NODE_ENV = 'test';
      process.env[key] = 'postgres://';

      await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
    },
  );

  it.each([
    ['DATABASE_URL', 'postgres://user:pw@database-host'],
    ['DATABASE_URL', 'postgres://user:pw@database-host/'],
    ['ADMIN_DATABASE_URL', 'postgresql://user:pw@admin-host'],
    ['ADMIN_DATABASE_URL', 'postgresql://user:pw@admin-host/'],
  ] as const)('rejects %s without a database pathname', async (key, value) => {
    process.env.NODE_ENV = 'test';
    process.env[key] = value;

    await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
  });

  it('accepts both Postgres URL schemes', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://app:test@app-db:5432/harpa';
    process.env.ADMIN_DATABASE_URL = 'postgres://admin:test@admin-db:5432/harpa_admin';

    const mod = await freshImportEnv();

    expect(mod.env.DATABASE_URL).toBe(process.env.DATABASE_URL);
    expect(mod.env.ADMIN_DATABASE_URL).toBe(process.env.ADMIN_DATABASE_URL);
  });
});

describe('env: admin browser origins', () => {
  const productionAdminOrigin = 'https://admin.harpapro.com';
  const developmentAdminOrigin = 'https://dev.harpa-pro-admin.pages.dev';
  const previewAdminOrigin = 'https://pr-42.harpa-pro-admin.pages.dev';

  it('accepts the dedicated production admin origin for the production API', async () => {
    setValidProductionEnv();
    process.env.BETTER_AUTH_URL = 'https://api.harpapro.com';
    process.env.ADMIN_CORS_ORIGINS = productionAdminOrigin;

    const mod = await freshImportEnv();

    expect(mod.env.ADMIN_CORS_ORIGINS).toBe(productionAdminOrigin);
  });

  it('accepts the stable admin Pages origin for the development API', async () => {
    setValidProductionEnv();
    process.env.BETTER_AUTH_URL = 'https://harpa-pro-api-dev.fly.dev';
    process.env.ADMIN_CORS_ORIGINS = developmentAdminOrigin;

    const mod = await freshImportEnv();

    expect(mod.env.ADMIN_CORS_ORIGINS).toBe(developmentAdminOrigin);
  });

  it('accepts the matching admin Pages origin for a PR preview API', async () => {
    setValidProductionEnv();
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.BETTER_AUTH_URL = 'https://harpa-pro-api-pr-42.fly.dev';
    process.env.ADMIN_CORS_ORIGINS = previewAdminOrigin;

    const mod = await freshImportEnv();

    expect(mod.env.ADMIN_CORS_ORIGINS).toBe(previewAdminOrigin);
  });

  it.each([
    ['production API', 'https://api.harpapro.com', '0', developmentAdminOrigin],
    ['production API public host', 'https://api.harpapro.com', '0', 'https://harpapro.com'],
    [
      'production API public www host',
      'https://api.harpapro.com',
      '0',
      'https://www.harpapro.com',
    ],
    [
      'development API legacy public Pages host',
      'https://harpa-pro-api-dev.fly.dev',
      '0',
      'https://dev.harpa-pro.pages.dev',
    ],
    [
      'development API preview host',
      'https://harpa-pro-api-dev.fly.dev',
      '0',
      previewAdminOrigin,
    ],
    [
      'PR preview with another PR number',
      'https://harpa-pro-api-pr-42.fly.dev',
      '1',
      'https://pr-41.harpa-pro-admin.pages.dev',
    ],
    [
      'PR preview on the public Pages project',
      'https://harpa-pro-api-pr-42.fly.dev',
      '1',
      'https://pr-42.harpa-pro.pages.dev',
    ],
  ] as const)(
    'rejects an admin origin outside the dedicated surface for the %s',
    async (_case, betterAuthUrl, prBuild, adminOrigin) => {
      setValidProductionEnv();
      process.env.HARPAPRO_PR_BUILD = prBuild;
      process.env.BETTER_AUTH_URL = betterAuthUrl;
      process.env.ADMIN_CORS_ORIGINS = adminOrigin;

      await expect(freshImportEnv()).rejects.toThrow(/ADMIN_CORS_ORIGINS|admin origin/);
    },
  );
});

describe('env: test account access', () => {
  it('rejects TEST_ACCOUNT_EMAILS without TEST_ACCOUNT_PASSWORD', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS = 'test@harpapro.com';
    delete process.env.TEST_ACCOUNT_PASSWORD;

    await expect(freshImportEnv()).rejects.toThrow(/TEST_ACCOUNT_PASSWORD/);
  });

  it('accepts stable test emails plus password', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS = 'test@harpapro.com, test2@harpapro.com, test3@harpapro.com';
    process.env.TEST_ACCOUNT_PASSWORD = 'test-password-12345';

    const mod = await freshImportEnv();
    expect(mod.env.TEST_ACCOUNT_EMAILS).toBe(
      'test@harpapro.com, test2@harpapro.com, test3@harpapro.com',
    );
    expect(mod.env.TEST_ACCOUNT_PASSWORD).toBe('test-password-12345');
  });

  it('rejects test passwords shorter than 16 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS = 'test@harpapro.com';
    process.env.TEST_ACCOUNT_PASSWORD = 'short';

    await expect(freshImportEnv()).rejects.toThrow(/TEST_ACCOUNT_PASSWORD|at least 16/);
  });
});

describe('env: demo account access', () => {
  it('rejects DEMO_ACCOUNT_EMAILS without DEMO_ACCOUNT_PASSWORD', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo@harpapro.com';
    delete process.env.DEMO_ACCOUNT_PASSWORD;

    await expect(freshImportEnv()).rejects.toThrow(/DEMO_ACCOUNT_PASSWORD/);
  });

  it('accepts configured demo emails plus password', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo@harpapro.com, demo2@harpapro.com, demo3@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'demo-password-12345';

    const mod = await freshImportEnv();
    expect(mod.env.DEMO_ACCOUNT_EMAILS).toBe(
      'demo@harpapro.com, demo2@harpapro.com, demo3@harpapro.com',
    );
    expect(mod.env.DEMO_ACCOUNT_PASSWORD).toBe('demo-password-12345');
  });

  it('rejects demo passwords shorter than 16 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'short';

    await expect(freshImportEnv()).rejects.toThrow(/DEMO_ACCOUNT_PASSWORD|at least 16/);
  });

  it('rejects unsupported demo emails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo4@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'demo-password-12345';

    await expect(freshImportEnv()).rejects.toThrow(/demo/);
  });
});
