const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { classify } = require('../main-gate-scope.cjs');

const script = resolve(__dirname, '../main-gate-scope.cjs');
test('only site changes with optional documentation select the website gate', () => {
  assert.equal(classify(['apps/site/src/styles/luxury.css']), 'site');
  assert.equal(classify(['apps/site/src/a\nb.astro', 'docs/v4/type.md']), 'site');
  for (const other of [
    'packages/api/src/app.ts', 'apps/admin/src/index.ts', 'packages/api-contract/src/index.ts',
    'package.json', 'pnpm-lock.yaml', '.github/workflows/main-gate.yml',
    'scripts/ci/main-gate-scope.cjs', 'unknown-path',
  ]) assert.equal(classify(['apps/site/src/styles/luxury.css', other]), 'api', other);
  assert.equal(classify(['docs/v4/type.md']), 'api');
  assert.equal(classify([]), 'api');
});

test('the real PR diff includes renamed backend files and all commits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'main-gate-scope-'));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' },
  }).trim();
  const scope = (base, head) => execFileSync(process.execPath, [script, base, head], { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q');
    mkdirSync(join(dir, 'packages/api'), { recursive: true });
    mkdirSync(join(dir, 'apps/site'), { recursive: true });
    writeFileSync(join(dir, 'packages/api/data.txt'), 'original backend file\n');
    git('add', '.'); git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'apps/site/page.astro'), '<h1>Site</h1>');
    git('add', '.'); git('commit', '-qm', 'site');
    assert.equal(scope(base, git('rev-parse', 'HEAD')), 'site');
    renameSync(join(dir, 'packages/api/data.txt'), join(dir, 'apps/site/data.txt'));
    git('add', '.'); git('commit', '-qm', 'move backend file');
    writeFileSync(join(dir, 'apps/site/page.astro'), '<h1>Changed again</h1>');
    git('add', '.'); git('commit', '-qm', 'later site-only commit');
    assert.equal(scope(base, git('rev-parse', 'HEAD')), 'api');
    assert.notEqual(spawnSync(process.execPath, [script, base, 'f'.repeat(40)], { cwd: dir }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dev promotions retain API journeys and the site gate verifies provenance and identity', () => {
  const workflow = readFileSync(resolve(__dirname, '../../../.github/workflows/main-gate.yml'), 'utf8');
  assert.match(workflow, /if \[\[ "\$HEAD_REF" == "dev" \]\]; then\n\s+echo "kind=api"/);
  assert.match(workflow, /PREVIEW_WORKFLOW_FILE: site-preview\.yml\n\s+PREVIEW_JOB_NAME: deployment/);
  assert.match(workflow, /bash scripts\/ci\/verify-pages-deployment\.sh/);
  assert.match(workflow, /--commit "\$PR_HEAD_SHA"/);
  assert.match(workflow, /--branch "\$PR_BRANCH"/);
});
