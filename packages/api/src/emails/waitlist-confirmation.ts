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
    'Click the link below to confirm your spot! (it expires in 7 days)',
    confirmUrl,
    '',
    "If you didn't sign up, you can safely ignore this email.",
    '',
    '— Patrick from the Harpa Pro team',
  ].join('\n');

  // Palette mirrors apps/marketing — "warm paper + navy ink" with
  // an accent orange CTA. oklch values from globals.css are flattened
  // to hex here because Gmail, Outlook etc. don't support oklch().
  //   --background  oklch(0.965 0.008 85)  -> #f5f1e8 (warm paper)
  //   --card        oklch(0.99  0.008 90)  -> #fbf8f1
  //   --foreground  oklch(0.35  0.04  265) -> #2f3a5b (navy ink, also --primary)
  //   --muted-fg    oklch(0.5   0.02  265) -> #6b6f85 (ink-soft)
  //   --border      oklch(0.74  0.012 85)  -> #d8d3c8 (hairline ~60%)
  //   --accent      oklch(0.646 0.182 41)  -> #d97539 (orange CTA)
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Confirm your Harpa Pro waitlist spot</title>
</head>
<body style="margin:0;padding:0;background:#f5f1e8;color:#2f3a5b;font-family:'Inter','Helvetica Neue',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Confirm your spot on the Harpa Pro waitlist — link expires in 7 days.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f1e8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#2f3a5b;border-radius:6px;width:36px;height:36px;text-align:center;vertical-align:middle;font-family:'Inter','Helvetica Neue',sans-serif;font-weight:700;font-size:18px;color:#fbf8f1;line-height:36px;">H</td>
                  <td style="padding-left:10px;font-family:'Inter','Helvetica Neue',sans-serif;font-weight:600;font-size:17px;letter-spacing:-0.01em;color:#2f3a5b;">Harpa Pro</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#fbf8f1;border:1px solid #d8d3c8;border-radius:12px;padding:36px 32px;">
              <p style="margin:0 0 12px 0;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;color:#d97539;">Almost there</p>
              <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.015em;color:#2f3a5b;">
                You're nearly on the waitlist.
              </h1>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:#6b6f85;">
                Tap the button below to confirm your spot on the
                <span style="color:#2f3a5b;">harpapro.com</span> waitlist.
                The link expires in 7 days.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#d97539;border-radius:8px;">
                    <a href="${confirmUrl}" style="display:inline-block;padding:13px 22px;font-family:'Inter','Helvetica Neue',sans-serif;font-size:15px;font-weight:500;line-height:1;color:#fbf8f1;text-decoration:none;">
                      Confirm my spot &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 6px 0;font-size:12px;color:#6b6f85;">
                Or copy this URL into your browser:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b6f85;word-break:break-all;">
                <a href="${confirmUrl}" style="color:#6b6f85;text-decoration:underline;">${confirmUrl}</a>
              </p>
              <div style="height:1px;background:#d8d3c8;margin:28px 0;line-height:1px;font-size:0;">&nbsp;</div>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6f85;">
                If you didn't sign up, you can safely ignore this email &mdash;
                we won't add you to the list without a confirmation.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 8px 4px;font-size:12px;line-height:1.5;color:#6b6f85;">
              Daily reports before you leave the jobsite.<br />
              &copy; ${new Date().getFullYear()} Harpa Pro &middot; &mdash; Patrick from the Harpa Pro team
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, text };
}
