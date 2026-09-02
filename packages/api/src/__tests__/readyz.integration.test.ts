/**
 * Integration tests for /readyz — Pitfall 13 (test the default wiring).
 *
 * Runs against a real Postgres via Testcontainers so we exercise the
 * actual `pg` driver, not a stub. Covers:
 *   1. schema-missing  → 503 before any migration
 *   2. ok              → 200 after migrate() runs
 *   3. head-mismatch   → 503 when env.MIGRATIONS_REQUIRED_HEAD lies
 *   4. db: down        → 503 when the DB goes away
 *
 * Companion: docs/v4/arch-cicd-and-migrations.md §Tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { resetReadyzCache } from '../routes/readyz.js';

let container: StartedPostgreSqlContainer;
let url: string;
const AI_USAGE_INDEX_MIGRATION = '0029_llm_usage_events_created_at.notx.sql';
const CURRENT_MIGRATION_HEAD = '0032_better_auth_account_issuer.sql';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();
}, 120_000);

afterAll(async () => {
  await resetPool();
  await container?.stop();
});

beforeEach(async () => {
  await resetPool();
  resetReadyzCache();
  delete process.env.MIGRATIONS_REQUIRED_HEAD;
  process.env.DATABASE_URL = url;
});

describe('GET /readyz', () => {
  it('returns 503 schema-missing before migrations are applied', async () => {
    // Fresh DB: terminate other sessions then drop+recreate the public
    // schema so prior tests' tables are gone.
    const tmpPool = getPool(url);
    await tmpPool.query(`DROP SCHEMA IF EXISTS app CASCADE`);
    await tmpPool.query(`DROP SCHEMA IF EXISTS auth CASCADE`);
    await tmpPool.query(`DROP SCHEMA public CASCADE`);
    await tmpPool.query(`CREATE SCHEMA public`);
    await resetPool();
    getPool(url);
    resetReadyzCache();

    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; db: string };
    expect(body.ok).toBe(false);
    expect(body.db).toBe('schema-missing');
  });

  it('returns 200 ok with head=<last filename> after migrate()', async () => {
    await migrate(url);
    resetReadyzCache();
    getPool(url);

    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: string; head: string };
    expect(body).toMatchObject({ ok: true, db: 'up' });
    expect(body.head).toMatch(/^[0-9]+_[a-z0-9_]+(?:\.notx)?\.sql$/);
  });

  it('preserves the exact non-transactional filename while comparing heads', async () => {
    await migrate(url);
    process.env.MIGRATIONS_REQUIRED_HEAD = AI_USAGE_INDEX_MIGRATION;
    resetReadyzCache();
    getPool(url);

    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: boolean;
      db: string;
      expected: string;
      actual: string;
    };
    expect(body).toEqual({
      ok: false,
      db: 'head-mismatch',
      expected: AI_USAGE_INDEX_MIGRATION,
      actual: CURRENT_MIGRATION_HEAD,
    });
  });

  it('does not normalize away the non-transactional suffix when comparing heads', async () => {
    await migrate(url);
    process.env.MIGRATIONS_REQUIRED_HEAD = '0029_llm_usage_events_created_at.sql';
    resetReadyzCache();
    getPool(url);

    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: boolean;
      db: string;
      expected?: string;
      actual?: string;
    };
    expect(body).toEqual({
      ok: false,
      db: 'head-mismatch',
      expected: '0029_llm_usage_events_created_at.sql',
      actual: CURRENT_MIGRATION_HEAD,
    });
  });

  it('returns 503 head-mismatch when MIGRATIONS_REQUIRED_HEAD does not match', async () => {
    await migrate(url);
    process.env.MIGRATIONS_REQUIRED_HEAD = '999912312359_not_a_real_migration.sql';
    resetReadyzCache();
    getPool(url);

    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: boolean;
      db: string;
      expected?: string;
      actual?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.db).toBe('head-mismatch');
    expect(body.expected).toBe('999912312359_not_a_real_migration.sql');
    expect(body.actual).toMatch(/^[0-9]+_[a-z0-9_]+(?:\.notx)?\.sql$/);
  });

  it('returns 503 db: down when the pool is closed', async () => {
    await migrate(url);
    const app = createApp();
    // Warm the cache then close the pool — we still expect 503 because
    // the cache TTL is only 2s and we reset it explicitly.
    resetReadyzCache();
    await resetPool();
    process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/nope';

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; db: string };
    expect(body.ok).toBe(false);
    expect(body.db).toBe('down');
  });
});
