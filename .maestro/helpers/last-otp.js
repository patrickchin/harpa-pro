// last-otp.js — read the most recent better-auth email OTP from the
// dev API. Used by sign-in.yaml after `btn-login-send-code` to bridge
// "what code did the server actually issue" into Maestro without
// touching real email.
//
// Inputs (Maestro env globals, passed via `runFlow.env`):
//   EMAIL              — the email the OTP was issued to
//   API_BASE_URL       — optional, defaults to http://127.0.0.1:8787
//
// Outputs:
//   output.OTP         — the 6-digit code

const baseUrl =
  typeof API_BASE_URL !== 'undefined' && API_BASE_URL
    ? API_BASE_URL
    : 'http://127.0.0.1:8787';

const res = http.post(baseUrl + '/api/dev/last-otp', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
});

if (!res.ok) {
  throw new Error(
    'last-otp: HTTP ' + res.status + ' for ' + EMAIL + ' — ' + res.body,
  );
}

const body = json(res.body);
if (!body || !body.otp) {
  throw new Error('last-otp: response missing otp field — ' + res.body);
}

output.OTP = body.otp;
