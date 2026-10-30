import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createStaticServer } from '../scripts/serve.mjs';

test('serves local engine and licence assets and rejects uploads', async () => {
  const requests = [];
  const server = createStaticServer(undefined, requests);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of [
      '/',
      '/assets/converter.js',
      '/assets/web-ifc.wasm',
      '/assets/inter-latin-wght-normal.woff2',
      '/THIRD_PARTY_NOTICES.txt',
    ]) {
      const response = await fetch(url + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
      assert.match(response.headers.get('content-security-policy'), /'wasm-unsafe-eval'/);
      assert.match(response.headers.get('content-security-policy'), /worker-src 'self'/);
      assert.match(response.headers.get('content-security-policy'), /font-src 'self'/);
      if (path.endsWith('.woff2')) assert.equal(response.headers.get('content-type'), 'font/woff2');
      if (path.endsWith('.wasm'))
        assert.equal(response.headers.get('content-type'), 'application/wasm');
      if (path.endsWith('.txt')) {
        const text = await response.text();
        assert.match(text, /MPL-2.0/);
        assert.match(text, /4310503d8618a0870c2166f101471078d528f4c1/);
      }
    }
    const upload = await fetch(url + '/upload', { method: 'POST', body: 'test-model-bytes' });
    assert.equal(upload.status, 405);
    assert.equal(upload.headers.get('allow'), 'GET, HEAD');
    const sample = await fetch(url + '/samples/AC20-FZK-Haus.ifc');
    assert.equal(sample.status, 404);
    assert.equal((await fetch(url + '/assets/missing.wasm')).status, 404);
    assert.equal(requests.filter((request) => request.method === 'POST').length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
