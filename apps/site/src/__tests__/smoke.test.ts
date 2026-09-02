import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FIRST_REVISION_DOC_REDIRECTS,
  LEGACY_DOC_REDIRECTS,
} from '../lib/docs';

const here = dirname(fileURLToPath(import.meta.url));

describe('site smoke', () => {
  it('package name is @harpa/site', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('@harpa/site');
  });

  it('declares a secure Astro 7 compatible integration and peer graph', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };

    expect(pkg.dependencies).toMatchObject({
      '@astrojs/mdx': '^7.0.8',
      '@astrojs/react': '^6.0.4',
      '@tailwindcss/vite': '^4.3.3',
      astro: '^7.2.9',
      react: '19.2.0',
      'react-dom': '19.2.0',
      tailwindcss: '^4.3.3',
    });
    expect(pkg.devDependencies).toMatchObject({
      '@astrojs/check': '^0.9.10',
      '@types/react': '^19.2.18',
      '@types/react-dom': '~19.2.4',
      cookie: '2.0.1',
      vite: '8.2.2',
    });
    expect(pkg.engines.node).toBe('>=22.12.0');
  });

  it('imports Zod from Astro\'s canonical module', () => {
    const contentConfig = readFileSync(
      resolve(here, '../content.config.ts'),
      'utf8',
    );

    expect(contentConfig).toContain(
      'import { defineCollection } from "astro:content";',
    );
    expect(contentConfig).toContain('import { z } from "astro/zod";');
    expect(contentConfig).not.toContain(
      'import { defineCollection, z } from "astro:content";',
    );
  });

  it('astro config targets static output for harpapro.com', () => {
    const cfg = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');
    expect(cfg).toMatch(/site:\s*['"]https:\/\/harpapro\.com['"]/);
    expect(cfg).toMatch(/output:\s*['"]static['"]/);
    expect(cfg).toMatch(/compressHTML:\s*true/);
  });

  it('publishes discovery, not-found, and legacy redirect routes', () => {
    expect(existsSync(resolve(here, '../pages/404.astro'))).toBe(true);
    expect(existsSync(resolve(here, '../pages/robots.txt.ts'))).toBe(true);
    expect(existsSync(resolve(here, '../pages/sitemap.xml.ts'))).toBe(true);

    const redirects = readFileSync(resolve(here, '../../public/_redirects'), 'utf8');
    for (const [from, to] of Object.entries(LEGACY_DOC_REDIRECTS)) {
      expect(redirects).toContain(`${from} ${to} 301`);
    }
    for (const [from, to] of Object.entries(FIRST_REVISION_DOC_REDIRECTS)) {
      expect(redirects).toContain(`${from} ${to} 301`);
    }

    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    expect(layout).toContain('noindex');
  });

  it('does not ship the separate admin application', () => {
    expect(existsSync(resolve(here, '../pages/admin/activity.astro'))).toBe(false);
    expect(existsSync(resolve(here, '../components/admin/AdminActivity.tsx'))).toBe(false);
    expect(existsSync(resolve(here, '../lib/admin-auth.ts'))).toBe(false);
  });

  it('terminates the deployed redirect probe output for bash read', () => {
    const workflow = readFileSync(
      resolve(here, '../../../../.github/workflows/site-preview.yml'),
      'utf8',
    );
    const verifyScript = readFileSync(
      resolve(here, '../../../../scripts/ci/verify-pages-deployment.sh'),
      'utf8',
    );

    expect(workflow).toContain('bash scripts/ci/verify-pages-deployment.sh');
    expect(verifyScript).toContain(
      "--write-out '%{http_code} %{redirect_url}\\n'",
    );
  });
});
