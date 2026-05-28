#!/usr/bin/env node
/*
 * Local-only auth broker for Maestro dev-deployment runs.
 *
 * Maestro writes evaluated env/input values into debug logs, so the shared
 * test-account password must stay in this CLI process instead of being passed
 * to a flow. The mobile app fetches /session over adb reverse, then stores the
 * returned token through the normal auth session code.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const workspaceRoot = process.cwd();
const localEnv = readDotEnv(path.join(workspaceRoot, '.env.local'));
const env = { ...localEnv, ...process.env };

const apiUrl = trimSlash(env.E2E_AUTH_API_URL || 'https://harpa-pro-api-dev.fly.dev');
const password =
  env.TEST_ACCOUNT_PASSWORD || env.MAESTRO_DEV_TEST_ACCOUNT_PASSWORD || '';
const allowedPhones = new Set(
  (env.TEST_ACCOUNT_PHONES || env.MAESTRO_DEV_TEST_ACCOUNT_PHONES || '')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean),
);
const port = Number(env.E2E_AUTH_BROKER_PORT || 8790);

if (!password || allowedPhones.size === 0) {
  console.error(
    'dev-e2e-auth-broker requires TEST_ACCOUNT_PHONES and TEST_ACCOUNT_PASSWORD in .env.local or the process env.',
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

    const phone = normalizePhone(url.searchParams.get('phone') || '');
    if (!allowedPhones.has(phone)) {
      return sendJson(res, 403, {
        error: { code: 'forbidden', message: 'Phone is not allowlisted for E2E.' },
      });
    }

    const started = Date.now();
    console.log(`${new Date().toISOString()} -> session ${maskPhone(phone)}`);
    const upstream = await fetch(`${apiUrl}/auth/password/verify`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, password }),
    });
    const text = await upstream.text();
    console.log(
      `${new Date().toISOString()} <- ${upstream.status} session ${maskPhone(phone)} ${Date.now() - started}ms`,
    );
    res.writeHead(upstream.status);
    res.end(text);
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

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

function maskPhone(phone) {
  if (phone.length <= 5) return '***';
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

function normalizePhone(value) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed.replace(/^ /, '+');
}
