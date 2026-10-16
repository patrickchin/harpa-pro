# Public-site PostHog analytics

## Purpose

Measure which pages people visit, which controls they click, and whether
they choose WhatsApp, copy the contact email, or open their email app.
Use the existing PostHog free tier; no API, dashboard, or mobile changes.

## Collection

The shared Astro layout loads `posthog-js` when the optional public project
token and ingestion host are both configured. Missing configuration disables
analytics; partial or invalid configuration fails the build. Development
and PR Cloudflare builds explicitly disable collection so they cannot
pollute the production project.

Use `cookieless_mode: 'always'` and `person_profiles: 'never'`. Do not
identify visitors or write analytics cookies, local storage, or session
storage. Disable recordings, heatmaps, surveys, flags, and error capture.
Skip initialization when the browser sends Do Not Track or Global Privacy
Control.
This is the scoped consent review for the existing no-cookies-before-consent
rule; cookieless collection is not a general legal-compliance guarantee.
Recordings or persistent identities require a separate consent design.

Capture pageviews/pageleaves and click-only autocapture for links and
buttons. Mask DOM text and attributes, and exclude forms and the docs search
component entirely. Never capture search input, confirmation tokens, email
addresses, or clipboard contents. Strip URL queries and fragments from event
properties and referrers, and disable campaign-parameter persistence.

Explicit contact events carry only `page_path` and the fixed
`location: 'home_contact'` property:

| Event | Trigger |
| --- | --- |
| `contact_whatsapp_clicked` | WhatsApp link clicked |
| `contact_email_opened` | Email-app link clicked |
| `contact_email_copied` | Clipboard write succeeds |

Do not delay navigation or make contact actions depend on analytics. A click
measures intent, not a successfully sent message. Failed clipboard writes
must not produce a successful-copy conversion.

## Configuration and disclosure

Set `PUBLIC_POSTHOG_KEY` (public `phc_` project token, never a personal key)
and `PUBLIC_POSTHOG_HOST` (`https://us.i.posthog.com` or
`https://eu.i.posthog.com`) in the production Cloudflare Pages environment.
Enable **Cookieless server hash mode** under PostHog project settings → Web
analytics; otherwise ingestion discards cookieless events. Use a separate
test project for local checks. Keep the account on its free plan without a
payment card if collection should stop at the free allowance.

The privacy route includes a visible notice describing this collection. Its
embedded Termly policy is externally managed; reconcile that hosted notice
before production activation. Verify provider configuration separately from
receiving live website events.

### Provider setup verified on 2026-10-16

- PostHog project `308052` uses EU Cloud and the capped Free plan.
- Cookieless tracking is enabled and saved in Web analytics settings.
- The authorized Web analytics URL is `https://harpapro.com`.
- Session replay, heatmaps, and web vitals collection remain disabled.
- Both public build variables are configured in the `harpa-pro` Cloudflare
  Pages **production** environment. Wrangler stores these as encrypted build
  variables; the project token is still intentionally public in browser code.
- No production deployment has been triggered. Live website ingestion is
  pending the normal protected Git deployment of this integration.

## Verification

- Validate disabled, incomplete, and invalid public configuration.
- Exercise the built site with the real SDK and intercepted ingestion;
  assert pageviews, click capture, and each contact event.
- Assert failed copying has no conversion, queries/tokens/search values
  are absent, no analytics browser storage is written, and contact actions
  still work when requests are blocked.
- Run site unit tests, lint, Astro typecheck/build, and focused browser tests.

Reference: [PostHog cookieless tracking](https://posthog.com/tutorials/cookieless-tracking).
