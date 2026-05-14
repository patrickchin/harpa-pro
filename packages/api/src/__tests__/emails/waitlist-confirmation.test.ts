/**
 * Snapshot test for the waitlist confirmation email.
 * Guards against silent regressions in the rendered HTML/text the
 * subscriber sees in their inbox.
 */
import { describe, it, expect } from 'vitest';
import { renderWaitlistConfirmationEmail } from '../../emails/waitlist-confirmation.js';

describe('renderWaitlistConfirmationEmail', () => {
  it('renders deterministic HTML + text for a known confirmUrl', () => {
    const { html, text } = renderWaitlistConfirmationEmail({
      confirmUrl: 'https://harpapro.com/confirm?token=DETERMINISTIC_FIXTURE_TOKEN',
    });
    expect(text).toMatchInlineSnapshot(`
      "You're nearly on the Harpa Pro waitlist.

      Confirm your spot (link expires in 7 days):
      https://harpapro.com/confirm?token=DETERMINISTIC_FIXTURE_TOKEN

      If you didn't sign up, ignore this email.

      — Patrick from Harpa Pro
      "
    `);
    expect(html).toContain('https://harpapro.com/confirm?token=DETERMINISTIC_FIXTURE_TOKEN');
    expect(html).toContain('Confirm my spot');
    expect(html).toContain("nearly on the waitlist");
    // No script tags / dangerous attrs in marketing email.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror=/i);
  });

  it('injects the confirmUrl exactly three times: button href, fallback href, fallback visible copy', () => {
    const url = 'https://harpapro.com/confirm?token=ABC';
    const { html } = renderWaitlistConfirmationEmail({ confirmUrl: url });
    // Three occurrences:
    //   1. Primary CTA button <a href>
    //   2. The "copy this URL" fallback <a href> (so it's still
    //      clickable for clients that strip the styled button)
    //   3. The visible text of the fallback link
    // Anything else means we accidentally double-rendered.
    const occurrences = html.split(url).length - 1;
    expect(occurrences).toBe(3);
  });
});
