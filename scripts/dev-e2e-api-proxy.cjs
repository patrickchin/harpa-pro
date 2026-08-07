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
const { isPresignedR2Url, parseApiRequestTarget } = require('./dev-e2e-proxy-security.cjs');

function createApiProxyServer({ target, r2ProxyBase }) {
  const upstreamTarget = validateApiTarget(target);
  return http.createServer((req, res) => {
    const started = Date.now();
    let requestPath;
    try {
      requestPath = parseApiRequestTarget(req.url || '/');
    } catch {
      writeJsonError(
        res,
        400,
        'invalid_proxy_target',
        'Dev API proxy accepts relative request paths only.',
      );
      return;
    }

    console.log(`${new Date().toISOString()} -> ${req.method} ${requestPath}`);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers, host: upstreamTarget.host };
      delete headers.connection;
      delete headers['proxy-connection'];
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      delete headers['accept-encoding'];
      if (body.length > 0) headers['content-length'] = String(body.length);

      const upstream = https.request(
        {
          protocol: 'https:',
          hostname: upstreamTarget.hostname,
          port: upstreamTarget.port || undefined,
          path: requestPath,
          method: req.method,
          headers,
        },
        (up) => {
          const responseChunks = [];
          up.on('data', (chunk) => responseChunks.push(chunk));
          up.on('end', () => {
            const responseBody = Buffer.concat(responseChunks);
            const rewritten = rewriteJsonResponse(up.headers, responseBody, r2ProxyBase);
            const responseHeaders = { ...up.headers };
            delete responseHeaders['content-length'];
            if (rewritten !== responseBody) {
              delete responseHeaders['content-encoding'];
              responseHeaders['content-length'] = String(rewritten.length);
            }
            console.log(
              `${new Date().toISOString()} <- ${up.statusCode || 502} ${req.method} ${requestPath} ${Date.now() - started}ms`,
            );
            res.writeHead(up.statusCode || 502, responseHeaders);
            res.end(rewritten);
          });
        },
      );
      upstream.on('error', (error) => {
        console.log(`${new Date().toISOString()} !! ${req.method} ${requestPath} ${error.message}`);
        writeJsonError(res, 502, 'proxy_error', 'Dev API proxy failed.');
      });
      if (body.length > 0) upstream.write(body);
      upstream.end();
    });
  });
}

function rewriteJsonResponse(headers, body, r2ProxyBase) {
  const contentType = String(headers['content-type'] || '');
  if (!contentType.includes('application/json') || body.length === 0) return body;
  try {
    const json = JSON.parse(body.toString('utf8'));
    const rewritten = rewriteValue(json, r2ProxyBase);
    return Buffer.from(JSON.stringify(rewritten));
  } catch {
    return body;
  }
}

function rewriteValue(value, r2ProxyBase) {
  if (typeof value === 'string') return rewriteUrl(value, r2ProxyBase);
  if (Array.isArray(value)) return value.map((child) => rewriteValue(child, r2ProxyBase));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, rewriteValue(child, r2ProxyBase)]),
  );
}

function rewriteUrl(value, r2ProxyBase) {
  if (isPresignedR2Url(value)) {
    return `${r2ProxyBase}${encodeURIComponent(value)}`;
  }
  return value;
}

function validateApiTarget(value) {
  const target = value instanceof URL ? new URL(value.toString()) : new URL(value);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error('E2E_API_TARGET_URL must be an HTTPS origin without credentials.');
  }
  return target;
}

function writeJsonError(res, status, code, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

if (require.main === module) {
  const target = new URL(process.env.E2E_API_TARGET_URL || 'https://harpa-pro-api-dev.fly.dev');
  const port = Number(process.env.E2E_API_PROXY_PORT || 8788);
  const r2ProxyBase = process.env.E2E_R2_PROXY_BASE || 'http://127.0.0.1:8791/r2?url=';
  const server = createApiProxyServer({ target, r2ProxyBase });
  server.listen(port, '127.0.0.1', () => {
    console.log(`dev-e2e-api-proxy listening on 127.0.0.1:${port}`);
  });
}

module.exports = { createApiProxyServer, rewriteJsonResponse };
