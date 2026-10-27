import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const rules = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => line.split(/\s+/));

test('every exact legacy URL redirects once to a working canonical destination', async ({ request, baseURL }) => {
  for (const [from, to] of rules) {
    if (!from || !to || from.includes('*')) continue;
    const query = '?token=legacy-token%2Bvalue&utm_source=bookmark';
    const response = await request.get(`${from}${query}`, { maxRedirects: 0 });
    expect(response.status(), from).toBe(301);
    const target = new URL(to, baseURL);
    target.search = query;
    expect(new URL(response.headers().location!, baseURL).href, from).toBe(target.href);
    const final = await request.get(`${target.pathname}${target.search}`, { maxRedirects: 0 });
    expect(final.status(), `${from} -> ${target.pathname}`).toBe(200);
  }
});

test('docs wildcard preserves the guide path and unknown guides finish at 404', async ({ request }) => {
  for (const slug of ['getting-started', 'not-a-real-guide']) {
    const response = await request.get(`/docs/guides/${slug}?ref=bookmark`, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    const target = new URL(response.headers().location!, 'http://127.0.0.1:3005');
    expect(`${target.pathname}${target.search}`).toBe(`/reports/docs/guides/${slug}?ref=bookmark`);
    const final = await request.get(`${target.pathname}${target.search}`, { maxRedirects: 0 });
    expect(final.status()).toBe(slug === 'getting-started' ? 200 : 404);
  }
});

test('removed factory documents return to procurement evidence', async ({ request }) => {
  const response = await request.get('/documents/factories/ais/ais-hdf-formaldehyde-e0-2026.pdf', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(new URL(response.headers().location!, 'http://127.0.0.1:3005').pathname).toBe('/');
  expect(new URL(response.headers().location!, 'http://127.0.0.1:3005').hash).toBe('#evidence');
});

test('Pages normalizes canonical trailing slashes and keeps query strings', async ({ request }) => {
  for (const path of ['/reports', '/reports/docs/guides/generate-ai-report', '/procurement/how-to-buy-from-china']) {
    const response = await request.get(`${path}/?ref=bookmark`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const target = new URL(response.headers().location!, 'http://127.0.0.1:3005');
    expect(`${target.pathname}${target.search}`).toBe(`${path}?ref=bookmark`);
  }
});
