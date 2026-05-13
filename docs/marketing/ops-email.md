# Resend email setup for `harpapro.com`

Operational runbook for verifying the `harpapro.com` sending domain
on [Resend](https://resend.com) so the waitlist confirmation email
(M1.5) lands in inboxes — not spam.

This file documents the steps the operator runs once; it is not
automated. Once complete, the records live in Cloudflare DNS and the
Resend dashboard shows the domain as Verified.

## Prerequisites

- A Resend account with billing enabled (the free tier is fine for
  M1 launch volumes).
- Admin access to the `harpapro.com` zone in
  [Cloudflare DNS](https://dash.cloudflare.com).
- The Fly API app secrets are editable
  (`fly secrets set ... --app harpa-pro-api`).

## Steps

### 1. Add the domain in Resend

1. Sign in at <https://resend.com/domains>.
2. Click **Add Domain**.
3. Enter `harpapro.com` (the apex). **Region**: pick the one closest
   to the Fly app (`eu-west-1` for `harpa-pro-api` deployed in `fra` —
   Resend doesn't have Frankfurt; Ireland is the nearest).
4. Resend now shows three records that must be added to Cloudflare
   DNS: an SPF `TXT`, a DKIM `TXT`, and a DMARC `TXT`. Keep this tab
   open — you'll come back to click **Verify**.

### 2. Add the records in Cloudflare DNS

In the `harpapro.com` zone:

| Type  | Name                       | Value                            | Notes |
| ----- | -------------------------- | -------------------------------- | ----- |
| `TXT` | `send` (or `resend._domainkey`) | (DKIM key from Resend, long string) | Proxy: **DNS only** (gray cloud). |
| `MX`  | `send`                     | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | Resend uses AWS SES under the hood. |
| `TXT` | `send`                     | `v=spf1 include:amazonses.com ~all` | SPF for the bounce subdomain. |
| `TXT` | `_dmarc`                   | `v=DMARC1; p=none; rua=mailto:dmarc@harpapro.com` | Start in `p=none` for two weeks, then move to `p=quarantine`. |

The exact names and values shown by Resend take precedence — copy
them verbatim. The table above is illustrative.

**Important:** the DKIM and SPF records must be served with the
**DNS-only** flag (gray cloud) in Cloudflare. The orange-cloud proxy
breaks email auth.

### 3. Verify

Back in the Resend tab, click **Verify**. Records typically
propagate within 1–5 minutes; Cloudflare is fast. If it fails:

- Run `dig +short TXT send._domainkey.harpapro.com @1.1.1.1` to see
  what's actually resolved.
- Confirm the cloud icon is gray, not orange, for every record
  Resend asked for.

### 4. Set the Fly API secret

Resend issues an API key in **Settings → API Keys**. Create one
scoped to **Sending access** only (not full access). Then:

```bash
fly secrets set RESEND_API_KEY=re_xxxxxxxxxxxx --app harpa-pro-api
fly secrets set RESEND_LIVE=1 --app harpa-pro-api
```

Until `RESEND_LIVE=1` is set, the API is in fake mode and no real
emails go out (see `packages/api/src/lib/resend.ts`).

Also set the from-address if you want something other than the
default (`Harpa Pro <hello@harpapro.com>`):

```bash
fly secrets set WAITLIST_FROM_EMAIL="Harpa Pro <waitlist@harpapro.com>" --app harpa-pro-api
```

### 5. Deliverability smoke test

Send a real waitlist signup from <https://harpapro.com>. Confirm the
email arrives at all four reference inboxes:

- Gmail (free, deliverability is the hardest gate).
- Outlook.com / Office 365.
- ProtonMail.
- iCloud.

For each: confirm it landed in the **Inbox**, not Spam / Promotions
/ Junk. Open the original message and check:

- `SPF: pass`
- `DKIM: pass`
- `DMARC: pass`

If any inbox lands in spam, do not flip the launch on. The most
common causes are:

- DNS records still propagating (wait an hour).
- DMARC policy too aggressive too early — start at `p=none`.
- The Cloudflare orange-cloud proxy on the DKIM record.
- A typo in the DKIM key (it's long; easy to truncate on paste).

### 6. Tightening DMARC post-launch

After two weeks of clean delivery (no DMARC failures in the daily
aggregate reports), step the DMARC policy up:

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@harpapro.com; pct=100
```

After another two weeks: `p=reject`. This blocks any spoofed mail
claiming to be from `harpapro.com` and is the standard hardening
path.

## Rollback

If a deliverability regression shows up, set `RESEND_LIVE=0` on the
API to drop back to fake mode. The API still records `confirm_token_hash`
rows; once email is fixed, you can re-trigger the confirm emails
manually (no admin UI for this yet — open an ad-hoc SQL job to
re-mint tokens and resend).

## Related

- [`packages/api/src/lib/resend.ts`](../../packages/api/src/lib/resend.ts)
  — fake-mode and live-mode client.
- [`packages/api/src/emails/waitlist-confirmation.ts`](../../packages/api/src/emails/waitlist-confirmation.ts)
  — the rendered HTML + plain-text body.
- [`docs/marketing/plan-m1-waitlist.md`](./plan-m1-waitlist.md) §M1.9.
