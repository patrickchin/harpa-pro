# Dashboard demo-account password sign-in

**Status:** implemented on 2026-08-04

**Applies to:** `apps/dashboard` authentication only

**Behavior source of truth:** the shipped mobile demo-account flow

## 1. Goal

Email plus a six-digit OTP remains the normal dashboard sign-in method. The
configured public demo accounts must also be able to sign in with their
server-managed password, matching mobile, so reviewers and product demos do
not depend on access to an email inbox.

## 2. User journeys

- As a normal user, I enter my email, receive a six-digit code, and complete
  the existing OTP flow without seeing demo-only controls.
- As a demo user, I enter the same normal email field and continue to a
  password screen without requesting an OTP.
- As a demo user, I can explicitly request an email code from the password
  screen when password access is unavailable.
- As a demo user, I can change the email and return to the first step without
  retaining the password I typed.
- As an operator, I never expose the configured demo password in dashboard
  source, browser environment variables, logs, or error messages.

## 3. Behavior contract

- The dashboard recognizes the same exact public addresses as mobile:
  `demo@harpapro.com`, `demo2@harpapro.com`, and `demo3@harpapro.com`.
- Non-production automation builds may add public, allowlisted test identities
  through `VITE_PASSWORD_ACCOUNT_EMAILS`. This changes only which emails reveal
  the password form; it never exposes a password or weakens the API allowlist.
- Email matching trims whitespace, lowercases the address, and requires an
  exact match. Similar or malformed addresses remain on the OTP path.
- A recognized demo email skips
  `POST /api/auth/email-otp/send-verification-otp` and advances directly to a
  password field.
- Password submission uses Better Auth's existing
  `POST /api/auth/sign-in/email` client method. The API remains authoritative:
  it rejects every password-login email outside its configured test/demo
  allowlist and keeps password sign-up disabled.
- Successful password sign-in refreshes the existing dashboard session exactly
  as successful OTP verification does.
- The password screen offers an explicit `Use email code instead` action. It
  requests an OTP only after the user selects it, then continues through the
  normal code-verification step. This keeps demo emails usable when optional
  server-side demo password configuration is absent.
- The dashboard does not add a visible demo/reviewer shortcut. This preserves
  the mobile interaction and keeps OTP visually primary for normal users.

## 4. UI and accessibility

- The email screen remains the single entry point.
- The password screen reuses the existing auth brand, page width, fields,
  buttons, errors, spacing, and Tailwind primitives.
- The password input uses `type="password"` and
  `autocomplete="current-password"`, receives initial focus, and is never
  persisted.
- The primary action reads `Sign in`; a quiet action requests an email code;
  and the secondary action returns to the email step and clears the password
  and error state.
- Authentication errors are announced through the existing `role="alert"`
  treatment and do not disclose whether an account exists.

## 5. Acceptance

- Normal email behavior and OTP tests remain unchanged and green.
- Unit tests prove exact demo-email matching, OTP bypass, password field
  semantics, Better Auth request shape, error handling, and session refresh.
- Playwright journeys prove a demo account can complete the password path
  without an OTP request and can deliberately fall back to the OTP path. The
  deployed-preview journey also submits this same form with an explicitly
  configured test identity against the real backend.
- Dashboard lint, typecheck, unit coverage, production build, and the existing
  cross-browser journey matrix pass.
- `apps/site` remains unchanged.
