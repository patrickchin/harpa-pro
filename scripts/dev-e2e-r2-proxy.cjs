#!/usr/bin/env node
/*
 * Local R2 proxy for dev-deployment Maestro runs.
 *
 * Android devices in the local E2E setup reach localhost through adb reverse,
 * while public R2 endpoints can be blocked by the device network. The API
 * proxy rewrites signed R2 URLs to this process; this process forwards the
 * request to the original signed URL with the original Host header.
 */
const http = require('node:http');
const https = require('node:https');
const {
  ProxyTargetError,
  parseApiRequestTarget,
  parseR2Target,
} = require('./dev-e2e-proxy-security.cjs');

function createR2ProxyServer() {
  return http.createServer((req, res) => {
    const started = Date.now();
    let incoming;
    try {
      incoming = new URL(parseApiRequestTarget(req.url || '/'), 'http://dev-e2e-r2-proxy.invalid');
    } catch {
      writeJsonError(res, 400, 'invalid_r2_target', 'Invalid R2 proxy request target.');
      return;
    }

    const rawTarget = incoming.searchParams.get('url');
    if (!rawTarget || incoming.pathname !== '/r2') {
      writeJsonError(res, 404, 'not_found', 'Unknown R2 proxy route.');
      return;
    }

    let target;
    try {
      target = parseR2Target(rawTarget, req.method);
    } catch (error) {
      const status =
        error instanceof ProxyTargetError && error.code === 'method_not_allowed' ? 405 : 400;
      const code = status === 405 ? 'method_not_allowed' : 'invalid_r2_target';
      writeJsonError(
        res,
        status,
        code,
        error instanceof Error ? error.message : 'Invalid R2 target.',
      );
      return;
    }

    console.log(`${new Date().toISOString()} -> R2 ${req.method} ${target.host}${target.pathname}`);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers, host: target.host };
      delete headers.connection;
      delete headers['proxy-connection'];
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      if (body.length > 0) headers['content-length'] = String(body.length);

      const upstream = https.request(
        {
          protocol: 'https:',
          hostname: target.hostname,
          port: 443,
          path: `${target.pathname}${target.search}`,
          method: req.method,
          headers,
        },
        (up) => {
          console.log(
            `${new Date().toISOString()} <- R2 ${up.statusCode || 502} ${req.method} ${target.pathname} ${Date.now() - started}ms`,
          );
          res.writeHead(up.statusCode || 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', (error) => {
        console.log(
          `${new Date().toISOString()} !! R2 ${req.method} ${target.pathname} ${error.message}`,
        );
        writeJsonError(res, 502, 'r2_proxy_error', 'R2 proxy failed.');
      });
      if (body.length > 0) upstream.write(body);
      upstream.end();
    });
  });
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
  const port = Number(process.env.E2E_R2_PROXY_PORT || 8791);
  const server = createR2ProxyServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`dev-e2e-r2-proxy listening on 127.0.0.1:${port}`);
  });
}

module.exports = { createR2ProxyServer };
