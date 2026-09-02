import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('admin site smoke', () => {
  it('is a static application for the dedicated admin origin', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };
    const config = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');

    expect(pkg.name).toBe('@harpa/admin');
    expect(pkg.dependencies).not.toHaveProperty('astro');
    expect(pkg.devDependencies.astro).toBe('^7.2.9');
    expect(pkg.engines.node).toBe('>=22.12.0');
    expect(config).toMatch(/site:\s*['"]https:\/\/admin\.harpapro\.com['"]/);
    expect(config).toMatch(/output:\s*['"]static['"]/);
    expect(config).toMatch(/compressHTML:\s*true/);
  });

  it('declares a secure Astro 7 compatible integration and peer graph', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.dependencies).toMatchObject({
      react: '19.2.0',
      'react-dom': '19.2.0',
    });
    expect(pkg.devDependencies).toMatchObject({
      '@astrojs/check': '^0.9.10',
      '@astrojs/react': '^6.0.4',
      '@tailwindcss/vite': '^4.3.3',
      '@types/react': '^19.2.18',
      '@types/react-dom': '~19.2.4',
      cookie: '2.0.1',
      tailwindcss: '^4.3.3',
      vite: '8.2.2',
    });
  });

  it('renders activity and operations routes and keeps every document out of search', () => {
    const page = readFileSync(resolve(here, '../pages/index.astro'), 'utf8');
    const operationsPage = readFileSync(resolve(here, '../pages/operations.astro'), 'utf8');
    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    const robots = readFileSync(resolve(here, '../pages/robots.txt.ts'), 'utf8');

    expect(page).toContain('AdminActivity');
    expect(operationsPage).toContain('AdminOperations');
    expect(layout).toContain('noindex, nofollow');
    expect(robots).toContain("'User-agent: *\\nDisallow: /\\n'");
  });

  it('does not publish a legacy browser route', () => {
    expect(existsSync(resolve(here, '../../public/_redirects'))).toBe(false);
    expect(existsSync(resolve(here, '../pages/admin/activity.astro'))).toBe(false);
  });

  it('publishes a real 404 document instead of falling back to the console', () => {
    const notFound = readFileSync(resolve(here, '../pages/404.astro'), 'utf8');

    expect(notFound).toContain('Page not found');
    expect(notFound).not.toContain('AdminActivity');
  });
});
