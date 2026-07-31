import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('admin site smoke', () => {
  it('is a static application for the dedicated admin origin', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      name: string;
    };
    const config = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');

    expect(pkg.name).toBe('@harpa/admin');
    expect(config).toMatch(/site:\s*['"]https:\/\/admin\.harpapro\.com['"]/);
    expect(config).toMatch(/output:\s*['"]static['"]/);
  });

  it('renders activity at the root and keeps every document out of search', () => {
    const page = readFileSync(resolve(here, '../pages/index.astro'), 'utf8');
    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    const robots = readFileSync(resolve(here, '../pages/robots.txt.ts'), 'utf8');

    expect(page).toContain('AdminActivity');
    expect(layout).toContain('noindex, nofollow');
    expect(robots).toContain("'User-agent: *\\nDisallow: /\\n'");
  });

  it('redirects only the legacy activity bookmark', () => {
    const redirects = readFileSync(resolve(here, '../../public/_redirects'), 'utf8');

    expect(redirects.trim()).toBe('/admin/activity / 308');
    expect(existsSync(resolve(here, '../pages/admin/activity.astro'))).toBe(false);
  });
});
