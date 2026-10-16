import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAnalyticsEnv } from './env';
import { getCampaignParams, sanitizeAnalyticsEvent } from './analytics';

afterEach(() => vi.unstubAllEnvs());

describe('optional analytics configuration', () => {
  it('disables unconfigured analytics and validates configured token/region pairs', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', '');
    expect(getAnalyticsEnv()).toBeUndefined();

    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_test');
    expect(() => getAnalyticsEnv()).toThrow('PUBLIC_POSTHOG_HOST');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
    expect(getAnalyticsEnv()).toEqual({ key: 'phc_test', host: 'https://eu.i.posthog.com' });
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    expect(getAnalyticsEnv()?.host).toBe('https://us.i.posthog.com');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://example.com');
    expect(() => getAnalyticsEnv()).toThrow('PUBLIC_POSTHOG_HOST');
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phx_personal');
    expect(() => getAnalyticsEnv()).toThrow('PUBLIC_POSTHOG_KEY');
  });
});

it('removes URL queries, fragments, nested attribution and person updates before sending', () => {
  const event = sanitizeAnalyticsEvent({
    uuid: 'test', event: '$pageview',
    properties: {
      $current_url: 'https://harpapro.com/confirm?token=secret#private',
      $referrer: 'https://example.com/path?email=private@example.com',
      $initial_current_url: 'https://harpapro.com/?query=secret',
      $initial_referrer: 'not a URL',
      $initial_person_info: { r: 'https://example.com/?token=secret' },
      $pathname: '/confirm',
    },
    $set: { email: 'private@example.com' },
    $set_once: { $initial_current_url: 'https://harpapro.com/?token=secret' },
  });
  expect(event?.properties).toEqual({
    $current_url: 'https://harpapro.com/confirm',
    $referrer: 'https://example.com/path',
    $initial_current_url: 'https://harpapro.com/',
    $pathname: '/confirm',
  });
  expect(JSON.stringify(event)).not.toMatch(/secret|private/);
  expect(sanitizeAnalyticsEvent(null)).toBeNull();
});

it('allows bounded campaign labels and rejects free text, duplicates and identifiers', () => {
  const campaign = getCampaignParams(new URL('https://harpapro.com/?utm_source=LinkedIn&utm_medium=social&utm_campaign=china_buying_guide&utm_content=overview&utm_term=office-lighting&token=secret&gclid=private'));
  expect(campaign).toEqual({
    utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'china_buying_guide',
    utm_content: 'overview', utm_term: 'office-lighting',
  });
  expect(getCampaignParams(new URL(`https://harpapro.com/?utm_source=one&utm_source=two&utm_medium=&utm_campaign=${'a'.repeat(81)}&utm_content=private@example.com&utm_term=private+search`))).toEqual({});
  const event = sanitizeAnalyticsEvent({ uuid: 'test', event: '$pageview', properties: {
    utm_source: 'unvalidated', $session_entry_utm_term: 'private search',
    gclid: 'private', $session_entry_fbclid: 'private', $initial_utm_content: 'private',
    $current_url: 'https://harpapro.com/?token=secret&utm_source=LinkedIn',
  } }, campaign);
  expect(event?.properties).toEqual({ $current_url: 'https://harpapro.com/', ...campaign });
});
