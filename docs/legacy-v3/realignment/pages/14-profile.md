# Profile Tab

> **Prompt for design tool:** The Profile tab is a hub for account settings and app information. It displays the user's avatar (initials in a circle), full name, company name, phone number (read-only), and three action rows: AI Settings, Account, Usage. Each row has an icon, title, subtitle, and chevron-right. Below the rows is a Sign Out button (secondary, full-width, destructive variant or standard secondary). At the very bottom is build info (version, build number, environment).

**Route:** `app/(app)/profile/index.tsx`
**Reference screenshot:** ../../../apps/docs/public/screenshots/14-profile.png
**v3 source:** apps/mobile-v3/app/(app)/profile/index.tsx
**Mobile-old source:** (?) — legacy profile screen reference (not in dump)

## Purpose

Provide a centralized hub for user profile management, AI provider settings, account details, token usage tracking, and app info. Rows navigate to dedicated screens or modals for each setting domain.

## Layout (top → bottom)

1. **Avatar + name section** (centered, `mt-4 mb-6`):
   - Avatar: circle (80×80 bg-primary px-4 flex items-center justify-center rounded-lg), initials text (text-xl font-bold text-primary-foreground).
   - Full name: text-lg font-semibold text-foreground, centered.
   - Company name: text-sm text-muted-foreground, centered.

2. **Info card** (muted variant, `mx-5 mb-4`):
   - Phone number display: "Phone: {phone}" (text-sm text-muted-foreground).

3. **Action rows** (`px-5 gap-3`):
   - Each row: Card (variant="default" padding="md") with `flex-row items-center gap-3` inside.
     - Left: Icon (24px, color foreground) in a 40px square bg-secondary rounded-md.
     - Center (flex-1): Title (text-base font-semibold text-foreground) + subtitle (text-sm text-muted-foreground).
     - Right: ChevronRight icon (color muted-foreground).
   - **Row 1: AI Settings** — Cpu icon + "AI Settings" + "Model: {provider}/{model}" + chevron. On press, open AiProviderPicker modal.
   - **Row 2: Account** — User icon + "Account" + "Full name, company" + chevron. On press, navigate to `/profile/account`.
   - **Row 3: Usage** — (?) icon (BarChart3 or TrendingUp) + "Usage" + "Token usage" + chevron. On press, navigate to `/profile/usage`.

4. **Sign Out button** (`mx-5 my-6`):
   - Secondary variant, full-width, icon (LogOut 18px) + label "Sign Out" (text-base font-semibold text-foreground).
   - On press: confirmation dialog → POST /auth/logout → clear auth state → redirect to login.

5. **Build info footer** (`px-5 pb-4 text-center`):
   - Three lines of small text (text-xs text-muted-foreground):
     - "Version: {APP_VERSION}" (from Constants.expoConfig.version).
     - "Build: {BUILD_ID}" (from Constants.expoConfig.build.identifier or similar).
     - "Environment: {ENV}" (from EXPO_PUBLIC_ENV or process.env.NODE_ENV).

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `ProfileScreen` | Screen | `profile: UserProfile` from auth state. Reads fullName, companyName, phone, email. |
| `AvatarDisplay` | Component | initials (derived from fullName). |
| `SettingsRow` | Component | icon, title, subtitle, onPress. Renders as Card with icon + text + chevron. |
| `AiProviderPicker` | Modal | visible, onClose. Shows provider list + model picker. |

## Interactions

- **AI Settings row**: Open AiProviderPicker modal to select AI provider and model.
- **Account row**: Navigate to `/profile/account` screen for editable name/company + read-only phone.
- **Usage row**: Navigate to `/profile/usage` screen for token usage chart and history.
- **Sign Out button**: Show confirmation dialog ("Sign out?") → on confirm, POST /auth/logout, clear auth store, redirect to login.

## Data shown

- **Avatar initials**: Derived from fullName (first letter of first and last name, e.g., "John Doe" → "JD").
- **Name + company**: From auth profile or user account API response.
- **Phone**: Read-only display (from auth, cannot be edited here; phone is changed via OTP re-verification).
- **Current AI model**: "{provider} / {model}" from useAiSettings().
- **App version, build ID, environment**: From Expo Constants or .env.

## Visual tokens

Use Unistyles tokens only:
- Avatar background: `theme.colors.primary`.
- Avatar text: `theme.colors.primaryForeground`.
- Card background: `theme.colors.card`.
- Icon background (secondary): `theme.colors.secondary`.
- Text: `theme.colors.foreground` (primary) / `theme.colors.mutedForeground` (secondary).
- Sign Out button: secondary variant, potentially with destructive tone modifier (text color warning or destructive).
- Spacing: `mx-5` (outer padding), `gap-3` (row internals), `mt-4 mb-6` (avatar section).
- Radii: `theme.radii.lg` (avatar) / `theme.radii.md` (icon squares in rows).
- Icons: 24px in rows, 18px in Sign Out button.

## Acceptance checklist

- [ ] Avatar displays initials in a circle (80×80, primary background).
- [ ] Full name + company name displayed below avatar (centered).
- [ ] Phone number shown in info card (read-only).
- [ ] Three action rows: AI Settings, Account, Usage (each with icon + title + subtitle + chevron).
- [ ] AI Settings row shows current provider/model.
- [ ] AI Settings row opens AiProviderPicker modal.
- [ ] Account row navigates to /profile/account screen.
- [ ] Usage row navigates to /profile/usage screen.
- [ ] Sign Out button shows confirmation dialog on tap.
- [ ] On confirmation, logout request sent, auth state cleared, redirect to login.
- [ ] Build info footer shows version, build ID, environment (3 lines, centered, text-xs).
- [ ] All rows have proper spacing, icons, and chevrons.
- [ ] (?) Settings rows show loading skeleton while profile data is fetching.
