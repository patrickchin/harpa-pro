#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
);
const lockfile = fs.readFileSync(
  path.join(repoRoot, 'pnpm-lock.yaml'),
  'utf8',
);

const overrideKey = 'react-devtools-core>shell-quote';
const secureVersion = '1.10.0';
const overrides = packageJson.pnpm?.overrides ?? {};

const shellQuoteOverrideKeys = Object.keys(overrides).filter(
  (key) => key === 'shell-quote' || key.endsWith('>shell-quote'),
);

assert.deepEqual(
  shellQuoteOverrideKeys,
  [overrideKey],
  `shell-quote must be overridden only through ${overrideKey}`,
);

assert.equal(
  overrides[overrideKey],
  secureVersion,
  `${overrideKey} must be pinned to ${secureVersion}`,
);

const resolvedVersions = [
  ...lockfile.matchAll(/^  shell-quote@([^:\n]+):$/gm),
].map((match) => match[1]);

assert.deepEqual(
  [...new Set(resolvedVersions)],
  [secureVersion],
  `the lockfile must resolve only shell-quote@${secureVersion}`,
);

const devtoolsBlocks = lockfile
  .split(/\n(?=  \S)/)
  .filter((block) => block.startsWith('  react-devtools-core@'));

assert.ok(
  devtoolsBlocks.some((block) =>
    block.includes(`\n      shell-quote: ${secureVersion}`),
  ),
  `react-devtools-core must resolve shell-quote@${secureVersion}`,
);

console.log('shell-quote security policy: ok');
