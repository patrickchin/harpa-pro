import type { CaptureResult, PostHog } from 'posthog-js';

let client: PostHog | undefined;

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
export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  for (const [key, value] of Object.entries(event.properties)) {
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
  return event;
}

export async function initAnalytics(config: { key: string; host: string }): Promise<void> {
  if (client || navigator.doNotTrack === '1' ||
    ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true)) return;
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
    before_send: sanitizeAnalyticsEvent,
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
