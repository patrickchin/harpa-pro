import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { csp } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = new URL('../../../apps/site/', import.meta.url);
const siteRequire = createRequire(new URL('package.json', site));
const viewerRequire = createRequire(new URL('../package.json', import.meta.url));
const ifcRoot = new URL('./', pathToFileURL(viewerRequire.resolve('web-ifc')));
const siteStyles = await readFile(new URL('src/styles/globals.css', site), 'utf8');
const siteTokens = siteStyles.match(/:root\s*\{[^}]*\}/)?.[0];
if (!siteTokens) throw new Error('The Harpa Pro website colour tokens could not be found.');
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/assets/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { viewer: 'src/viewer.js', converter: 'src/converter.js' },
  outdir: 'dist/assets',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'linked',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await writeFile(
  new URL('../dist/index.html', import.meta.url),
  (await readFile(new URL('../index.html', import.meta.url), 'utf8')).replace(
    '__VIEWER_CSP__',
    csp,
  ),
);
// A real 404 disables Pages' automatic SPA fallback for missing WASM/scripts.
await writeFile(
  new URL('../dist/404.html', import.meta.url),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Page not found — Harpa Pro</title><link rel="stylesheet" href="/assets/style.css">' +
    '<main><aside><h1>Page not found</h1><p><a href="/">Return to the IFC viewer</a></p></aside></main></html>',
);
await cp(new URL('web-ifc.wasm', ifcRoot), new URL('../dist/assets/web-ifc.wasm', import.meta.url));
await cp(
  new URL('LICENSE.md', ifcRoot),
  new URL('../dist/assets/web-ifc-LICENSE.txt', import.meta.url),
);
await cp(
  new URL('../LICENSE', pathToFileURL(viewerRequire.resolve('three'))),
  new URL('../dist/assets/three-LICENSE.txt', import.meta.url),
);
await cp(
  new URL('public/brand-icon.svg', site),
  new URL('../dist/assets/brand-icon.svg', import.meta.url),
);
await writeFile(
  new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url),
  'This viewer uses web-ifc 0.0.78, unmodified, under MPL-2.0.\n' +
    'Licence: assets/web-ifc-LICENSE.txt\n' +
    'Corresponding source and build instructions: https://github.com/ThatOpen/engine_web-ifc/tree/4310503d8618a0870c2166f101471078d528f4c1\n\n' +
    'Three.js 0.180.0: MIT; see assets/three-LICENSE.txt\n' +
    'Inter Variable: SIL Open Font License; see assets/inter-LICENSE.txt\n',
);
await writeFile(
  new URL('../dist/assets/style.css', import.meta.url),
  `${siteTokens}\n@font-face { font-family: 'Inter Variable'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('./inter-latin-wght-normal.woff2') format('woff2'); }\n${await readFile(new URL('../src/style.css', import.meta.url), 'utf8')}`,
);
const fontFile = siteRequire.resolve(
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
);
await cp(fontFile, new URL('../dist/assets/inter-latin-wght-normal.woff2', import.meta.url));
await cp(
  new URL('../LICENSE', pathToFileURL(fontFile)),
  new URL('../dist/assets/inter-LICENSE.txt', import.meta.url),
);
// Static hosts such as Cloudflare Pages and Netlify honour this file for workers too.
await writeFile(
  new URL('../dist/_headers', import.meta.url),
  `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`,
);
console.log('Built static IFC viewer in dist/. No backend or model assets included.');
