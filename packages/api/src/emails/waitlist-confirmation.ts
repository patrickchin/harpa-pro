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

  // Palette mirrors apps/marketing/src/styles/globals.css ("warm paper
  // + navy ink"). oklch() values are flattened to hex here because
  // Gmail/Outlook don't support oklch(). The hex values below are
  // computed from the oklch tokens via the standard OKLab -> linear
  // sRGB -> sRGB transform — do NOT eyeball-adjust them, regenerate
  // from globals.css if the design tokens change.
  //
  //   --background        oklch(0.965 0.008 85)   -> #f6f3ed  (warm paper)
  //   --card              oklch(0.99  0.008 90)   -> #fefcf6  (card surface)
  //   --secondary / bg-paper-2  oklch(0.94 0.012 85) -> #efebe2
  //   --foreground / --primary  oklch(0.35 0.04 265) -> #303a50 (navy ink)
  //   --muted-foreground  oklch(0.5  0.02  265)   -> #5e636f  (ink-soft)
  //   --border            oklch(0.74 0.012 85)    -> #aeaaa2
  //     hairline = border @ 60% over background  -> #cac7c0
  //   --accent            oklch(0.646 0.182 41)   -> #e55d22  (orange)
  //
  // Wordmark tile uses --primary (navy) with --primary-foreground
  // text, matching apps/marketing/src/components/landing/Wordmark.astro.
  // The hard-hat icon is the same lucide path used in the favicon
  // (apps/marketing/public/favicon.svg), inlined as SVG so modern
  // clients render it; Outlook-desktop fallback is the bare tile.
  const hardHatSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fefcf6" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Harpa Pro">' +
    '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>' +
    '<path d="M14 6a6 6 0 0 1 6 6v3"/>' +
    '<path d="M4 15v-3a6 6 0 0 1 6-6"/>' +
    '<rect x="2" y="15" width="20" height="4" rx="1"/>' +
    '</svg>';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Confirm your Harpa Pro waitlist spot</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ed;color:#303a50;font-family:'Inter','Helvetica Neue',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Confirm your spot on the Harpa Pro waitlist — link expires in 7 days.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f3ed;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="36" height="36" align="center" valign="middle" style="background:#303a50;border-radius:6px;width:36px;height:36px;line-height:36px;font-size:0;mso-line-height-rule:exactly;">${hardHatSvg}</td>
                  <td style="padding-left:10px;font-family:'Inter','Helvetica Neue',sans-serif;font-weight:600;font-size:17px;letter-spacing:-0.01em;color:#303a50;vertical-align:middle;">Harpa Pro</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#fefcf6;border:1px solid #cac7c0;border-radius:12px;padding:36px 32px;">
              <p style="margin:0 0 12px 0;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;color:#e55d22;">Almost there</p>
              <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.015em;color:#303a50;">
                You're nearly on the waitlist.
              </h1>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:#5e636f;">
                Tap the button below to confirm your spot on the
                <span style="color:#303a50;">harpapro.com</span> waitlist.
                The link expires in 7 days.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#e55d22;border-radius:8px;">
                    <a href="${confirmUrl}" style="display:inline-block;padding:13px 22px;font-family:'Inter','Helvetica Neue',sans-serif;font-size:15px;font-weight:500;line-height:1;color:#fefcf6;text-decoration:none;">
                      Confirm my spot &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 6px 0;font-size:12px;color:#5e636f;">
                Or copy this URL into your browser:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#5e636f;word-break:break-all;">
                <a href="${confirmUrl}" style="color:#5e636f;text-decoration:underline;">${confirmUrl}</a>
              </p>
              <div style="height:1px;background:#cac7c0;margin:28px 0;line-height:1px;font-size:0;">&nbsp;</div>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#5e636f;">
                If you didn't sign up, you can safely ignore this email &mdash;
                we won't add you to the list without a confirmation.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 8px 4px;font-size:12px;line-height:1.5;color:#5e636f;">
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
