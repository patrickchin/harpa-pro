import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Search metadata and product facts must arrive without running client scripts.
test.use({ javaScriptEnabled: false });

test('every sitemap page has unique metadata and an accurate production identity', async ({
  page,
  request,
}) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const sitemap = await response.text();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url!);
  expect(locations.length).toBeGreaterThan(6);
  expect(new Set(locations).size).toBe(locations.length);
  const titles = new Set<string>();
  const descriptions = new Set<string>();

  for (const location of locations) {
    const url = new URL(location);
    expect(url.origin).toBe('https://harpapro.com');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    const result = await page.goto(url.pathname);
    expect(result?.status(), location).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toContainText(/\S/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', location);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', location);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow, max-snippet:-1/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Each product area keeps its own social card: the app card for reports,
    // interior imagery for procurement.
    const socialImage = (await page.locator('meta[property="og:image"]').getAttribute('content'))!;
    const socialImageAlt = await page.locator('meta[property="og:image:alt"]').getAttribute('content');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', socialImage);
    expect(new URL(socialImage).origin).toBe('https://harpapro.com');
    expect((await request.get(new URL(socialImage).pathname)).status(), socialImage).toBe(200);
    expect(socialImageAlt?.length).toBeGreaterThan('Harpa Pro'.length);
    if (url.pathname === '/reports' || url.pathname.startsWith('/reports/')) {
      expect(new URL(socialImage).pathname, location).toBe('/og-image.png');
    }
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#e55d22');
    if (url.pathname === '/' || url.pathname.startsWith('/procurement/')) {
      await expect(page.locator('body')).toHaveAttribute('data-site-section', 'procurement');
      expect(new URL(socialImage).pathname, location).not.toBe('/og-image.png');
      expect(socialImageAlt, location).toMatch(/^Generated /);
    }

    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(title).toContain('Harpa Pro');
    expect(description?.trim().length).toBeGreaterThan(20);
    expect(titles.has(title), title).toBe(false);
    expect(descriptions.has(description!), description!).toBe(false);
    titles.add(title);
    descriptions.add(description!);
    if (url.pathname === '/reports' || url.pathname.startsWith('/reports/')) {
      expect(title, location).not.toMatch(/procurement/i);
      expect(description, location).not.toMatch(/procurement/i);
    }

    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const data = JSON.parse((await scripts.textContent())!);
    expect(data['@context']).toBe('https://schema.org');
    const graph = data['@graph'] as Record<string, unknown>[];
    expect(graph.find((node) => node['@type'] === 'Organization')).toMatchObject({
      '@id': 'https://harpapro.com/#organization', name: 'Harpa Pro',
    });
    expect(graph.find((node) => node['@type'] === 'WebSite')).toMatchObject({
      '@id': 'https://harpapro.com/#website', url: 'https://harpapro.com/',
    });
    const pageNode = graph.find((node) => node['@id'] === `${location}#webpage`);
    expect(pageNode).toMatchObject({ url: location, name: title, description });

    if (url.pathname === '/') {
      expect(graph.find((node) => node['@type'] === 'Service')).toMatchObject({
        name: 'Luxury Interior Procurement in China',
        areaServed: { '@type': 'Country', name: 'China' },
        provider: { '@id': 'https://harpapro.com/#organization' },
      });
      expect(graph.some((node) => node['@type'] === 'MobileApplication')).toBe(false);
      expect(graph.some((node) => node['@type'] === 'FAQPage')).toBe(false);
      await expect(page.locator('main')).toContainText('factory coordination');
      await expect(page.locator('#procurement-questions article')).toHaveCount(4);
      await expect(page.locator('#procurement-questions')).toContainText('What furniture and interior products');
      await expect(page.locator('#procurement-questions')).toContainText('custom cabinetry and joinery');
      await expect(page.locator('#procurement-questions')).toContainText('At agreed points during production');
    }

    if (url.pathname === '/reports') {
      expect(graph.find((node) => node['@type'] === 'MobileApplication')).toMatchObject({
        name: 'Harpa Pro',
        operatingSystem: 'iOS',
        applicationCategory: 'BusinessApplication',
        downloadUrl: 'https://apps.apple.com/us/app/harpa-pro/id6776759817',
      });
      const faq = graph.find((node) => node['@type'] === 'FAQPage');
      const questions = faq?.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
      const visibleQuestions = await page.locator('#faq dt').allTextContents();
      expect(questions.map((question) => question.name)).toEqual(
        visibleQuestions.map((question) => question.trim()),
      );
      for (const [index, question] of questions.entries()) {
        const answer = (await page.locator('#faq dd').nth(index).textContent())!;
        expect(question.acceptedAnswer.text).toBe(answer.replace(/\s+/g, ' ').trim());
      }
      await expect(page.locator('main')).toContainText('Android support is planned');
      await expect(page.locator('main')).toContainText('review, edit, and share');
      await expect(page.locator('main')).toContainText('for foremen and site supervisors');
      await expect(page.locator('#faq details')).toHaveCount(0);
      await expect(page.locator('#faq dd').first()).toBeVisible();
      await expect(page.locator('[data-voice-demo]')).toContainText('New Report');
      await expect(page.locator('[data-voice-demo]')).toContainText('Summary:');
      await expect(
        page.locator('[data-closing-cta]').getByRole('link', { name: 'Download on the App Store' }),
      ).toHaveCount(1);
    }

    if (url.pathname === '/procurement/how-to-buy-from-china') {
      expect(graph.find((node) => node['@type'] === 'Article')).toMatchObject({
        headline: 'How to buy from China',
        url: location,
        mainEntityOfPage: { '@id': `${location}#webpage` },
        author: { '@id': 'https://harpapro.com/#organization' },
      });
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
      await expect(page.locator('article h2')).toHaveCount(6);
      await expect(page.getByRole('navigation', { name: 'On this page' }).locator('a')).toHaveCount(
        6,
      );
      await expect(page.locator('article')).toContainText('Keep the approved sample.');
      await expect(page.locator('article figure')).toContainText('Generated material concept');
      await expect(page.locator('article figure img')).toHaveAttribute('alt', /Generated/);
      const fonts = await page.evaluate(() => ({
        title: getComputedStyle(document.querySelector('h1')!).fontFamily,
        step: getComputedStyle(document.querySelector('article h2')!).fontFamily,
        body: getComputedStyle(document.querySelector('.article-copy p')!).fontFamily,
        wordmark: getComputedStyle(document.querySelector('[data-site-header] > div > a span')!).fontFamily,
        titleColor: getComputedStyle(document.querySelector('h1')!).color,
        bodyColor: getComputedStyle(document.querySelector('.article-copy')!).color,
        walnut: getComputedStyle(document.querySelector('[data-site-header]')!).backgroundColor,
      }));
      expect(fonts.title).toContain('Inter');
      expect(fonts.step).toContain('Inter');
      expect(fonts.body).toContain('Inter');
      expect(fonts.wordmark).toContain('Inter');
      expect(fonts.titleColor).toBe(fonts.walnut);
      expect(fonts.bodyColor).toBe(fonts.walnut);
    }

    if (url.pathname.startsWith('/reports/docs') || url.pathname.startsWith('/procurement/')) {
      if (url.pathname.startsWith('/reports/docs')) {
        expect(pageNode?.['@type']).toBe(url.pathname === '/reports/docs' ? 'CollectionPage' : 'TechArticle');
      }
      const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList');
      const items = breadcrumb?.itemListElement as { name: string; item: string; position: number }[];
      const visible = await page.locator('.docs-breadcrumbs a, .docs-breadcrumbs [aria-current="page"]').allTextContents();
      expect(items.map((item) => item.name)).toEqual(visible.map((name) => name.trim()));
      expect(items.map((item) => item.position)).toEqual(items.map((_, index) => index + 1));
      expect(items.at(-1)?.item).toBe(location);
    }
  }
});

