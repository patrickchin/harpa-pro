#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const coverageScript = fs.readFileSync(
  path.join(repoRoot, 'packages/api/scripts/test-coverage.sh'),
  'utf8',
);

function extractVitestCommands(source) {
  const lines = source.split('\n');
  const commands = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== 'vitest run \\') continue;

    const command = [lines[index]];
    while (command.at(-1).trimEnd().endsWith('\\')) {
      index += 1;
      assert.ok(index < lines.length, 'vitest command must terminate');
      command.push(lines[index]);
    }
    commands.push(command.map((line) => line.trim()).join('\n'));
  }

  return commands;
}

function requireSingleLine(command, line, description) {
  assert.equal(
    command.split('\n').filter((candidate) => candidate === line).length,
    1,
    description,
  );
}

function validateCommands(commands) {
  assert.equal(commands.length, 3, 'coverage script must contain three Vitest commands');

  const shardCommands = [
    {
      command: commands[0],
      config: '--config vitest.config.ts \\',
      output: '--outputFile.blob="$REPORT_DIR/unit.json"',
    },
    {
      command: commands[1],
      config: '--config vitest.integration.config.ts \\',
      output: '--outputFile.blob="$REPORT_DIR/integration-$shard.json"',
    },
  ];

  for (const { command, config, output } of shardCommands) {
    requireSingleLine(command, '--coverage \\', `${config} must enable coverage`);
    requireSingleLine(
      command,
      '--silent=passed-only \\',
      `${config} must suppress logs only for passing tests`,
    );
    requireSingleLine(command, config, `${config} must remain a distinct command`);
    requireSingleLine(
      command,
      '--reporter=default \\',
      `${config} must emit human-readable failures`,
    );
    requireSingleLine(
      command,
      '--reporter=blob \\',
      `${config} must retain a mergeable blob report`,
    );
    requireSingleLine(command, output, `${config} must route output to the blob reporter`);
    assert.ok(!command.includes('--outputFile='), `${config} must not use ambiguous outputFile`);
  }

  requireSingleLine(
    commands[1],
    '--shard="$shard/2" \\',
    'integration coverage must remain split into two shards',
  );

  requireSingleLine(
    commands[2],
    '--coverage \\',
    'the final command must enable coverage before merging reports',
  );
  requireSingleLine(
    commands[2],
    '--config vitest.coverage.config.ts \\',
    'the final command must use the merged coverage config',
  );
  requireSingleLine(
    commands[2],
    '--silent=passed-only \\',
    'the merged report must suppress logs from passing tests',
  );
  requireSingleLine(
    commands[2],
    '--merge-reports="$REPORT_DIR"',
    'the final command must merge every shard report',
  );
}

const commands = extractVitestCommands(coverageScript);
validateCommands(commands);

const missingIntegrationDefault = [...commands];
missingIntegrationDefault[1] = missingIntegrationDefault[1].replace('--reporter=default \\\n', '');
missingIntegrationDefault[0] += '\n--reporter=default \\';
assert.throws(
  () => validateCommands(missingIntegrationDefault),
  /must emit human-readable failures/,
  'moving both default reporters into one command must fail',
);

const ambiguousIntegrationOutput = [...commands];
ambiguousIntegrationOutput[1] = ambiguousIntegrationOutput[1].replace(
  '--outputFile.blob=',
  '--outputFile=',
);
assert.throws(
  () => validateCommands(ambiguousIntegrationOutput),
  /must route output to the blob reporter/,
  'an ambiguous multi-reporter output file must fail',
);

const disabledMergedCoverage = [...commands];
disabledMergedCoverage[2] = disabledMergedCoverage[2].replace('--coverage \\\n', '');
assert.throws(
  () => validateCommands(disabledMergedCoverage),
  /must enable coverage before merging reports/,
  'the final merge must not silently skip coverage and its threshold',
);

const commentOnlyDefault = coverageScript
  .replace(/\n\s+--reporter=default \\\n(?=\s+--reporter=blob \\\n)/, '\n')
  .concat('\n# --reporter=default \\\n');
assert.throws(
  () => validateCommands(extractVitestCommands(commentOnlyDefault)),
  /must emit human-readable failures/,
  'a reporter token in a comment must not satisfy the command contract',
);

console.log('API coverage reporting policy: ok');
