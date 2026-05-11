# Verify OTP

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a 6-digit OTP verification screen. Centered ShieldCheck icon (28px in primary), title "Enter verification code", subtitle "We sent a 6-digit code to {phone}", a code input field (placeholder "000000", 6 digits only), optional error text, and a full-width "Verify Code" button. Below: optional "Resend" button becomes active after 60s countdown. Use warm-paper palette. Output iOS sizing, single screen frame.

**Route:** `/(auth)/verify`
**Reference screenshot:** (none)
**v3 source file(s):** apps/mobile-v3/app/(auth)/verify.tsx

## Purpose
Validate 6-digit OTP sent to phone number. Redirects to onboarding (if no profile) or projects (if profile exists).

## Layout (top → bottom)
1. **Header** — ShieldCheck icon (28px, primary color), "Enter verification code" title, subtitle "We sent a 6-digit code to {phone}"
2. **Code input** — Placeholder "000000", testID="input-otp", maxLength={6}, keyboardType="number-pad", accepts digits only
3. **Error message** — Red error text if code invalid, "Invalid code. Please try again."
4. **Verify button** — Full-width, primary variant, testID="btn-login-verify-code", disabled while loading or code length < 6
5. **Resend section** — "Resend code" button, disabled for 60s countdown, shows "Resend in {N}s" during cooldown, testID=(?)

## Components
| Component | Type | Props / state |
|---|---|---|
| ShieldCheck icon | lucide-react-native | size={28}, color={theme.colors.primary} |
| TextInput | TextInput (RN) | testID="input-otp", maxLength={6}, keyboardType="number-pad", textContentType="oneTimeCode", value strips non-digits |
| Button (Verify) | Pressable + Text | testID="btn-login-verify-code", disabled={code.length < 6 \|\| loading} |
| Button (Resend) | Pressable + Text | disabled={resendTimer > 0}, shows timer during cooldown |

## Interactions
- Tap code input → Focus, autofocus on mount, accept 0-9 only
- Type digit → Strips non-digits, truncates to 6 chars, clears error on keystroke
- Code reaches 6 digits → Auto-submit via `verifyOtp(phone, code)`
- On success → Check if user has fullName; if yes → navigate to projects; if no → navigate to onboarding
- On error → Show error message, keep code input editable
- Resend timer expired (>60s) → "Resend code" button becomes enabled
- Tap Resend → Call `signInWithOtp(phone)` again, reset timer to 60s

## Data shown
- phone — from route params
- code — numeric string, max 6 digits
- error — validation or API error message
- resendTimer — countdown in seconds (60 to 0)
- loading — during OTP verification request

## Visual tokens
- Background: `theme.colors.background`
- Icon: `theme.colors.primary`
- Input border: `theme.colors.input`, placeholder: `theme.colors.mutedForeground`
- Error text: `theme.colors.destructive`
- Button: `theme.colors.primary` bg, `theme.colors.primaryForeground` text

## Acceptance checklist
- [ ] testID="input-otp", "btn-login-verify-code" render
- [ ] Input accepts only digits, max length 6
- [ ] Auto-submits when code reaches 6 digits
- [ ] Resend countdown ticks down, button re-enables at 0
- [ ] Error message shows on invalid code
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
