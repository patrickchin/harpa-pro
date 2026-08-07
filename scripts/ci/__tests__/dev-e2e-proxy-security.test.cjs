#!/usr/bin/env node

const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { after, test } = require('node:test');

const {
  isPresignedR2Url,
  parseApiRequestTarget,
  parseR2Target,
} = require('../../dev-e2e-proxy-security.cjs');
const { createApiProxyServer, rewriteJsonResponse } = require('../../dev-e2e-api-proxy.cjs');
const { createR2ProxyServer } = require('../../dev-e2e-r2-proxy.cjs');

const servers = [];

after(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function signedR2Url(hostname = 'account.r2.cloudflarestorage.com') {
  const url = new URL(`https://${hostname}/harpa-pro-dev/users/test/file.jpg`);
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', 'test/20260807/auto/s3/aws4_request');
  url.searchParams.set('X-Amz-Date', '20260807T000000Z');
  url.searchParams.set('X-Amz-Expires', '300');
  url.searchParams.set('X-Amz-SignedHeaders', 'host');
  url.searchParams.set('X-Amz-Signature', 'a'.repeat(64));
  return url.toString();
}

async function listen(server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

async function request(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('API request targets stay relative to the configured upstream origin', () => {
  assert.equal(parseApiRequestTarget('/v1/reports?limit=20'), '/v1/reports?limit=20');
  assert.throws(() => parseApiRequestTarget('https://127.0.0.1/internal'));
  assert.throws(() => parseApiRequestTarget('//127.0.0.1/internal'));
  assert.throws(() => parseApiRequestTarget('/\\127.0.0.1/internal'));
});

test('R2 targets require HTTPS, a strict Cloudflare R2 host, and a SigV4 query', () => {
  assert.equal(isPresignedR2Url(signedR2Url()), true);
  assert.equal(isPresignedR2Url(signedR2Url('public-id.r2.dev')), true);

  const invalidTargets = [
    signedR2Url('r2.cloudflarestorage.com.evil.test'),
    signedR2Url('evilcloudflarestorage.com'),
    signedR2Url('127.0.0.1'),
    signedR2Url('[::1]'),
    signedR2Url('2130706433'),
    signedR2Url('account.r2.cloudflarestorage.com').replace('https:', 'http:'),
    signedR2Url('account.r2.cloudflarestorage.com').replace('https://', 'https://user:password@'),
    signedR2Url('account.r2.cloudflarestorage.com').replace('.com/', '.com:8443/'),
    'file:///etc/passwd',
    'https://account.r2.cloudflarestorage.com/unsigned-object',
  ];

  for (const target of invalidTargets) {
    assert.equal(isPresignedR2Url(target), false, target);
  }

  assert.equal(parseR2Target(signedR2Url(), 'PUT').hostname, 'account.r2.cloudflarestorage.com');
  assert.throws(() => parseR2Target(signedR2Url(), 'POST'));
  assert.throws(() => parseR2Target(signedR2Url(), 'DELETE'));
});

test('API JSON rewriting accepts signed R2 URLs and ignores hostname lookalikes', () => {
  const allowed = signedR2Url();
  const lookalike = signedR2Url('r2.cloudflarestorage.com.evil.test');
  const body = Buffer.from(JSON.stringify({ allowed, lookalike }));
  const rewritten = rewriteJsonResponse(
    { 'content-type': 'application/json' },
    body,
    'http://127.0.0.1:8791/r2?url=',
  );

  assert.deepEqual(JSON.parse(rewritten.toString('utf8')), {
    allowed: `http://127.0.0.1:8791/r2?url=${encodeURIComponent(allowed)}`,
    lookalike,
  });
});

test('API proxy rejects absolute-form request targets before opening an upstream request', async () => {
  const server = createApiProxyServer({
    target: new URL('https://harpa-pro-api-dev.fly.dev'),
    r2ProxyBase: 'http://127.0.0.1:8791/r2?url=',
  });
  const port = await listen(server);

  const response = await request(port, 'https://127.0.0.1/internal');
  assert.equal(response.status, 400);
  assert.match(response.body, /invalid_proxy_target/);
});

test('R2 proxy cannot reach a loopback HTTP service', async () => {
  let sentinelHits = 0;
  const sentinel = http.createServer((_req, res) => {
    sentinelHits += 1;
    res.end('unexpected');
  });
  const sentinelPort = await listen(sentinel);
  const proxyPort = await listen(createR2ProxyServer());

  const target = encodeURIComponent(`http://127.0.0.1:${sentinelPort}/internal`);
  const response = await request(proxyPort, `/r2?url=${target}`);

  assert.equal(response.status, 400);
  assert.match(response.body, /invalid_r2_target/);
  assert.equal(sentinelHits, 0);
});
