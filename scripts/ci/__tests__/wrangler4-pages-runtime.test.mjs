import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parse, printParseErrorCode } = require('jsonc-parser');
const Ajv = require('ajv');

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const wranglerPackage = require('wrangler/package.json');
const miniflarePackagePath = require.resolve('miniflare/package.json');
const miniflarePackage = require(miniflarePackagePath);
const requireFromMiniflare = createRequire(miniflarePackagePath);
const undiciPackage = requireFromMiniflare('undici/package.json');

assert.equal(
  Number.parseInt(wranglerPackage.version.split('.')[0] ?? '', 10),
  4,
  `expected Wrangler 4, found ${wranglerPackage.version}`,
);
assert.equal(
  Number.parseInt(miniflarePackage.version.split('.')[0] ?? '', 10),
  5,
  `expected Miniflare 5, found ${miniflarePackage.version}`,
);

const [undiciMajor = 0, undiciMinor = 0] = undiciPackage.version
  .split('.')
  .map((part) => Number.parseInt(part, 10));
assert.ok(
  undiciMajor > 7 || (undiciMajor === 7 && undiciMinor >= 29),
  `expected the patched Undici 7.29+ runtime, found ${undiciPackage.version}`,
);

const schema = require(join(repoRoot, 'node_modules/wrangler/config-schema.json'));
const validate = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
  validateFormats: false,
}).compile(schema);

for (const relativePath of ['apps/site/wrangler.jsonc', 'apps/admin/wrangler.jsonc']) {
  const parseErrors = [];
  const config = parse(
    require('node:fs').readFileSync(join(repoRoot, relativePath), 'utf8'),
    parseErrors,
    { allowTrailingComma: true },
  );
  assert.deepEqual(
    parseErrors,
    [],
    `${relativePath} is invalid JSONC: ${parseErrors
      .map((error) => printParseErrorCode(error.error))
      .join(', ')}`,
  );
  assert.equal(
    validate(config),
    true,
    `${relativePath} does not match Wrangler 4 config-schema.json: ${JSON.stringify(
      validate.errors,
    )}`,
  );
}

const { Miniflare } = await import('miniflare');
const miniflare = new Miniflare({
  compatibilityDate: '2026-05-01',
  modules: true,
  script: `
    export default {
      async fetch(request) {
        return Response.json({
          method: request.method,
          pathname: new URL(request.url).pathname,
        });
      },
    };
  `,
});

try {
  const response = await miniflare.dispatchFetch('https://pages.local/runtime-smoke', {
    method: 'POST',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: 'POST',
    pathname: '/runtime-smoke',
  });
} finally {
  await miniflare.dispose();
}

console.log(
  `wrangler-pages-runtime: wrangler ${wranglerPackage.version}, miniflare ${miniflarePackage.version}, undici ${undiciPackage.version}; configs valid; HTTP smoke passed`,
);
