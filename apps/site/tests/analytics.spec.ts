import { gunzipSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';
import type { CaptureResult } from 'posthog-js';

async function observeAnalytics(page: Page) {
  const events: CaptureResult[] = [];
  await page.route('https://eu.i.posthog.com/**', async (route) => {
    const body = route.request().postDataBuffer();
    if (body?.length) {
      let decoded = body[0] === 0x1f ? gunzipSync(body).toString() : body.toString();
      if (!decoded.startsWith('{') && !decoded.startsWith('[')) {
        const data = Buffer.from(new URLSearchParams(decoded).get('data') ?? '', 'base64');
        decoded = data[0] === 0x1f ? gunzipSync(data).toString() : data.toString();
      }
      const payload = JSON.parse(decoded);
      events.push(...(payload.batch ?? (Array.isArray(payload) ? payload : [payload])));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(() => {
    // Simulate a visitor: the SDK otherwise drops webdriver traffic as bots.
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    // Keep contact navigation in this test tab without launching external apps.
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link?.href.startsWith('mailto:') || link?.href.startsWith('https://wa.me/')) {
        event.preventDefault();
      }
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  return events;
}

test('real SDK sends visits, clicks and successful contact conversions without browser storage', async ({ page }) => {
  const events = await observeAnalytics(page);
  await page.goto('/?token=private-token-e2e&utm_source=private%40campaign-e2e#contact', {
    referer: 'https://example.com/source?email=private-referrer-e2e',
  });
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length, { timeout: 12_000 }).toBe(1);

  await page.getByRole('button', { name: 'Copy email', exact: true }).click();
  await expect(page.locator('[data-copy-email-status]')).toHaveText('Email copied');
  await page.getByRole('link', { name: 'Open email app', exact: true }).click();
  await page.getByRole('link', { name: 'Message on WhatsApp', exact: true }).click();
  expect(events.filter((event) => event.event === 'contact_whatsapp_clicked')).toHaveLength(0);
  await page.getByLabel('I need help with').selectOption('source');
  await page.getByLabel('Your message').fill('private-project-e2e: 40 desks for Lagos, contact buyer@example.com');
  await page.getByRole('link', { name: 'Continue in WhatsApp', exact: true }).click();
  for (const name of ['contact_email_copied', 'contact_email_opened', 'contact_whatsapp_clicked']) {
    await expect.poll(() => events.filter((event) => event.event === name).length).toBe(1);
    expect(events.find((event) => event.event === name)?.properties).toMatchObject({
      page_path: '/', location: 'home_contact',
    });
  }
  expect(events.some((event) => event.event === '$autocapture')).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/private-.*-e2e|haruna@|861937|\$snapshot/);
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookies: document.cookie,
  }))).toEqual({ local: [], session: [], cookies: '' });

  await page.goto('/docs');
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(2);
  await page.getByRole('searchbox', { name: 'Search guides' }).fill('private-search-e2e');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  // A subsequent pageview flushes the preceding pageleave and click batch.
  await page.goto('/app');
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(3);
  expect(events.filter((event) => event.event === '$autocapture' && event.properties.$pathname === '/docs')).toHaveLength(0);
  expect(JSON.stringify(events)).not.toContain('private-search-e2e');
});

test('failed copying has no successful-copy conversion', async ({ page }) => {
  const events = await observeAnalytics(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Clipboard denied'); } },
    });
  });
  await page.goto('/#contact');
  await expect.poll(() => events.some((event) => event.event === '$pageview')).toBe(true);
  await page.getByRole('button', { name: 'Copy email', exact: true }).click();
  await expect(page.locator('[data-copy-email-status]')).toHaveText('Select and copy the email address above');
  await page.goto('/app');
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(2);
  expect(events.filter((event) => event.event === 'contact_email_copied')).toHaveLength(0);
});

