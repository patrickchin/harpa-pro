# Account Details (Sub-screen)

> **Prompt for design tool:** The Account Details screen is a sub-screen reached from the Profile tab. It displays an avatar (initials) at the top, then two editable text fields: Full Name and Company Name. Phone number is displayed read-only in a muted card (cannot be changed here — requires OTP re-verification via Settings flow, not yet implemented). A "Save" button appears at the bottom, enabled only when the form is dirty (either field has been edited). On success, the screen confirms the save and clears dirty state. An info card explains that phone can only be changed through a separate flow.

**Route:** `app/(app)/profile/account.tsx`
**Reference screenshot:** (none)
**v3 source:** apps/mobile-v3/app/(app)/profile/account.tsx
**Mobile-old source:** (not in dump; new v3 feature)

## Purpose

Allow the user to edit their profile name and company. Phone number is read-only. This is a simple form with validation and auto-save feedback.

## Layout (top → bottom)

1. **ScreenHeader** — "Account Details" title, back button.

2. **Avatar section** (centered, `mt-4 mb-6`):
   - Avatar circle (80×80, bg-primary, initials text-xl font-bold text-primary-foreground, rounded-lg).
   - No upload button yet (TODO: future feature).

3. **Info card** (variant="muted" padding="md", `mx-5 mb-4`):
   - Text (text-sm): "Phone number and profile details can be updated here."

4. **Form fields** (`px-5 gap-4`):
   - **Full Name input** (testID="input-account-fullname"):
     - Label: "Full Name" (text-sm font-semibold text-foreground).
     - Input: TextInput placeholder "Enter full name", value={displayName}, onChangeText={setFullName}.
     - Controlled: when user edits, local state fullName is set (non-null). displayName falls back to profile.fullName if fullName is null.
   - **Company Name input** (testID="input-account-company"):
     - Label: "Company Name" (text-sm font-semibold text-foreground).
     - Input: TextInput placeholder "Enter company name", value={displayCompany}, onChangeText={setCompanyName}.
     - Controlled: when user edits, local state companyName is set (non-null).
   - **Phone field** (read-only):
     - Label: "Phone" (text-sm font-semibold text-foreground).
     - Display-only text box or card with phone number (text-base text-muted-foreground), gray background, no interaction.

5. **Save button** (`mx-5 mt-6`):
   - Primary variant, full-width.
   - Enabled only if `hasChanges` is true (either fullName or companyName differs from profile data).
   - Label: "Save" (or "Saving…" while updateProfile.isPending).
   - On press: POST /profile with { full_name?, company_name? } body. On success, set fullName/companyName back to null (form becomes pristine). On error, show error banner.

6. **Error banner** (if updateProfile.error):
   - InlineNotice tone="danger" with error message.

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `AccountScreen` | Screen | Reads `profile: UserProfile` from auth + API. Manages local fullName, companyName state. |
| `Input` | TextInput | Value, placeholder, onChangeText, testID. |
| `Button` | Primary | Enabled={hasChanges}, onPress={handleSave}, loading={isLoading}. |

## Interactions

- **Edit Full Name**: Tap input, type new name. Local state fullName updates. hasChanges becomes true → Save button enables.
- **Edit Company Name**: Tap input, type new company. Local state companyName updates. hasChanges becomes true.
- **Clear edited field**: Tap input, delete text. If original field had a value, hasChanges becomes false (form matches profile).
- **Tap Save**: POST /profile with only the edited fields. Show loading spinner. On success, clear local state (pristine form). On error, show error banner.

## Data shown

- **Avatar initials**: Derived from displayName (first letter of first and last name).
- **Full Name**: Editable field, pre-filled with profile.fullName or user's current input.
- **Company Name**: Editable field, pre-filled with profile.companyName.
- **Phone**: Read-only, from authProfile.phone (immutable for P1).

## Visual tokens

Use Unistyles tokens only:
- Avatar: `theme.colors.primary` background, `theme.colors.primaryForeground` text.
- Input background: `theme.colors.card`.
- Input text: `theme.colors.foreground`.
- Input border: `theme.colors.border`.
- Label: `theme.colors.foreground` (text-sm font-semibold).
- Phone read-only field: `theme.colors.surfaceMuted` background, `theme.colors.mutedForeground` text.
- Button: primary variant.
- Info card: muted variant.
- Spacing: `mx-5 px-5` (outer padding), `gap-4` (form fields), `mt-4 mb-6` (avatar).
- Radii: `theme.radii.lg` (avatar), `theme.radii.md` (inputs).

## Acceptance checklist

- [ ] ScreenHeader shows "Account Details" title + back button.
- [ ] Avatar displays initials (80×80, primary bg).
- [ ] Info card explains phone cannot be changed here.
- [ ] Full Name input is editable, pre-filled with profile.fullName.
- [ ] Company Name input is editable, pre-filled with profile.companyName.
- [ ] Phone field is read-only display.
- [ ] Save button enabled only when form is dirty.
- [ ] Save button shows "Saving…" while request is pending.
- [ ] On success: clear local state, show success feedback, re-fetch profile.
- [ ] On error: show error banner (InlineNotice danger).
- [ ] testID present: `input-account-fullname`, `input-account-company`.
- [ ] (?) Loading skeleton shown while profile data is fetching.
- [ ] (?) Validation: check that full name is not empty before enabling Save.
