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
  await page.goto('/?token=private-token-e2e&utm_source=private-campaign-e2e#contact', {
    referer: 'https://example.com/source?email=private-referrer-e2e',
  });
  await expect.poll(() => events.filter((event) => event.event === '$pageview').length, { timeout: 12_000 }).toBe(1);

  await page.getByRole('button', { name: 'Copy email', exact: true }).click();
  await expect(page.locator('[data-copy-email-status]')).toHaveText('Email copied');
  await page.getByRole('link', { name: 'Open email app', exact: true }).click();
  await page.getByRole('link', { name: 'Message on WhatsApp', exact: true }).click();
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
