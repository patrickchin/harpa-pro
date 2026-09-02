import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PgFixture } from './setup-pg.js';

const TEST_EMAIL = 'seed-cli@e2e.harpapro.com';
const ORIGINAL_PASSWORD = 'original-password-12345';
const UPDATED_PASSWORD = 'updated-password-67890';
const API_DIR = fileURLToPath(new URL('../..', import.meta.url));
const execFileAsync = promisify(execFile);

let fx: PgFixture;
let createApp: typeof import('../app.js').createApp;
let getPool: typeof import('../db/client.js').getPool;

async function runSeedCli(password: string): Promise<string> {
  const commandEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: fx.url,
    NODE_ENV: 'test',
    EMAIL_OTP_LIVE: '0',
    TEST_ACCOUNT_EMAILS: TEST_EMAIL,
    TEST_ACCOUNT_PASSWORD: password,
  };
  delete commandEnv.DEMO_ACCOUNT_EMAILS;
  delete commandEnv.DEMO_ACCOUNT_PASSWORD;

  const { stdout } = await execFileAsync('pnpm', ['db:seed-test-account'], {
    cwd: API_DIR,
    env: commandEnv,
    timeout: 60_000,
  });
  return stdout;
}

async function signIn(password: string): Promise<Response> {
  return createApp().request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password }),
  });
}

async function readSeededAccount(): Promise<{
  userId: string;
  credentialId: string;
  passwordHash: string;
}> {
  const users = await getPool().query<{ id: string }>(
    `SELECT id FROM public."user" WHERE email = $1`,
    [TEST_EMAIL],
  );
  expect(users.rows).toHaveLength(1);

  const userId = users.rows[0]!.id;
  const credentials = await getPool().query<{
    id: string;
    issuer: string;
    account_id: string;
    provider_id: string;
    password: string | null;
  }>(
    `SELECT id, issuer, account_id, provider_id, password
       FROM public."account"
      WHERE user_id = $1`,
    [userId],
  );
  expect(credentials.rows).toHaveLength(1);
  expect(credentials.rows[0]).toMatchObject({
    issuer: 'local:credential',
    account_id: userId,
    provider_id: 'credential',
  });
  expect(credentials.rows[0]!.password).toEqual(expect.any(String));

  return {
    userId,
    credentialId: credentials.rows[0]!.id,
    passwordHash: credentials.rows[0]!.password!,
  };
}

beforeAll(async () => {
  process.env.TEST_ACCOUNT_EMAILS = TEST_EMAIL;
  process.env.TEST_ACCOUNT_PASSWORD = UPDATED_PASSWORD;
  process.env.EMAIL_OTP_LIVE = '0';

  vi.resetModules();
  const setupPg = await import('./setup-pg.js');
  const dbClient = await import('../db/client.js');
  getPool = dbClient.getPool;

  fx = await setupPg.startPg();
  process.env.DATABASE_URL = fx.url;
  await dbClient.resetPool();
  getPool(fx.url);
  ({ createApp } = await import('../app.js'));
}, 120_000);

afterAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.TEST_ACCOUNT_EMAILS;
  delete process.env.TEST_ACCOUNT_PASSWORD;
  delete process.env.EMAIL_OTP_LIVE;
  await fx?.stop();
}, 60_000);

describe('seed-test-account CLI', () => {
  it('creates one credential, reruns idempotently, and replaces its password', async () => {
    const createdOutput = await runSeedCli(ORIGINAL_PASSWORD);
    expect(createdOutput).toContain(
      `[seed-test-account] created test-account ${TEST_EMAIL}; credential created`,
    );
    const created = await readSeededAccount();

    const rerunOutput = await runSeedCli(ORIGINAL_PASSWORD);
    expect(rerunOutput).toContain(
      `[seed-test-account] test-account ${TEST_EMAIL} user exists; credential updated`,
    );
    const rerun = await readSeededAccount();
    expect(rerun.userId).toBe(created.userId);
    expect(rerun.credentialId).toBe(created.credentialId);

    const initialSignIn = await signIn(ORIGINAL_PASSWORD);
    expect(initialSignIn.status).toBe(200);
    expect(initialSignIn.headers.get('set-auth-token')).toBeTruthy();

    await runSeedCli(UPDATED_PASSWORD);
    const updated = await readSeededAccount();
    expect(updated.userId).toBe(created.userId);
    expect(updated.credentialId).toBe(created.credentialId);
    expect(updated.passwordHash).not.toBe(rerun.passwordHash);

    const oldPasswordSignIn = await signIn(ORIGINAL_PASSWORD);
    expect(oldPasswordSignIn.status).toBe(401);
    expect(oldPasswordSignIn.headers.get('set-auth-token')).toBeNull();

    const updatedPasswordSignIn = await signIn(UPDATED_PASSWORD);
    expect(updatedPasswordSignIn.status).toBe(200);
    expect(updatedPasswordSignIn.headers.get('set-auth-token')).toBeTruthy();
  }, 120_000);
});
