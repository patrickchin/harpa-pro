// last-otp.js — read the most recent better-auth email OTP from the
// dev API. Used by sign-in.yaml after `btn-login-send-code` to bridge
// "what code did the server actually issue" into Maestro without
// touching real email.
//
// Inputs (Maestro env globals, passed via `runFlow.env`):
//   EMAIL              — the email the OTP was issued to
//                        (must end in @e2e.harpapro.com — the API
//                        rejects all other domains with 404)
//   DEV_OTP_TOKEN      — shared secret (≥32 chars). The API constant-
//                        time compares this against the
//                        `x-dev-otp-token` header. Required — without
//                        it the route is not mounted on the API and
//                        every call returns 404.
//   API_BASE_URL       — optional, defaults to http://127.0.0.1:8787
//
// Outputs:
//   output.OTP         — the 6-digit code

const baseUrl =
  typeof API_BASE_URL !== 'undefined' && API_BASE_URL
    ? API_BASE_URL
    : 'http://127.0.0.1:8787';

if (typeof DEV_OTP_TOKEN === 'undefined' || !DEV_OTP_TOKEN) {
  throw new Error(
    'last-otp: DEV_OTP_TOKEN is not set. Export it in your shell ' +
      "(>=32 chars; must match the API's DEV_OTP_TOKEN) and pass it " +
      'through to Maestro — see .maestro/helpers/sign-in.yaml and ' +
      'scripts/maestro/reset-db.sh.',
  );
}

const res = http.post(baseUrl + '/api/dev/last-otp', {
  headers: {
    'Content-Type': 'application/json',
    'x-dev-otp-token': DEV_OTP_TOKEN,
  },
  body: JSON.stringify({ email: EMAIL }),
});

if (!res.ok) {
  throw new Error(
    'last-otp: HTTP ' + res.status + ' for ' + EMAIL + ' — ' + res.body +
      ' (404 typically means: DEV_OTP_TOKEN mismatch, EMAIL outside ' +
      '@e2e.harpapro.com, or no OTP issued for that email yet)',
  );
}

const body = json(res.body);
if (!body || !body.otp) {
  throw new Error('last-otp: response missing otp field — ' + res.body);
}

output.OTP = body.otp;

