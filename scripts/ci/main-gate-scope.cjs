const { execFileSync } = require('node:child_process');

function classify(paths) {
  return paths.some((path) => path.startsWith('apps/site/')) &&
    paths.every((path) => path.startsWith('apps/site/') || path.startsWith('docs/'))
    ? 'site'
    : 'api';
}

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) {
    throw new Error('Expected full base and head commit SHAs');
  }
  const paths = execFileSync('git', [
    'diff', '--name-only', '--no-renames', '-z', `${base}...${head}`,
  ], { encoding: 'utf8' }).split('\0').filter(Boolean);
  process.stdout.write(classify(paths));
}

module.exports = { classify };
