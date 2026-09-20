import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FIRST_REVISION_DOC_REDIRECTS, LEGACY_DOC_REDIRECTS } from '../lib/docs';

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

  it("imports Zod from Astro's canonical module", () => {
    const contentConfig = readFileSync(resolve(here, '../content.config.ts'), 'utf8');

    expect(contentConfig).toContain('import { defineCollection } from "astro:content";');
    expect(contentConfig).toContain('import { z } from "astro/zod";');
    expect(contentConfig).not.toContain('import { defineCollection, z } from "astro:content";');
  });

  it('astro config targets static output for harpapro.com', () => {
    const cfg = readFileSync(resolve(here, '../../astro.config.mjs'), 'utf8');
    expect(cfg).toMatch(/site:\s*['"]https:\/\/harpapro\.com['"]/);
    expect(cfg).toMatch(/output:\s*['"]static['"]/);
    expect(cfg).toMatch(/compressHTML:\s*true/);
  });

  it('publishes discovery, not-found, and legacy redirect routes', () => {
    expect(existsSync(resolve(here, '../pages/procurement.astro'))).toBe(false);
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
    expect(redirects).toContain(
      '/downloads/harpa-pro-interior-procurement.pdf /#evidence 301',
    );
    expect(redirects).toContain('/documents/factories/* /#evidence 301');
    expect(redirects).toContain('/procurement / 301');

    const layout = readFileSync(resolve(here, '../layouts/Layout.astro'), 'utf8');
    expect(layout).toContain('noindex');
  });

  it('publishes the procurement-first site in navigation and discovery', () => {
    const home = readFileSync(resolve(here, '../pages/index.astro'), 'utf8');
    const app = readFileSync(resolve(here, '../pages/app.astro'), 'utf8');
    const considerations = readFileSync(
      resolve(here, '../components/agents/ProcurementConsiderations.astro'),
      'utf8',
    );
    const evidence = readFileSync(
      resolve(here, '../components/agents/ProcurementEvidence.astro'),
      'utf8',
    );
    const header = readFileSync(resolve(here, '../components/landing/Header.astro'), 'utf8');
    const footer = readFileSync(resolve(here, '../components/landing/Footer.astro'), 'utf8');
    const sitemap = readFileSync(resolve(here, '../pages/sitemap.xml.ts'), 'utf8');

    expect(home).toContain('Luxury Interior procurement in China');
    expect(home).toMatch(
      /We manage design specifications, factory coordination, quality\s+checks, shipment, and complete procurement documentation\s+\(approved health, safety, and quality standards\)\./,
    );
    expect(home).toContain('ProcurementConsiderations');
    expect(home).toContain('ProcurementEvidence');
    expect(home).toContain('id="contact"');
    expect(home).not.toContain('AppOverview');
    expect(home).not.toContain('SiteReportingHero');
    expect(app).toContain('SiteReportingHero');
    expect(app).toContain('HowItWorks');
    expect(app).toContain('Features');
    expect(app).toContain('About');
    expect(app).toContain('FAQ');
    expect(app).not.toContain('WaitlistForm');
    expect(app).not.toContain('Current guidance and planned work.');
    expect(home).not.toContain('Harpa Pro procurement');
    expect(considerations).toContain('Design and specification');
    expect(considerations).toContain('Packing and delivery');
    expect(considerations).not.toContain('Stage ');
    expect(home).toContain('Contact us');
    expect(home).toContain('haruna@harpapro.com');
    expect(home).toContain('https://wa.me/861937283726');
    expect(home).toContain('data-single-agent-profile');
    expect(home).toMatch(
      /records and approve\s+quality standards and inspections, manage shipping logistics, and\s+keep the order files complete\./,
    );
    expect(evidence).toContain('Technical reviews');
    expect(evidence).toContain('AIS Smarti');
    expect(evidence).toContain('J2S');
    expect(evidence).toContain('Kenuo');
    expect(evidence).toContain('Masyounger');
    expect(evidence).toContain('Rong Shuo');
    expect(evidence).toContain('Product examples');
    expect(evidence).toContain('Factory documents');
    expect(evidence).not.toContain('Project evidence');
    expect(evidence).not.toContain('Factory source library');
    expect(evidence).not.toContain('Open original PDF');
    expect(evidence).toContain('Show 7 more documents');
    expect(evidence).toContain('Selected factory partners');
    expect(evidence).toContain(
      'We match each order with the factory that meets the design specifications',
    );
    expect(evidence).not.toContain('Ningbo Langyao Lighting');
    expect(evidence).not.toContain('Haining Mingyuan');
    expect(evidence).not.toContain('Foshan Zhenglian / JLA');
    expect(evidence).not.toContain('Download procurement PDF');
    expect(home).not.toContain('Choose an agent');
    expect(home).not.toContain('Meet Haruna.');
    expect(home).not.toContain('This is your agent.');
    expect(home).not.toContain('Hashy');
    expect(home).not.toContain('Send a sourcing brief');
    expect(home).toContain('mailto:haruna@harpapro.com');
    expect(header).toContain('href="/"');
    expect(header).toContain('href="/app"');
    expect(header).toContain('Site reporting');
    expect(header).toContain('href="/#contact"');
    expect(header).not.toContain('View evidence');
    expect(footer).toContain('href="/"');
    expect(footer).toContain('href="/app"');
    expect(footer).toContain('Site reporting');
    expect(sitemap).not.toContain('"/procurement"');
    expect(sitemap).not.toContain('"/agents"');
    expect(sitemap).toContain('"/app"');

    expect(
      existsSync(resolve(here, '../../public/downloads/harpa-pro-interior-procurement.pdf')),
    ).toBe(false);
    expect(
      existsSync(
        resolve(here, '../../public/documents/factories/ais/ais-hdf-formaldehyde-e0-2026.pdf'),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(here, '../../public/documents/factories/j2s/j2s-sofa-e1-certificate-2020.pdf'),
      ),
    ).toBe(false);
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
    expect(verifyScript).toContain("--write-out '%{http_code} %{redirect_url}\\n'");
  });
});
