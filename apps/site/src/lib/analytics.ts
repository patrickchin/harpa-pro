import type { CaptureResult, PostHog } from 'posthog-js';

let client: PostHog | undefined;

const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
type Campaign = Partial<Record<typeof campaignKeys[number], string>>;

export function getCampaignParams(url: URL): Campaign {
  const campaign: Campaign = {};
  for (const key of campaignKeys) {
    const values = url.searchParams.getAll(key);
    const value = values[0];
    if (values.length === 1 && value && /^[a-z0-9_-]{1,80}$/i.test(value)) {
      campaign[key] = value.toLowerCase();
    }
  }
  return campaign;
}

function propagateCampaignLinks(campaign: Campaign): void {
  if (!Object.keys(campaign).length) return;
  const decorate = (link: HTMLAnchorElement) => {
    if (link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#')) return;
    let url: URL;
    try { url = new URL(link.href); } catch { return; }
    if (url.origin !== window.location.origin || campaignKeys.some((key) => url.searchParams.has(key))) return;
    for (const [key, value] of Object.entries(campaign)) url.searchParams.set(key, value);
    link.href = url.href;
  };
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(decorate);
  // Docs search inserts links after initialization; decorate before native navigation too.
  for (const name of ['click', 'auxclick']) document.addEventListener(name, (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (link) decorate(link);
  });
}

type ContactEvent =
  | 'contact_whatsapp_clicked'
  | 'contact_email_opened'
  | 'contact_email_copied';

export function captureContact(event: ContactEvent): void {
  try {
    client?.capture(event, {
      page_path: window.location.pathname,
      location: 'home_contact',
    });
  } catch {
    // Contact actions must still succeed if the analytics client fails.
  }
}

/** Confirmation tokens and arbitrary query input must never leave the site. */
export function sanitizeAnalyticsEvent(event: CaptureResult | null, campaign: Campaign = {}): CaptureResult | null {
  if (!event) return null;
  for (const [key, value] of Object.entries(event.properties)) {
    // Only our validated labels may leave the page, including SDK-prefixed attribution.
    if (/(^|_)(utm_.*|gclid|dclid|fbclid|msclkid|gbraid|wbraid|gad_source|gclsrc|fbc|fbp)$/i.test(key.replace(/^\$/, ''))) {
      delete event.properties[key];
      continue;
    }
    if (typeof value !== 'string' || !/url|referrer/i.test(key)) continue;
    try {
      const url = new URL(value);
      event.properties[key] = `${url.origin}${url.pathname}`;
    } catch {
      delete event.properties[key];
    }
  }
  delete event.properties.$initial_person_info;
  delete event.$set;
  delete event.$set_once;
  Object.assign(event.properties, campaign);
  return event;
}

export async function initAnalytics(config: { key: string; host: string }): Promise<void> {
  if (client || navigator.doNotTrack === '1' ||
    ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true)) return;
  const campaign = getCampaignParams(new URL(window.location.href));
  propagateCampaignLinks(campaign);
  const { default: posthog } = await import('posthog-js');
  posthog.init(config.key, {
    api_host: config.host,
    defaults: '2026-05-30',
    cookieless_mode: 'always',
    person_profiles: 'never',
    internal_or_test_user_hostname: null,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: {
      dom_event_allowlist: ['click'],
      element_allowlist: ['a', 'button'],
      css_selector_ignorelist: [
        '.ph-no-autocapture', '[data-ph-no-autocapture]', 'form', '.docs-search',
      ],
      capture_copied_text: false,
    },
    mask_all_text: true,
    mask_all_element_attributes: true,
    save_campaign_params: false,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_surveys: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    respect_dnt: true,
    before_send: (event) => sanitizeAnalyticsEvent(event, campaign),
  });
  client = posthog;
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-contact-event]')
      : null;
    const name = target?.getAttribute('data-contact-event');
    if (name === 'contact_whatsapp_clicked' || name === 'contact_email_opened') {
      captureContact(name);
    }
  });
}
