#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const apiPackage = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages/api/package.json'), 'utf8'),
);
const lockfile = fs.readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
const overrides = rootPackage.pnpm?.overrides ?? {};

function resolvedVersions(packageName) {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...new Set(
      [...lockfile.matchAll(new RegExp(`^  ${escapedName}@([^:\\n]+):$`, 'gm'))].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(version);
  assert.ok(match, `expected a numeric semantic version, received ${version}`);
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  if (left.includes('-') && !right.includes('-')) return -1;
  if (!left.includes('-') && right.includes('-')) return 1;
  return 0;
}

function parseDeclaredFloor(actual, message) {
  assert.equal(typeof actual, 'string', message);
  const match = /^(?:\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(actual);
  assert.ok(match, `${message}: use one exact, ^, ~, or >= stable-version selector`);
  return match[1];
}

function assertDeclaredFloor(actual, expectedMajor, minimum, message) {
  const declared = parseDeclaredFloor(actual, message);
  assert.equal(parseVersion(declared)[0], expectedMajor, `${message}: major version drifted`);
  assert.ok(compareVersions(declared, minimum) >= 0, message);
}

function assertNoAffectedVersions(packageName, versions, isAffected) {
  assert.ok(versions.length > 0, `${packageName} must remain represented in the lockfile`);
  const affected = versions.filter(isAffected);
  assert.deepEqual(
    affected,
    [],
    `${packageName} must not retain an advisory-affected lockfile release`,
  );
}

for (const unsafeSelector of [
  '<=5.1.16',
  '5.1.16 || 5.1.11',
  '^5.1.16-beta.1',
  '*',
]) {
  assert.throws(
    () => parseDeclaredFloor(unsafeSelector, 'test selector'),
    undefined,
    `${unsafeSelector} must not be treated as a secure floor`,
  );
}

assertDeclaredFloor(
  apiPackage.dependencies?.nanoid,
  5,
  '5.1.16',
  'the API must keep nanoid on the patched 5.x floor',
);
assertDeclaredFloor(
  overrides['nanoid@>=3.0.0 <3.3.18'],
  3,
  '3.3.18',
  'transitive nanoid 3.x consumers must resolve the patched floor',
);
assertDeclaredFloor(
  overrides['js-yaml@>=3.0.0 <3.15.1'],
  3,
  '3.15.1',
  'transitive js-yaml 3.x consumers must resolve the patched floor',
);

function isAffectedNanoid(version) {
  return (
    compareVersions(version, '3.3.18') < 0 ||
    (compareVersions(version, '4.0.0') >= 0 && compareVersions(version, '5.1.16') < 0)
  );
}

// Pin both sides of the advisory range, plus future-safe patch behavior, so
// this guard cannot silently narrow back to only the versions present today.
for (const affected of [
  '2.1.11',
  '3.3.17',
  '3.3.18-rc.1',
  '4.0.2',
  '5.1.15',
  '5.1.16-beta.1',
]) {
  assert.equal(isAffectedNanoid(affected), true, `${affected} must remain rejected`);
}
for (const patched of ['3.3.18', '3.3.19', '5.1.16', '5.1.17', '6.0.0']) {
  assert.equal(isAffectedNanoid(patched), false, `${patched} must remain accepted`);
}

const nanoidVersions = resolvedVersions('nanoid');
assertNoAffectedVersions('nanoid', nanoidVersions, isAffectedNanoid);
assert.ok(
  nanoidVersions.some((version) => parseVersion(version)[0] === 3),
  'the transitive nanoid 3.x edge must stay covered by the advisory policy',
);
assert.ok(
  nanoidVersions.some(
    (version) =>
      parseVersion(version)[0] === 5 && compareVersions(version, '5.1.16') >= 0,
  ),
  'the API nanoid edge must resolve at or above its patched floor',
);

assertNoAffectedVersions('js-yaml', resolvedVersions('js-yaml'), (version) => {
  const [major] = parseVersion(version);
  if (major === 3) return compareVersions(version, '3.15.1') < 0;
  return false;
});

console.log('dependency advisory policy: ok');
