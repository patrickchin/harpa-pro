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
      "You're nearly on the harpapro.com waitlist.

      Click the link below to confirm your spot — it expires in 7 days:
      https://harpapro.com/confirm?token=DETERMINISTIC_FIXTURE_TOKEN

      If you didn't sign up, you can safely ignore this email.

      — The Harpa Pro team"
    `);
    expect(html).toContain('https://harpapro.com/confirm?token=DETERMINISTIC_FIXTURE_TOKEN');
    expect(html).toContain('Confirm my spot');
    expect(html).toContain("nearly on the waitlist");
    // No script tags / dangerous attrs in marketing email.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror=/i);
  });

  it('injects the confirmUrl exactly once in the href and once in the plain copy', () => {
    const url = 'https://harpapro.com/confirm?token=ABC';
    const { html } = renderWaitlistConfirmationEmail({ confirmUrl: url });
    // Two occurrences: the <a href> and the visible "copy this URL"
    // fallback. Anything else means we accidentally double-rendered.
    const occurrences = html.split(url).length - 1;
    expect(occurrences).toBe(2);
  });
});
