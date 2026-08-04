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
    };
    const config = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');

    expect(pkg.name).toBe('@harpa/admin');
    expect(pkg.dependencies).not.toHaveProperty('astro');
    expect(pkg.devDependencies.astro).toBe('^5.1.1');
    expect(config).toMatch(/site:\s*['"]https:\/\/admin\.harpapro\.com['"]/);
    expect(config).toMatch(/output:\s*['"]static['"]/);
  });

  it('declares a compatible React, Vite, and Tailwind peer graph', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.dependencies).toMatchObject({
      react: '19.2.0',
      'react-dom': '19.2.0',
    });
    expect(pkg.devDependencies).toMatchObject({
      '@tailwindcss/vite': '^4.3.3',
      '@types/react': '^19.2.0',
      '@types/react-dom': '~19.2.3',
      tailwindcss: '^4.3.3',
      vite: '6.4.3',
    });
  });

  it('renders activity at the root and keeps every document out of search', () => {
    const page = readFileSync(resolve(here, '../pages/index.astro'), 'utf8');
    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    const robots = readFileSync(resolve(here, '../pages/robots.txt.ts'), 'utf8');

    expect(page).toContain('AdminActivity');
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
