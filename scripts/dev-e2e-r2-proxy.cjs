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

const port = Number(process.env.E2E_R2_PROXY_PORT || 8791);

const server = http.createServer((req, res) => {
  const started = Date.now();
  const incoming = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const rawTarget = incoming.searchParams.get('url');
  if (!rawTarget || incoming.pathname !== '/r2') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'not_found', message: 'Unknown R2 proxy route.' } }));
    return;
  }

  const target = new URL(rawTarget);
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

    const transport = target.protocol === 'http:' ? http : https;
    const upstream = transport.request(target, { method: req.method, headers }, (up) => {
      console.log(
        `${new Date().toISOString()} <- R2 ${up.statusCode || 502} ${req.method} ${target.pathname} ${Date.now() - started}ms`,
      );
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', (error) => {
      console.log(`${new Date().toISOString()} !! R2 ${req.method} ${target.pathname} ${error.message}`);
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'r2_proxy_error', message: 'R2 proxy failed.' } }));
    });
    if (body.length > 0) upstream.write(body);
    upstream.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`dev-e2e-r2-proxy listening on 127.0.0.1:${port}`);
});