test('normalizes canonicals and excludes utility and error pages from indexing', async ({ page, request }) => {
  for (const path of ['/reports?utm_source=search', '/reports/docs/guides/generate-ai-report?ref=ai']) {
    await page.goto(path);
    const canonical = `https://harpapro.com${new URL(path, 'https://harpapro.com').pathname.replace(/\/$/, '')}`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  }

  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/reports/confirm?token=example', '/not-a-real-page']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(path.startsWith('/reports/confirm') ? 200 : 404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    expect(sitemap).not.toContain(new URL(path, 'https://harpapro.com').pathname);
  }

  const headers = readFileSync(new URL('../dist/_headers', import.meta.url), 'utf8');
  expect(headers).toContain('https://harpa-pro.pages.dev/*\n  X-Robots-Tag: noindex');
  expect(headers).not.toMatch(/^\/\*/m);
});

test('allows search and AI-search crawlers to fetch public content', async ({ request }) => {
  for (const userAgent of ['Googlebot', 'bingbot', 'OAI-SearchBot', 'PerplexityBot']) {
    const headers = { 'User-Agent': userAgent };
    const robotsResponse = await request.get('/robots.txt', { headers });
    expect(robotsResponse.status()).toBe(200);
    const robots = await robotsResponse.text();
    expect(robots).toContain('User-agent: *\nAllow: /');
    expect(robots).not.toContain('Disallow:');
    expect(robots).toContain('Sitemap: https://harpapro.com/sitemap.xml');
    const response = await request.get('/', { headers });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Luxury Interior Procurement in China');
  }
});

test('sitemap lists every indexable built page', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const listed = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url!).pathname),
  );
  const dist = new URL('../dist/', import.meta.url);
  const built = readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.html'))
    .filter((file) => !readFileSync(new URL(file, dist), 'utf8').includes('content="noindex'))
    .map((file) => `/${file.replace(/\\/g, '/')}`.replace(/(?:\/index)?\.html$/, '') || '/');

  expect(built.some((path) => path.startsWith('/reports/'))).toBe(true);
  expect(built.some((path) => path.startsWith('/procurement/'))).toBe(true);
  expect([...listed].sort()).toEqual(built.sort());
});

test('privacy page opens the hosted policy in a new tab', async ({ page }) => {
  await page.goto('/privacy');
  const link = page.getByRole('link', { name: /Open the hosted policy/ });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toHaveAccessibleName('Open the hosted policy (opens in a new tab)');
  await expect(link.locator('svg[aria-hidden="true"]')).toHaveCount(1);
});