test('contact actions still work when analytics requests are blocked', async ({ page }) => {
  await observeAnalytics(page);
  await page.route('https://eu.i.posthog.com/**', (route) => route.abort());
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Copy email', exact: true }).click();
  await expect(page.locator('[data-copy-email-status]')).toHaveText('Email copied');
  await expect(page.getByRole('link', { name: 'Open email app', exact: true })).toHaveAttribute('href', 'mailto:haruna@harpapro.com');
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('honours browser privacy signals without disabling contact actions', async ({ page }) => {
  const events = await observeAnalytics(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Copy email', exact: true }).click();
  await expect(page.locator('[data-copy-email-status]')).toHaveText('Email copied');
  await page.goto('/app');
  expect(events).toHaveLength(0);
});

for (const source of ['facebook', 'linkedin', 'x', 'instagram']) {
  test(`attributes the buying guide and contact conversions to ${source} without storage`, async ({ page }) => {
    const events = await observeAnalytics(page);
    const campaign = {
      utm_source: source, utm_medium: 'social', utm_campaign: 'china_buying_guide',
      utm_content: 'overview', utm_term: 'interior-procurement',
    };
    await page.goto(`/how-to-buy-from-china/?${new URLSearchParams(campaign)}&token=private-token-e2e&gclid=private-click-e2e#buying-checks`);
    await expect.poll(() => events.some((event) => event.event === '$pageview')).toBe(true);
    expect(events.find((event) => event.event === '$pageview')?.properties).toMatchObject(campaign);
    const contact = page.locator('a[href*="#contact"]').first();
    await expect(contact).toHaveAttribute('href', new RegExp(`utm_source=${source}.*#contact$`));
    await contact.click();
    await expect(page).toHaveURL(new RegExp(`[?]utm_source=${source}.*#contact$`));
    await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(2);
    await page.getByRole('button', { name: 'Copy email', exact: true }).click();
    await page.getByRole('link', { name: 'Open email app', exact: true }).click();
    await page.getByRole('link', { name: 'Message on WhatsApp', exact: true }).click();
    await page.getByRole('link', { name: 'Continue in WhatsApp', exact: true }).click();
    await page.getByRole('button', { name: 'Close message helper' }).click();
    for (const name of ['contact_email_copied', 'contact_email_opened', 'contact_whatsapp_clicked']) {
      await expect.poll(() => events.filter((event) => event.event === name).length).toBe(1);
      expect(events.find((event) => event.event === name)?.properties).toMatchObject(campaign);
    }
    await expect(page.getByRole('link', { name: 'Open email app', exact: true })).toHaveAttribute('href', 'mailto:haruna@harpapro.com');
    await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true })).not.toHaveAttribute('href', /utm_/);
    expect(JSON.stringify(events)).not.toMatch(/private-.*-e2e|gclid|fbclid|token=/);
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookies: document.cookie }))).toEqual({ local: [], session: [], cookies: '' });
    // A fresh untagged visit cannot recover an earlier campaign without storage.
    await page.goto('/');
    await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(3);
    expect(events.filter((event) => event.event === '$pageview').at(-1)?.properties).not.toHaveProperty('utm_source');
  });
}

test('propagates only onto internal page links and preserves explicit destination campaigns', async ({ page }) => {
  const events = await observeAnalytics(page);
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      for (const [id, href] of Object.entries({
        internal: '/app?plan=demo#features', own: '/app?utm_source=google&utm_medium=cpc#features',
        external: 'https://example.com/path', fragment: '#contact', download: '/guide.pdf',
      })) {
        const link = document.createElement('a');
        link.id = `utm-test-${id}`; link.href = href; link.textContent = id;
        if (id === 'download') link.download = '';
        document.body.append(link);
      }
    });
  });
  await page.goto('/?utm_source=facebook&utm_medium=social&utm_campaign=china_buying_guide&utm_content=overview');
  await expect.poll(() => events.some((event) => event.event === '$pageview')).toBe(true);
  await expect(page.locator('#utm-test-own')).toHaveAttribute('href', '/app?utm_source=google&utm_medium=cpc#features');
  await expect(page.locator('#utm-test-external')).toHaveAttribute('href', 'https://example.com/path');
  await expect(page.locator('#utm-test-fragment')).toHaveAttribute('href', '#contact');
  await expect(page.locator('#utm-test-download')).toHaveAttribute('href', '/guide.pdf');
  await page.locator('#utm-test-internal').click();
  await expect(page).toHaveURL(/[?]plan=demo&utm_source=facebook.*#features$/);
  await expect(page.locator('a[href*="utm_source=facebook"]').first()).toBeAttached();
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(2);
  await page.locator('#utm-test-own').click();
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length).toBe(3);
  expect(events.filter((event) => event.event === '$pageview').at(-1)?.properties).toMatchObject({ utm_source: 'google', utm_medium: 'cpc' });
  expect(events.filter((event) => event.event === '$pageview').at(-1)?.properties).not.toHaveProperty('utm_campaign');
});
