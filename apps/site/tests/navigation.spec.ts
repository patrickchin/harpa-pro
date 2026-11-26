import { expect, test } from '@playwright/test';
import { APP_STORE_URL } from '../src/lib/reports/links';
import { sectionForPath } from '../src/lib/site/sections';

const REQUIRED_ROUTES = [
  '/',
  '/reports',
  '/reports/docs',
  '/reports/roadmap',
  '/privacy',
  '/reports/account-deletion',
  '/procurement/how-to-buy-from-china',
  '/procurement/guides',
] as const;

test('separates procurement from site reporting', async ({ page }) => {
  await page.goto('/reports');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Daily site reports from voice notes, photos, and text',
    }),
  ).toBeVisible();
  await expect(page.locator('[data-voice-demo]')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'From site update to daily report' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Reporting tools' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'The team behind Harpa Pro' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Questions' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View guides', exact: true }).first(),
  ).toHaveAttribute('href', '/reports/docs');
  await expect(
    page.getByRole('link', { name: 'View roadmap', exact: true }).first(),
  ).toHaveAttribute('href', '/reports/roadmap');
  await expect(page.locator('form')).toHaveCount(0);
  await expect(
    page.getByText(/waitlist|schedule a meeting|join the product updates list/i),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);

  await page.goto('/reports/roadmap');
  await expect(page.getByText('Site reporting roadmap', { exact: true })).toBeVisible();
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
  for (const oldRoute of ['/app', '/docs', '/roadmap', '/account-deletion', '/how-to-buy-from-china', '/confirm', '/reports/confirm']) {
    expect(sitemapRoutes, `noncanonical or private route ${oldRoute}`).not.toContain(oldRoute);
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

test('app update confirmation uses the existing API and returns to site reporting', async ({ page }) => {
  let submittedToken: string | undefined;
  await page.route('**/waitlist/confirm', async (route) => {
    submittedToken = route.request().postDataJSON().token;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/reports/confirm?token=existing-email-token');
  await expect(page.locator('#confirm-title')).toHaveText('You’re confirmed. 🎉');
  expect(submittedToken).toBe('existing-email-token');
  await expect(page.locator('#confirm-home')).toHaveAttribute('href', '/reports');
  await expect(page.locator('#confirm-home')).toHaveText('← Back to the Harpa Pro app page');
  await expect(page.locator('#confirm-next-steps')).toBeHidden();
  await expect(page.locator('main#main-content')).toHaveCount(1);
  const result = page.getByRole('status');
  await expect(result).toHaveAttribute('aria-live', 'polite');
  await expect(result).toHaveAttribute('aria-busy', 'false');
  await expect(result).toContainText('You’re confirmed.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});

test('expired app update confirmation offers real next steps instead of a missing signup', async ({ page }) => {
  await page.route('**/waitlist/confirm', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/reports/confirm?token=expired-token');
  const result = page.getByRole('status');
  await expect(result.locator('#confirm-title')).toHaveText('Invalid or expired link');
  await expect(result).not.toContainText('sign up again');
  await expect(result).not.toContainText('home page');
  await expect(page.locator('#confirm-app-store')).toHaveAttribute('href', APP_STORE_URL);
  await expect(page.locator('#confirm-support')).toHaveAttribute('href', /^mailto:patrick@harpapro\.com/);
  await expect(page.locator('#confirm-home')).toHaveAttribute('href', '/reports');
  await expect(page.locator('#confirm-home')).toBeVisible();
});

test('scopes header, footer, and wordmark to each sitemap page section', async ({ page, request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url!).pathname);

  for (const route of routes) {
    await page.goto(route);
    const section = sectionForPath(route);
    await expect(page.locator('body'), route).toHaveAttribute('data-site-section', section);
    const header = page.locator('[data-site-header]');
    const footer = page.locator('[data-site-footer]');
    const desktopNav = header.locator('nav[aria-label="Primary"]');
    await expect(header.locator('[data-wordmark]'), route)
      .toHaveAttribute('href', section === 'reports' ? '/reports' : '/');

    if (section === 'shared') {
      await expect(desktopNav.locator('[data-mega-menu]'), route).toHaveCount(0);
      await expect(desktopNav.getByRole('link'), route).toHaveText(['Interior procurement', 'Site reporting app']);
      await expect(header.locator('[data-mobile-actions]'), route).toHaveCount(0);
      continue;
    }
    const other = section === 'procurement' ? 'site-reporting' : 'procurement';
    await expect(desktopNav.locator(`[data-mega-menu="${other}"]`), route).toHaveCount(0);
    await expect(desktopNav.locator('[data-audience-switch]'), route).toHaveCount(1);
    await expect(footer.locator('[data-audience-switch]'), route).toHaveCount(1);
    await expect(desktopNav.locator('[data-audience-switch]'), route)
      .toHaveAttribute('data-audience-from', section);
    if (section === 'procurement') {
      await expect(footer.locator('a[href="/reports/roadmap"]'), route).toHaveCount(0);
    } else {
      await expect(footer.locator('a[href="/#contact"]'), route).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('a[href="/"]'), route)
        .toHaveCount(0);
    }
  }
});

test('presents both offers equally on shared pages', async ({ page }) => {
  await page.goto('/privacy');
  const desktopNav = page.locator('header nav[aria-label="Primary"]');
  await expect(desktopNav.getByRole('link', { name: 'Interior procurement', exact: true }))
    .toHaveAttribute('href', '/');
  await expect(desktopNav.getByRole('link', { name: 'Site reporting app', exact: true }))
    .toHaveAttribute('href', '/reports');
  await expect(desktopNav.getByRole('link', { name: /Contact us|Get the app/ })).toHaveCount(0);
  await expect(page.locator('footer nav[aria-label="Procurement"]')).toBeVisible();
  await expect(page.locator('footer nav[aria-label="Site reporting"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-mobile-menu] summary').click();
  await expect(page.locator('[data-mobile-procurement]')).toBeVisible();
  await expect(page.locator('[data-mobile-site-reporting]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
