#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error('Usage: node scripts/run-bash-checks.cjs <script.sh> [...]');
  process.exit(64);
}

function existing(paths) {
  return paths.filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

function whereBash() {
  const result = spawnSync('where.exe', ['bash'], {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /\\Git\\(?:usr\\)?bin\\bash\.exe$/i.test(line));
}

function findBash() {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.ProgramFiles || '', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'usr', 'bin', 'bash.exe'),
    whereBash(),
  ];

  const bash = existing(candidates);
  if (!bash) {
    console.error('Git Bash is required on Windows to run repository shell checks.');
    console.error('Install Git for Windows or add Git Bash to PATH.');
    process.exit(1);
  }

  return bash;
}

const bash = findBash();

for (const script of scripts) {
  const scriptPath = path.resolve(repoRoot, script);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Shell check not found: ${script}`);
    process.exit(1);
  }

  const result = spawnSync(bash, [script], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
