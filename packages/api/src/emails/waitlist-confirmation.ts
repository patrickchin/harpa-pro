/**
 * Waitlist confirmation email.
 *
 * M1.3 ships this as plain HTML + text strings; M1.5 swaps in a
 * React Email template that renders to the same shape. Keeping the
 * function signature stable means the route in routes/waitlist.ts
 * doesn't change between M1.3 and M1.5.
 */

export interface RenderedEmail {
  html: string;
  text: string;
}

export interface WaitlistConfirmationProps {
  confirmUrl: string;
}

export function renderWaitlistConfirmationEmail(
  props: WaitlistConfirmationProps,
): RenderedEmail {
  const { confirmUrl } = props;
  const text = [
    "You're nearly on the harpapro.com waitlist.",
    '',
    'Click the link below to confirm your spot — it expires in 7 days:',
    confirmUrl,
    '',
    "If you didn't sign up, you can safely ignore this email.",
    '',
    '— The Harpa Pro team',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f7f4;color:#1f1d1a;padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e8e4dd;border-radius:12px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;">You're nearly on the waitlist.</h1>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
        Click the button below to confirm your spot on the harpapro.com waitlist.
        The link expires in 7 days.
      </p>
      <p style="margin:0 0 24px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#0f5f3f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:500;">
          Confirm my spot
        </a>
      </p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#6b665d;">Or copy this URL into your browser:</p>
      <p style="margin:0 0 24px 0;font-size:13px;word-break:break-all;color:#6b665d;">${confirmUrl}</p>
      <hr style="border:none;border-top:1px solid #e8e4dd;margin:24px 0;" />
      <p style="margin:0;font-size:13px;color:#6b665d;">
        If you didn't sign up, you can safely ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { html, text };
}
