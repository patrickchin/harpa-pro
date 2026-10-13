const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const config = JSON.parse(read('scripts/ci/cloudflare-pages-watch-paths.json'));
const projects = {
  site: 'harpa-pro',
  admin: 'harpa-pro-admin',
  dashboard: 'harpa-pro-dashboard',
};

// Cloudflare's single wildcard also matches nested path separators.
const matches = (pattern, path) =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  ).test(path);
const builds = (path) =>
  Object.entries(projects)
    .filter(([, project]) => config[project].include.some((pattern) => matches(pattern, path)))
    .map(([app]) => app);

test('application-only changes build only that web application', () => {
  for (const app of Object.keys(projects)) {
    assert.deepEqual(builds(`apps/${app}/src/pages/nested/index.tsx`), [app]);
  }
  assert.deepEqual(builds('apps/mobile/screens/reports.tsx'), []);
  assert.deepEqual(builds('docs/v4/arch-ops.md'), []);
  assert.deepEqual(builds('.github/workflows/mobile-ota-pr.yml'), []);
});

test('shared dependencies and backend preview inputs retain their consumers', () => {
  assert.deepEqual(builds('packages/api-contract/src/index.ts'), ['site', 'admin', 'dashboard']);
  assert.deepEqual(builds('pnpm-lock.yaml'), ['site', 'admin', 'dashboard']);
  assert.deepEqual(builds('packages/api/src/app.ts'), ['admin', 'dashboard']);
  assert.deepEqual(builds('packages/design-tokens/src/index.ts'), ['dashboard']);
});

test('provider includes cover every exact-SHA verification trigger', () => {
  for (const [app, project] of Object.entries(projects)) {
    const { include, exclude } = config[project];
    assert(!include.includes('*'), `${project} must not build every change`);
    assert.deepEqual(exclude, []);
    for (const environment of ['preview', 'dev', 'prod']) {
      const path = `.github/workflows/${app}-${environment}.yml`;
      const paths = read(path).split('    paths:\n')[1].split('\n\n')[0];
      const triggers = [...paths.matchAll(/^      - ['"]([^'"]+)['"]/gm)].map((match) => match[1]);
      assert(triggers.length > 0, `${path} has path filters`);
      for (const trigger of triggers) {
        const normalized = trigger.replaceAll('**', '*');
        assert(
          include.some(
            (pattern) =>
              pattern === normalized ||
              (pattern.endsWith('*') && normalized.startsWith(pattern.slice(0, -1))),
          ),
          `${project} must build for ${path}'s ${trigger}`,
        );
      }
    }
  }
});

test('mobile PR publication requires mobile inputs, not just a detector change', () => {
  const workflow = read('.github/workflows/mobile-ota-pr.yml');
  assert(workflow.includes('mobile: ${{ steps.paths.outputs.mobile }}'));
  const ota = workflow.split('\n  ota:\n')[1];
  const condition = ota.split('    if: >-\n')[1].split('\n    runs-on:')[0];
  assert(condition.includes("needs.changes.outputs.mobile == 'true'"));
  assert(condition.includes("github.event.action != 'closed'"));
  assert(condition.includes('github.event.pull_request.head.repo.full_name == github.repository'));
  assert(condition.includes("github.event.pull_request.user.login != 'dependabot[bot]'"));
});

test('watch-policy edits provision the backend required by browser previews', () => {
  const filters = read('.github/actions/changed-paths/action.yml');
  for (const app of ['admin', 'dashboard']) {
    const area = filters.split(`          ${app}:\n`)[1].split(/\n          [\w-]+:/)[0];
    assert(area.includes("- 'scripts/ci/cloudflare-pages-watch-paths.json'"));
    assert(area.includes("- 'scripts/ci/__tests__/selective-preview-policy.test.cjs'"));
  }
});
