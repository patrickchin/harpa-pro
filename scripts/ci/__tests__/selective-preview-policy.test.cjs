const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');

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

test('the IFC viewer watches its copied assets without building other apps', () => {
  const viewer = config['harpa-pro-viewer'];
  const viewerBuilds = (path) => viewer.include.some((pattern) => matches(pattern, path));
  for (const path of [
    'packages/ifc-viewer/src/converter.js',
    'apps/site/src/styles/globals.css',
    'apps/site/public/brand-icon.svg',
    'apps/site/package.json',
    'pnpm-lock.yaml',
  ])
    assert(viewerBuilds(path), path);
  assert.deepEqual(builds('packages/ifc-viewer/src/converter.js'), []);
  assert(!viewerBuilds('packages/api/src/app.ts'));
  assert(!viewerBuilds('apps/site/src/pages/index.astro'));
  for (const environment of ['preview', 'dev']) {
    const workflow = read(`.github/workflows/viewer-${environment}.yml`);
    assert(workflow.includes("needs.changes.outputs.deploy == 'true'"));
    for (const input of viewer.include) {
      const trigger = input.endsWith('/*') ? input.replaceAll('*', '**') : input;
      assert(workflow.includes(`- '${trigger}'`) || input.startsWith('scripts/ci/'), input);
    }
  }
});

test('shared dependencies and backend preview inputs retain their consumers', () => {
  assert.deepEqual(builds('packages/api-contract/src/index.ts'), ['site', 'admin', 'dashboard']);
  assert.deepEqual(builds('pnpm-lock.yaml'), ['site', 'admin', 'dashboard']);
  assert.deepEqual(builds('packages/api/src/app.ts'), ['admin', 'dashboard']);
  assert.deepEqual(builds('packages/design-tokens/src/index.ts'), ['dashboard']);
  assert.deepEqual(builds('packages/ai-fixtures/src/index.ts'), ['admin', 'dashboard']);
  assert.deepEqual(builds('scripts/ci/build-cloudflare-pages.sh'), ['site', 'admin', 'dashboard']);
});

test('CI-only edits do not request Pages deployments', () => {
  for (const path of [
    'scripts/ci/__tests__/future-test.test.cjs',
    'scripts/ci/verify-pages-deployment.sh',
    'scripts/ci/cloudflare-pages-watch-paths.json',
    '.github/workflows/dashboard-preview.yml',
    '.github/actions/setup-monorepo/action.yml',
    '.github/actions/pages-changes/action.yml',
    'lighthouserc.json',
  ]) {
    assert.deepEqual(builds(path), [], path);
  }
});

test('GitHub deployment filters derive from the provider policy', () => {
  const action = read('.github/actions/pages-changes/action.yml');
  const script = action
    .match(/node <<'NODE'[^\n]*\n([\s\S]*?)\n        NODE/)[1]
    .replace(/^        /gm, '');
  const output = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
  const filters = JSON.parse(output.trim().slice('filters='.length));
  for (const [project, policy] of Object.entries(config)) {
    assert.deepEqual(policy.exclude, []);
    assert(!policy.include.includes('*'));
    assert.deepEqual(
      filters[project],
      policy.include.map((pattern) => pattern.replaceAll('*', '**')),
    );
  }
  assert(
    action.includes("token: ''"),
    'PR detection uses the push range instead of the PR files API',
  );
  assert(
    action.includes(
      'base: ${{ github.event.before || github.event.pull_request.base.sha || github.ref }}',
    ),
    'CI-only follow-up commits do not redeploy earlier PR app changes',
  );
  assert(action.includes('ref: ${{ github.sha }}'), 'pushes use the immutable event commit');
});

const job = (workflow, name) => workflow.split(`\n  ${name}:\n`)[1].split(/\n  [\w-]+:\n/)[0];

test('automatic Pages verifiers require build inputs; preview CI stays available', () => {
  for (const [app, project] of Object.entries(projects)) {
    for (const environment of ['preview', 'dev', 'prod']) {
      const path = `.github/workflows/${app}-${environment}.yml`;
      const workflow = read(path);
      const changes = job(workflow, 'changes');
      assert(changes.includes('uses: ./.github/actions/pages-changes'), path);
      assert(
        changes.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'),
        path,
      );
      assert(changes.includes('deploy: ${{ steps.paths.outputs.' + app + ' }}'), path);
      const gate = job(
        workflow,
        environment === 'preview'
          ? 'deployment'
          : app === 'dashboard' && environment === 'prod'
            ? 'api'
            : 'verify',
      );
      assert(gate.includes("needs.changes.outputs.deploy == 'true'"), path);
      assert(gate.includes('needs:'), path);
      if (environment === 'preview') {
        const verify = job(workflow, 'verify');
        assert(!verify.includes('needs.changes.outputs.deploy'), `${path} retains CI-only checks`);
        assert(gate.includes('needs: [verify, changes]'), path);
      } else {
        assert(gate.includes("github.event_name == 'workflow_dispatch'"), path);
      }
      const paths = workflow.split('    paths:\n')[1].split('\n\n')[0];
      assert(paths.includes("- 'scripts/ci/**'"), `${path} covers future CI scripts`);
      assert(paths.includes("- '.github/**'"), `${path} covers workflow edits`);
      for (const input of config[project].include) {
        const trigger = input.endsWith('/*') ? input.replaceAll('*', '**') : input;
        assert(
          paths.includes(`- '${trigger}'`) || input.startsWith('scripts/ci/'),
          `${path} covers build input ${input}`,
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

test('browser preview build inputs also provision their matching API', () => {
  const changes = job(read('.github/workflows/pr-preview.yml'), 'changes');
  assert(changes.includes('uses: ./.github/actions/pages-changes'));
  for (const app of ['admin', 'dashboard']) {
    assert(changes.includes(`steps.pages.outputs.${app} == 'true'`));
  }
});
