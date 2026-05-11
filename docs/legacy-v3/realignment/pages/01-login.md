# Login

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a phone-number-based OTP login screen. The screen has a centered icon (HardHat 24px in primaryForeground), title "Harpa Pro", description text, a labeled Phone Number input, optional error/info notices, a full-width "Send Code" button (hero variant, xl size), and a footer link to sign up. Use warm-paper palette (#f8f6f1 background, #2d3a5a foreground). Output iOS sizing, single screen frame.

**Route:** `/(auth)/login`
**Reference screenshot:** ../../../apps/docs/public/screenshots/01-login.png
**v3 source file(s):** apps/mobile-v3/app/(auth)/login.tsx

## Purpose
Collect user's phone number and send OTP code via SMS. Entry point into authenticated app; no social or biometric login.

## Layout (top → bottom)
1. **Logo row** — HardHat icon (24px) in a box, "Harpa Pro" title alongside
2. **Form section** — Label "Phone Number", input placeholder "+15550000000", `testID="input-phone"`
3. **Error/Info notice** — `InlineNotice` with `tone="danger"` or `tone="info"`, visible on error/success
4. **Send Code button** — Full-width, hero variant, xl size, `testID="btn-login-send-code"`, disabled while submitting
5. **Footer link** — "Don't have an account? Sign up", `testID="link-signup"`, navigates to onboarding path

## Components
| Component | Type | Props / state |
|---|---|---|
| HardHat icon | lucide-react-native | size={24}, color={theme.colors.primaryForeground} |
| Input | Input (ui) | testID="input-phone", label, placeholder, keyboardType="phone-pad", disabled on submit |
| Button | Button (ui) | testID="btn-login-send-code", variant="hero", size="xl", disabled={isSubmitting}, loading={isSubmitting} |
| InlineNotice | InlineNotice (ui) | tone="danger"\|"info", shows error/info text only when set |

## Interactions
- Tap input → Focus keyboard, clear error if present
- Tap "Send Code" → Validate phone (normalizePhoneNumber), show error "Please enter a valid phone number (e.g. +15550000000)" if invalid
- On success → Info notice "We sent a text message with your code to {phone}", navigate to verify screen with phone param
- Network error → Error notice displays error message
- Tap "Sign up" → Navigate to onboarding (?)

## Data shown
- phone — from `phone` state (normalized on send)
- error — from `error` state (validation or API)
- info — from `info` state (success message)
- isSubmitting — from `isSubmitting` state (disable inputs during request)

## Visual tokens
- Background: `theme.colors.background`
- Text (title): `theme.colors.foreground`, size: body-lg, weight: bold
- Input border: `theme.colors.input`
- Button: `theme.colors.accent` (hero CTA only), `theme.colors.accentForeground`
- Muted text: `theme.colors.mutedForeground`

## Acceptance checklist
- [ ] Matches 01-login.png at section level
- [ ] Input testID="input-phone", button testID="btn-login-send-code", link testID="link-signup" render
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
