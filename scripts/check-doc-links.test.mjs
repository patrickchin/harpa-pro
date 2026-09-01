import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('nested HTML tags cannot change a documentation heading anchor', () => {
  const fixtureDir = mkdtempSync(join(root, '.tmp-check-doc-links-'));

  try {
    writeFileSync(
      join(fixtureDir, 'nested-tag.md'),
      '# <scr<script>ipt>Safe heading\n\n[Self](#safe-heading)\n',
    );

    const result = spawnSync(process.execPath, ['scripts/check-doc-links.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
