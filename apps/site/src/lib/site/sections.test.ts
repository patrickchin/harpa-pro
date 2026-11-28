import { describe, expect, it } from 'vitest';
import {
  SECTIONS,
  SHARED_OFFERS,
  breadcrumbJsonLd,
  breadcrumbTrail,
  sectionForPath,
  type NavLink,
} from './sections';

const allLinks = (): NavLink[] =>
  Object.values(SECTIONS).flatMap((section) => [
    ...(section.menu?.links ?? []),
    ...(section.menu?.mobileLinks ?? []),
    ...(section.cta ? [section.cta] : []),
    ...(section.crossLink ? [section.crossLink] : []),
    ...section.footer.columns.flatMap((column) => column.links),
  ]).concat(SHARED_OFFERS);

describe('sectionForPath', () => {
  it.each(['/', '/#contact', '/?utm_source=x', '/procurement', '/procurement/guides', '/procurement/x'])(
    'maps %s to procurement',
    (path) => expect(sectionForPath(path)).toBe('procurement'),
  );
  it.each(['/reports', '/reports/', '/reports/docs/guides/x', '/reports/confirm'])(
    'maps %s to reports',
    (path) => expect(sectionForPath(path)).toBe('reports'),
  );
  it.each(['/privacy', '/nope', '/reportsx', '/procurementx', '/404'])(
    'maps %s to shared',
    (path) => expect(sectionForPath(path)).toBe('shared'),
  );
});

describe('breadcrumbs', () => {
  it('prepends the section root once and never roots reports at the procurement home', () => {
    expect(breadcrumbTrail('reports', [{ name: 'Guides', path: '/reports/docs' }])).toEqual([
      { name: 'Site reporting', path: '/reports' },
      { name: 'Guides', path: '/reports/docs' },
    ]);
    expect(breadcrumbTrail('reports', [{ name: 'App', path: '/reports' }])).toEqual([
      { name: 'App', path: '/reports' },
    ]);
    expect(breadcrumbTrail('procurement', [{ name: 'Procurement guides', path: '/procurement/guides' }])[0])
      .toEqual({ name: 'Procurement', path: '/' });
    expect(breadcrumbTrail('shared', [{ name: 'Privacy', path: '/privacy' }])).toHaveLength(1);
    expect(SECTIONS.reports.breadcrumbRoot?.path).not.toBe('/');
  });

  it('builds JSON-LD from the same items, ending at the page URL', () => {
    const items = breadcrumbTrail('reports', [
      { name: 'Guides', path: '/reports/docs' },
      { name: 'Getting started', path: '/reports/docs/guides/getting-started' },
    ]);
    const pageUrl = 'https://harpapro.com/reports/docs/guides/getting-started';
    const jsonLd = breadcrumbJsonLd('https://harpapro.com', pageUrl, items);
    expect(jsonLd['@id']).toBe(`${pageUrl}#breadcrumbs`);
    expect(jsonLd.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(jsonLd.itemListElement.map((item) => item.name)).toEqual(items.map((item) => item.name));
    expect(jsonLd.itemListElement.at(-1)?.item).toBe(pageUrl);
  });
});

describe('section config', () => {
  it('uses root-relative internal links and HTTPS external links', () => {
    for (const link of allLinks()) {
      if (link.external) expect(link.href, link.label).toMatch(/^https:\/\//);
      else expect(link.href, link.label).toMatch(/^\/(?!\/)/);
    }
  });

  it('gives each audience one cross-link to the other audience home', () => {
    const { procurement, reports, shared } = SECTIONS;
    expect(procurement.crossLink).toMatchObject({ to: 'reports', href: reports.home });
    expect(reports.crossLink).toMatchObject({ to: 'procurement', href: procurement.home });
    expect(shared.crossLink).toBeUndefined();
    expect(shared.menu).toBeUndefined();
    expect(shared.cta).toBeUndefined();
    expect(SHARED_OFFERS.map((offer) => offer.href)).toEqual([procurement.home, reports.home]);
  });

  it('keeps the existing menu destinations, CTAs, and wordmark targets', () => {
    const { procurement, reports, shared } = SECTIONS;
    expect(procurement.menu?.links.map((link) => link.href)).toEqual([
      '/', '/#factory-partners', '/#considerations', '/procurement/how-to-buy-from-china', '/procurement/guides',
    ]);
    expect(reports.menu?.links.map((link) => link.label)).toEqual([
      'Harpa Pro app', 'Guides', 'Roadmap', 'Get the app',
    ]);
    expect(reports.menu?.mobileLinks).toHaveLength(3);
    expect(procurement.cta).toMatchObject({ label: 'Contact us', href: '/#contact' });
    expect(reports.cta).toMatchObject({ label: 'Get the app', href: '/reports/download' });
    expect([procurement.home, reports.home, shared.home]).toEqual(['/', '/reports', '/']);
  });

  it('keeps procurement contact out of the reports chrome', () => {
    const reportsHrefs = [
      ...(SECTIONS.reports.menu?.links ?? []),
      ...SECTIONS.reports.footer.columns.flatMap((column) => column.links),
    ].map((link) => link.href);
    expect(reportsHrefs).not.toContain('/#contact');
    const procurementHrefs = SECTIONS.procurement.footer.columns.flatMap((column) => column.links)
      .map((link) => link.href);
    expect(procurementHrefs).not.toContain('/reports/roadmap');
  });

  it('defaults every section to unique metadata with an image for non-procurement pages', () => {
    const metas = Object.values(SECTIONS).map((section) => section.meta);
    expect(new Set(metas.map((meta) => meta.title)).size).toBe(metas.length);
    expect(new Set(metas.map((meta) => meta.description)).size).toBe(metas.length);
    expect(SECTIONS.procurement.meta.image).toBeUndefined();
    expect(SECTIONS.reports.meta.image).toBe('/og-image.png');
    expect(SECTIONS.reports.meta.title).not.toMatch(/procurement/i);
    expect(SECTIONS.reports.meta.description).not.toMatch(/procurement/i);
  });
});
