import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

const input = resolve(process.argv[2] ?? 'tests/fixtures/blocks.ifc');
const siteUrl = process.argv[3];
const artifact = resolve('artifacts');
await mkdir(artifact, { recursive: true });
const serverRequests = [];
const server = createStaticServer(undefined, serverRequests);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = siteUrl ? new URL(siteUrl).origin : `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { sample: input, bytes: (await stat(input)).size, cases: [], errors: [] };
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
  });
  for (const offline of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const requests = [];
    context.on('request', (request) => {
      let frameUrl = null;
      try {
        frameUrl = request.frame().url();
      } catch {
        // Dedicated-worker requests may have no owning frame.
      }
      requests.push({
        method: request.method(),
        url: request.url(),
        bytesSent: request.postDataBuffer()?.length ?? 0,
        frameUrl,
      });
    });
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(siteUrl ?? origin);
    const frame = page;
    await frame.waitForFunction(
      () => document.querySelector('.viewer')?.dataset.workerReady === 'true',
    );
    await page.waitForLoadState('networkidle');
    const theme = await frame.evaluate(async () => {
      await document.fonts.ready;
      const styles = getComputedStyle(document.documentElement);
      return {
        tokens: Object.fromEntries(
          ['--background', '--foreground', '--accent', '--radius'].map((token) => [
            token,
            styles.getPropertyValue(token).trim(),
          ]),
        ),
        font: [...document.fonts].some(
          (face) => face.family === 'Inter Variable' && face.status === 'loaded',
        ),
      };
    });
    assert.ok(theme.font, 'The local Harpa Pro Inter font must load');
    const initialRequestCount = requests.length;
    if (offline) await context.setOffline(true);
    const started = Date.now();
    await frame.locator('#model-file').setInputFiles(input);
    await frame.waitForFunction(
      () => ['ready', 'error'].includes(document.querySelector('.viewer')?.dataset.state),
      null,
      { timeout: 240000 },
    );
    const result = await frame.locator('.viewer').evaluate((element) => ({ ...element.dataset }));
    const text = await frame.locator('aside').innerText();
    const viewerRequests = requests.slice(initialRequestCount);
    await page.screenshot({
      path: `${artifact}/viewer-${offline ? 'offline' : 'online'}.png`,
      fullPage: true,
    });
    report.cases.push({
      offline,
      seconds: (Date.now() - started) / 1000,
      result,
      text,
      requests: requests.slice(initialRequestCount),
      viewerRequests,
    });
    await writeFile(`${artifact}/browser-report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.cases.at(-1)));
    assert.equal(result.state, 'ready', text);
    assert.ok(Number(result.meshes) > 0);
    assert.ok(Number(result.triangles) > 0);
    assert.ok(
      requests.every(
        (request) =>
          request.method === 'GET' && request.bytesSent === 0 && request.url.startsWith(origin),
      ),
    );
    assert.equal(
      viewerRequests.length,
      0,
      'The viewer must make no HTTP requests during local conversion after preload',
    );
    await frame.getByRole('button', { name: 'Top view' }).click();
    await frame.getByRole('button', { name: 'Fit model' }).click();
    if (offline) await context.setOffline(false);
    await frame.getByRole('button', { name: 'Clear file' }).click();
    assert.equal(await frame.locator('.viewer').getAttribute('data-state'), 'empty');
    assert.equal(await frame.locator('.viewer').getAttribute('data-meshes'), '0');
    await frame.locator('#model-file').setInputFiles({
      name: 'model.rvt',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('a Revit file is not IFC'),
    });
    await frame.waitForFunction(() => document.querySelector('.viewer')?.dataset.state === 'error');
    assert.match(await frame.locator('#status').innerText(), /exported to IFC/);
    // Replacing a failed file must start a fresh worker without requiring Clear.
    await frame.locator('#model-file').setInputFiles({
      name: 'invalid.ifc',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not an IFC file'),
    });
    await frame.waitForFunction(() => document.querySelector('.viewer')?.dataset.state === 'error');
    assert.equal(await frame.locator('#file-name').innerText(), 'invalid.ifc');
    await frame.locator('#model-file').setInputFiles(input);
    await frame.waitForFunction(() => document.querySelector('.viewer')?.dataset.state === 'ready');
    assert.ok(Number(await frame.locator('.viewer').getAttribute('data-triangles')) > 0);
    await frame.getByRole('button', { name: 'Clear file' }).click();
    await frame.evaluate(() =>
      document
        .querySelector('#model-file')
        .addEventListener('change', () => document.querySelector('#cancel').click(), {
          once: true,
        }),
    );
    await frame.locator('#model-file').setInputFiles(input);
    assert.equal(await frame.locator('.viewer').getAttribute('data-state'), 'empty');
    assert.match(await frame.locator('#status').innerText(), /cancelled/);
    await frame.locator('#model-file').setInputFiles(input);
    await frame.waitForFunction(() => document.querySelector('.viewer')?.dataset.state === 'ready');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${artifact}/viewer-mobile.png`, fullPage: true });
    assert.ok(
      requests.every(
        (request) =>
          request.method === 'GET' && request.bytesSent === 0 && request.url.startsWith(origin),
      ),
    );
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.serverRequests = serverRequests;
  await writeFile(`${artifact}/browser-report.json`, JSON.stringify(report, null, 2));
  console.log(
    'PASS: online, offline, no upload requests, controls, clear, invalid input, cancellation and mobile layout',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
