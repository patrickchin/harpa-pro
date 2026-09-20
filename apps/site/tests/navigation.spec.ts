import { expect, test } from '@playwright/test';

const REQUIRED_ROUTES = [
  '/',
  '/app',
  '/docs',
  '/roadmap',
  '/privacy',
  '/account-deletion',
] as const;

test('separates procurement from site reporting', async ({ page }) => {
  await page.goto('/app');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Site Reports from Voice, Photos, and Text',
    }),
  ).toBeVisible();
  await expect(page.locator('[data-voice-demo]')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'From Site Update to Daily Report' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Reporting Tools' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'The Team Behind Harpa Pro' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Questions' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View guides', exact: true }).first(),
  ).toHaveAttribute('href', '/docs');
  await expect(
    page.getByRole('link', { name: 'View roadmap', exact: true }).first(),
  ).toHaveAttribute('href', '/roadmap');
  await expect(page.locator('form')).toHaveCount(0);
  await expect(
    page.getByText(/waitlist|schedule a meeting|join the product updates list/i),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);

  await page.goto('/roadmap');
  await expect(page.getByText('Site Reporting Roadmap', { exact: true })).toBeVisible();
});

test('all sitemap pages, internal links, assets, and fragments resolve', async ({
  page,
  request,
}) => {
  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemap = await sitemapResponse.text();
  const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, location]) => new URL(location!).pathname,
  );

  for (const route of REQUIRED_ROUTES) {
    expect(sitemapRoutes, `sitemap route ${route}`).toContain(route);
  }

  const checkedTargets = new Set<string>();
  const fragmentTargets = new Map<string, Set<string>>();

  for (const route of sitemapRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);

    const links = await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));

    for (const href of links) {
      const target = new URL(href);
      if (target.origin !== new URL(page.url()).origin) continue;

      const requestTarget = `${target.pathname}${target.search}`;
      if (!checkedTargets.has(requestTarget)) {
        const targetResponse = await request.get(requestTarget);
        expect(targetResponse.status(), href).toBeLessThan(400);
        checkedTargets.add(requestTarget);
      }

      if (target.hash) {
        const fragments = fragmentTargets.get(requestTarget) ?? new Set<string>();
        fragments.add(decodeURIComponent(target.hash.slice(1)));
        fragmentTargets.set(requestTarget, fragments);
      }
    }
  }

  for (const [route, fragments] of fragmentTargets) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    for (const fragment of fragments) {
      expect(
        await page.evaluate((id) => Boolean(document.getElementById(id)), fragment),
        `${route}#${fragment}`,
      ).toBe(true);
    }
  }
});
