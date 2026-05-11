# Onboarding

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a profile-completion screen post-login. The screen has a centered UserCircle icon (28px in primary), "Complete your profile" title, subtitle, two labeled text inputs (Full name, Company name optional), optional error text, and a full-width "Get Started" button. All form fields below the icon. Use warm-paper palette. Output iOS sizing, single screen frame.

**Route:** `/(auth)/onboarding`
**Reference screenshot:** ../../../apps/docs/public/screenshots/02-onboarding.png
**v3 source file(s):** apps/mobile-v3/app/(auth)/onboarding.tsx

## Purpose
Capture user's full name (required) and company name (optional) after phone verification. Completes profile before accessing projects.

## Layout (top → bottom)
1. **Header** — UserCircle icon (28px, primary color), "Complete your profile" title, subtitle "Tell us a bit about yourself to get started"
2. **Form fields** — Label "Full name", input placeholder "Jane Smith", testID="input-onboarding-name"; Label "Company name (optional)", input placeholder "Acme Inc.", testID="input-onboarding-company"
3. **Error message** — Red error text if validation fails, "Please enter your name"
4. **Get Started button** — Full-width, primary variant, testID="btn-onboarding-submit", disabled while loading

## Components
| Component | Type | Props / state |
|---|---|---|
| UserCircle icon | lucide-react-native | size={28}, color={theme.colors.primary} |
| TextInput (name) | TextInput (RN) | testID="input-onboarding-name", autoFocus, autoCapitalize="words", editable={!loading} |
| TextInput (company) | TextInput (RN) | testID="input-onboarding-company", autoCapitalize="words", editable={!loading} |
| Button | Pressable + Text | testID="btn-onboarding-submit", shows "Get Started" or ActivityIndicator on loading |

## Interactions
- Tap Full name input → Focus, autofocus on mount
- Enter text → Clear error on keystroke
- Tap Get Started → Validate name is not empty; if empty, show error "Please enter your name"
- On success → Call `updateProfile()`, navigate to projects list
- On error → Show error message from API response

## Data shown
- fullName — required, trimmed before submit
- companyName — optional, trimmed before submit
- loading — from `loading` state (disable inputs during request)
- error — from `error` state (validation or API)

## Visual tokens
- Background: `theme.colors.background`
- Icon: `theme.colors.primary`
- Input border: `theme.colors.input`, placeholder: `theme.colors.mutedForeground`
- Error text: `theme.colors.destructive`
- Button: `theme.colors.primary` bg, `theme.colors.primaryForeground` text

## Acceptance checklist
- [ ] Matches 02-onboarding.png at section level
- [ ] testID="input-onboarding-name", "input-onboarding-company", "btn-onboarding-submit" render
- [ ] Validation error "Please enter your name" shows only when attempting submit with empty name
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
