#!/usr/bin/env node
/*
 * Local-only auth broker for Maestro dev-deployment runs.
 *
 * Maestro writes evaluated env/input values into debug logs, so the shared
 * test-account password must stay in this CLI process instead of being passed
 * to a flow. The mobile app does GET /session?email=<addr>, receives
 * { password }, then calls authClient.signIn.email({ email, password })
 * directly so the better-auth cookie lands in expo-secure-store.
 *
 * The broker never forwards the password to Maestro — only the mobile app
 * process sees it at runtime.
 *
 * Required env (in .env.local or process.env):
 *   TEST_ACCOUNT_PASSWORD — shared password for all test accounts
 *
 * Optional:
 *   TEST_ACCOUNT_EMAILS   — comma-separated allowlisted e-mail addresses
 *                           (defaults to test/test2/test3@harpapro.com)
 *   E2E_AUTH_BROKER_PORT  — listen port (default 8790)
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const workspaceRoot = process.cwd();
const localEnv = readDotEnv(path.join(workspaceRoot, '.env.local'));
const env = { ...localEnv, ...process.env };

const password =
  env.TEST_ACCOUNT_PASSWORD || env.MAESTRO_DEV_TEST_ACCOUNT_PASSWORD || '';
const defaultEmails = 'test@harpapro.com,test2@harpapro.com,test3@harpapro.com';
const allowedEmails = new Set(
  (env.TEST_ACCOUNT_EMAILS || env.MAESTRO_DEV_TEST_ACCOUNT_EMAILS || defaultEmails)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
const port = Number(env.E2E_AUTH_BROKER_PORT || 8790);

if (!password || allowedEmails.size === 0) {
  console.error(
    'dev-e2e-auth-broker requires TEST_ACCOUNT_PASSWORD in .env.local or the process env.',
  );
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    setJsonHeaders(res);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== 'GET' || url.pathname !== '/session') {
      return sendJson(res, 404, {
        error: { code: 'not_found', message: 'Unknown auth broker route.' },
      });
    }

    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    if (!email || !allowedEmails.has(email)) {
      return sendJson(res, 403, {
        error: { code: 'forbidden', message: 'Email is not allowlisted for E2E.' },
      });
    }

    console.log(`${new Date().toISOString()} -> session ${maskEmail(email)}`);
    // Return the password so the mobile app can call authClient.signIn.email()
    // itself — that's the only way better-auth populates the expo-secure-store
    // cookie on the device.
    sendJson(res, 200, { password });
    console.log(`${new Date().toISOString()} <- 200 session ${maskEmail(email)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth broker failed.';
    sendJson(res, 502, {
      error: { code: 'auth_broker_error', message },
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`dev-e2e-auth-broker listening on 127.0.0.1:${port}`);
});

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return result;
}

function setJsonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
}

function sendJson(res, status, body) {
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function maskEmail(email) {
  const at = email.indexOf('@');
  if (at <= 1) return '***@***';
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}
