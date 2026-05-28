#!/usr/bin/env node
/*
 * Local API proxy for dev-deployment Maestro runs.
 *
 * The device reaches this server through adb reverse. JSON responses are
 * lightly rewritten so signed R2 URLs point at the local R2 proxy; the R2
 * proxy then forwards to the original signed URL.
 */
const http = require('node:http');
const https = require('node:https');

const target = new URL(process.env.E2E_API_TARGET_URL || 'https://harpa-pro-api-dev.fly.dev');
const port = Number(process.env.E2E_API_PROXY_PORT || 8788);
const r2ProxyBase = process.env.E2E_R2_PROXY_BASE || 'http://127.0.0.1:8791/r2?url=';

const server = http.createServer((req, res) => {
  const started = Date.now();
  console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`);
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url || '/', target);
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;
    delete headers['proxy-connection'];
    delete headers['transfer-encoding'];
    delete headers['content-length'];
    delete headers['accept-encoding'];
    if (body.length > 0) headers['content-length'] = String(body.length);

    const upstream = https.request(url, { method: req.method, headers }, (up) => {
      const responseChunks = [];
      up.on('data', (chunk) => responseChunks.push(chunk));
      up.on('end', () => {
        const responseBody = Buffer.concat(responseChunks);
        const rewritten = rewriteJsonResponse(up.headers, responseBody);
        const responseHeaders = { ...up.headers };
        delete responseHeaders['content-length'];
        if (rewritten !== responseBody) {
          delete responseHeaders['content-encoding'];
          responseHeaders['content-length'] = String(rewritten.length);
        }
        console.log(
          `${new Date().toISOString()} <- ${up.statusCode || 502} ${req.method} ${req.url} ${Date.now() - started}ms`,
        );
        res.writeHead(up.statusCode || 502, responseHeaders);
        res.end(rewritten);
      });
    });
    upstream.on('error', (error) => {
      console.log(`${new Date().toISOString()} !! ${req.method} ${req.url} ${error.message}`);
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'proxy_error', message: 'Dev API proxy failed.' } }));
    });
    if (body.length > 0) upstream.write(body);
    upstream.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`dev-e2e-api-proxy listening on 127.0.0.1:${port}`);
});

function rewriteJsonResponse(headers, body) {
  const contentType = String(headers['content-type'] || '');
  if (!contentType.includes('application/json') || body.length === 0) return body;
  try {
    const json = JSON.parse(body.toString('utf8'));
    const rewritten = rewriteValue(json);
    return Buffer.from(JSON.stringify(rewritten));
  } catch {
    return body;
  }
}

function rewriteValue(value) {
  if (typeof value === 'string') return rewriteUrl(value);
  if (Array.isArray(value)) return value.map(rewriteValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, rewriteValue(child)]),
  );
}

function rewriteUrl(value) {
  try {
    const url = new URL(value);
    if (isR2Host(url.hostname)) {
      return `${r2ProxyBase}${encodeURIComponent(value)}`;
    }
  } catch {
    // Not a URL.
  }
  return value;
}

function isR2Host(hostname) {
  return (
    hostname.includes('r2.cloudflarestorage.com') ||
    hostname.endsWith('.r2.dev') ||
    hostname.includes('cloudflarestorage.com')
  );
}
