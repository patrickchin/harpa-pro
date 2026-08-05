import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md', '*.mdx'],
  { cwd: root, encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter((file) => file && existsSync(resolve(root, file)));

function withoutFencedCode(source) {
  return source.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, (block) => block.replace(/[^\n]/g, ''));
}

function withoutCode(source) {
  return withoutFencedCode(source).replace(/`[^`\n]*`/g, '');
}

function headingSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[\p{P}\p{S}]/gu, (character) =>
      character === '-' || character === '_' ? character : '',
    )
    .replace(/\s/g, '-');
}

function anchorsFor(path) {
  const source = withoutFencedCode(readFileSync(path, 'utf8')).replace(/`([^`\n]*)`/g, '$1');
  const anchors = new Set();
  const counts = new Map();

  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = headingSlug(match[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }

  return anchors;
}

const anchorCache = new Map();
const failures = [];

function normalizeRoute(route) {
  if (route === '/') return route;
  return route.replace(/\/$/, '');
}

function publicSiteRoutes() {
  const routes = new Set();
  const pageFiles = execFileSync('git', ['ls-files', 'apps/site/src/pages'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);

  for (const page of pageFiles) {
    const relative = page
      .replace(/^apps\/site\/src\/pages\//, '')
      .replace(/\.(?:astro|mdx?|[jt]sx?)$/, '');
    if (relative.includes('[')) continue;
    const route = relative === 'index' ? '/' : `/${relative.replace(/\/index$/, '')}`;
    routes.add(normalizeRoute(route));
  }

  for (const file of files) {
    if (!file.startsWith('apps/site/src/content/docs/') || !/\.mdx?$/.test(file)) continue;
    const slug = file
      .replace(/^apps\/site\/src\/content\/docs\//, '')
      .replace(/\.mdx?$/, '')
      .replace(/^\d+-/, '');
    routes.add(`/docs/guides/${slug}`);
  }

  return routes;
}

const siteRoutes = publicSiteRoutes();

for (const file of files) {
  const absoluteFile = resolve(root, file);
  const source = withoutCode(readFileSync(absoluteFile, 'utf8'));

  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    let destination = match[1].trim().replace(/^<|>$/g, '');
    destination = destination.replace(/\s+["'][^"']*["']$/, '');

    if (!destination || /^[a-z][a-z\d+.-]*:/i.test(destination)) {
      continue;
    }

    if (destination.startsWith('/')) {
      if (file.startsWith('apps/site/src/content/docs/') && !destination.startsWith('//')) {
        const route = normalizeRoute(destination.split(/[?#]/, 1)[0]);
        if (!siteRoutes.has(route)) {
          failures.push(`${file}:${line}: missing public site route ${destination}`);
        }
      }
      continue;
    }

    const [rawPath, rawFragment] = destination.split('#', 2);
    const relativePath = decodeURIComponent(rawPath || '');
    let target = relativePath ? resolve(dirname(absoluteFile), relativePath) : absoluteFile;

    if (existsSync(target) && statSync(target).isDirectory()) {
      const readme = resolve(target, 'README.md');
      if (existsSync(readme)) target = readme;
    }

    if (!existsSync(target)) {
      failures.push(`${file}:${line}: missing target ${destination}`);
      continue;
    }

    if (!rawFragment || !['.md', '.mdx'].includes(extname(target))) continue;

    let anchors = anchorCache.get(target);
    if (!anchors) {
      anchors = anchorsFor(target);
      anchorCache.set(target, anchors);
    }

    const fragment = decodeURIComponent(rawFragment).toLowerCase();
    if (!anchors.has(fragment)) {
      failures.push(`${file}:${line}: missing anchor #${rawFragment} in ${relativePath || file}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation link check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Documentation link check passed (${files.length} files).`);
