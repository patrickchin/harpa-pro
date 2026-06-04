// assert-dev-otp-hardening.js — assert the dev OTP introspection route's
// defense-in-depth contract after the app has issued an OTP for EMAIL.
//
// Inputs (Maestro env globals, passed via `runScript.env`):
//   EMAIL              — allowlisted email that just received a sign-in OTP.
//   DEV_OTP_TOKEN      — shared secret for x-dev-otp-token (>=32 chars).
//   API_BASE_URL       — optional, defaults to http://127.0.0.1:8787.
//
// Outputs:
//   output.OTP         — the 6-digit code for the valid EMAIL.

const baseUrl =
  typeof API_BASE_URL !== 'undefined' && API_BASE_URL
    ? API_BASE_URL
    : 'http://127.0.0.1:8787';

if (typeof EMAIL === 'undefined' || !EMAIL) {
  throw new Error('assert-dev-otp-hardening: EMAIL is not set.');
}

if (typeof DEV_OTP_TOKEN === 'undefined' || !DEV_OTP_TOKEN) {
  throw new Error(
    'assert-dev-otp-hardening: DEV_OTP_TOKEN is not set. Export it in ' +
      'your shell (>=32 chars; must match the API DEV_OTP_TOKEN).',
  );
}

function postLastOtp(email, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (typeof token !== 'undefined') headers['x-dev-otp-token'] = token;
  return http.post(baseUrl + '/api/dev/last-otp', {
    headers,
    body: JSON.stringify({ email }),
  });
}

function assertStatus(label, res, status) {
  if (res.status !== status) {
    throw new Error(
      label + ': expected HTTP ' + status + ', got ' + res.status + ' — ' + res.body,
    );
  }
}

const email = String(EMAIL).trim().toLowerCase();
const valid = postLastOtp(email, DEV_OTP_TOKEN);
assertStatus('valid token + allowlisted email', valid, 200);

const body = json(valid.body);
if (!body || !/^\d{6}$/.test(String(body.otp ?? ''))) {
  throw new Error('valid response missing 6-digit otp — ' + valid.body);
}
if (body.identifier !== 'sign-in-otp-' + email) {
  throw new Error(
    'valid response used unexpected identifier ' + body.identifier +
      ' for ' + email,
  );
}

const wrongToken =
  DEV_OTP_TOKEN.slice(0, -1) + (DEV_OTP_TOKEN.endsWith('A') ? 'B' : 'A');

assertStatus('missing x-dev-otp-token', postLastOtp(email), 404);
assertStatus('bad x-dev-otp-token', postLastOtp(email, wrongToken), 404);
assertStatus(
  'outside allowlist domain',
  postLastOtp('attacker@evil.com', DEV_OTP_TOKEN),
  404,
);
assertStatus(
  'suffix attack domain',
  postLastOtp('bad@e2e.harpapro.com.evil.com', DEV_OTP_TOKEN),
  404,
);
assertStatus(
  'wildcard injection email',
  postLastOtp('%@e2e.harpapro.com', DEV_OTP_TOKEN),
  404,
);

output.OTP = body.otp;
