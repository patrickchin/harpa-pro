import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { LEGACY_DOC_REDIRECTS } from '../lib/docs';

const here = dirname(fileURLToPath(import.meta.url));

describe('site smoke', () => {
  it('package name is @harpa/site', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('@harpa/site');
  });

  it('astro config targets static output for harpapro.com', () => {
    const cfg = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');
    expect(cfg).toMatch(/site:\s*['"]https:\/\/harpapro\.com['"]/);
    expect(cfg).toMatch(/output:\s*['"]static['"]/);
  });

  it('publishes discovery, not-found, and legacy redirect routes', () => {
    expect(existsSync(resolve(here, '../pages/404.astro'))).toBe(true);
    expect(existsSync(resolve(here, '../pages/robots.txt.ts'))).toBe(true);
    expect(existsSync(resolve(here, '../pages/sitemap.xml.ts'))).toBe(true);

    const redirects = readFileSync(resolve(here, '../../public/_redirects'), 'utf8');
    for (const [from, to] of Object.entries(LEGACY_DOC_REDIRECTS)) {
      expect(redirects).toContain(`${from} ${to} 301`);
    }

    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    expect(layout).toContain('noindex');
  });
});
