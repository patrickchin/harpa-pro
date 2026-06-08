# Mobile text & label style guide

## Purpose & scope

Anchor doc for every user-facing string in the Harpa Pro mobile app:
screen titles, headers, button labels, field labels, placeholders,
helper text, empty states, error messages, toasts, dialog copy, and
accessibility labels. The companion `audit-findings.md` doc cites
sections here by anchor.

Out of scope:

- Backend / API error text. The app must catch raw API strings and
  surface a mobile-authored message — fixes belong in the mobile
  layer, not the API.
- Internationalisation. The app is English-only today.
- Test code (`*.test.tsx`, Maestro flows). Test text is never user
  facing.
- Console / dev logs.

The guide is opinionated: terse, sentence case, action-oriented.
Think Linear, Vercel, Raycast — not Mailchimp or Slack. When in
doubt, cut a word.

## Voice & tone

- **Terse.** Fewest words that carry the meaning. Cut articles
  ("a", "the") in labels and buttons. Cut hedges ("just", "simply",
  "actually").
- **Action-oriented.** Buttons start with a verb. Errors end with
  what the user can do.
- **Direct.** Say what happened, then what to do. No apologies, no
  small talk.
- **Sentence case** everywhere except proper nouns and product
  names — see [Sentence case vs title case](#sentence-case-vs-title-case).
- **Second person** when addressing the user ("your account"), not
  third ("the user's account"). Avoid "we" — the app is not a
  person.
- **Present tense.** "Saving" not "Will save". Past tense is
  reserved for completion toasts ("Report saved").

✅ "Saving…" • "Email is required" • "Report saved"
❌ "We are currently saving your work, please wait" • "Please
provide your email address" • "Successfully saved the report!"

## Reserved/forbidden words & punctuation

Grep these out. If you find one shipping, it's a finding.

| Forbidden | Why | Use instead |
| --- | --- | --- |
| `Oops`, `Whoops` | Cute, evasive, hides what failed | Name the failure |
| `Sorry` | Apologising for normal app behaviour is noise | Just say what happened |
| `Please` | Begging the user is condescending and lengthens copy | Drop it |
| `!` in error/info copy | Errors are not exclamations | End with `.` |
| Emoji in errors, dialogs, alerts | Tonally wrong for failure paths | Drop |
| `Failed to <verb>` with no object/cause | "Failed to load." tells the user nothing | "Couldn't load reports. Check your connection." |
| `Something went wrong` | Same problem as "Oops" | Name the failure |
| `Successfully <verbed>` | "Successfully" adds nothing | "Report saved" |
| Title Case in buttons / titles | Inconsistent with the rest of the app | Sentence case |
| Trailing `:` on screen titles | Looks like an unfinished sentence | Drop |
| Trailing `.` on button labels | Buttons aren't sentences | Drop |
| `Loading…` if a skeleton is showing | Redundant | Silence |
| `Click` | This is touch | "Tap" if a verb is needed at all |

## Sentence case vs title case

- **Sentence case everywhere.** First word capitalised, the rest
  lowercase, including buttons, screen titles, section headers,
  menu items, dialog titles, tab labels.
- **Proper nouns and product names keep their canonical case:**
  Harpa Pro, Apple, Google, iOS, Android, PDF, OTP, Sign in with
  Apple, Continue with Google.
- **Acronyms stay uppercase:** PDF, OTP, URL, AI, JSON.

✅ "Delete draft" • "Sign in with Apple" • "Export PDF" • "Project home"
❌ "Delete Draft" • "Sign In With Apple" • "Export Pdf" • "Project Home"

## Screen titles & headers

- Sentence case.
- No trailing colon, no trailing period.
- Two to four words max. If the title needs more, cut it.
- The screen title and the back-stack label match. If the back
  arrow is labelled "Reports" the screen it returns to must be
  titled "Reports".
- A nested object screen takes the object's name as the title
  ("Riverside Apartments", not "Project").

✅ "Reports" • "New project" • "Account" • "Riverside Apartments"
❌ "Reports:" • "Create a new project" • "Your account settings" •
"Project Details"

## Button labels

- **Verb-first**, max 3 words. The verb names the action that
  happens on tap.
- Sentence case. No trailing punctuation.
- Loading states append a single-character ellipsis (`…`, U+2026)
  to the present-progressive form: "Save" → "Saving…". Never
  three dots.
- Destructive actions name the object: "Delete report", not just
  "Delete", unless the dialog title already names it AND the button
  sits inside that dialog.
- Primary CTAs in dialogs / sheets sit on the right (or on top in
  stacked layouts). Cancel is `quiet` variant and reads "Cancel"
  not "Close" or "Never mind".
- Disabled state is still readable — never grey out the label
  text into illegibility.

✅ "Save changes" • "Send code" • "Saving…" • "Delete report" •
"Sign in"
❌ "Save Changes" • "Send Code." • "Saving..." • "Delete!" •
"Click here to sign in"

## Form labels, placeholders & helper text

- **Label** is the field name in sentence case. No trailing `:` or
  `*`. Required-field marker is a subtle asterisk after the label
  when used at all; preferred pattern is to validate on submit and
  surface inline errors rather than mark requirements upfront.
- **Placeholder** is an *example* of valid input, not a restatement
  of the label. Empty when no useful example exists. Never put the
  label inside the placeholder ("Email" inside the email field).
- **Helper text** appears only when validation rules are non-obvious
  ("Must be at least 8 characters" — but only if 8 isn't the
  default the user would assume). One line. Sentence case. Ends
  with a period.
- **Inline error** replaces helper text on the same line when
  validation fails. Pattern: `<what is wrong>.` Optionally followed
  by `<what to do>.`

✅ Label "Email", placeholder `you@example.com`, error "Enter a
valid email."
✅ Label "Project name", placeholder "Riverside Apartments"
❌ Label "Email:", placeholder "Enter your email address",
error "Please enter a valid email address!"

## Empty states

- **Headline** (1 line) — names what's missing in user terms.
- **Subtext** (1 line, optional) — explains what to do next, only
  if the headline alone isn't actionable.
- **CTA** (optional) — a button when there's a single obvious
  action the user can take from here.
- **Omit the empty state entirely** when the screen has its own
  primary CTA elsewhere (e.g. a `+` in the header) and the
  emptiness is self-evident.

✅ "No reports yet" + "Tap + to create one" + `Create report`
✅ "No members" + `Invite member` (no subtext needed)
❌ "Oh no, you don't have any reports yet! Click the button below
to get started on your very first one." • "No data."

## Error messages

Pattern: `<what happened in one clause>. <what the user can do>.`

- Never surface raw API error text. Catch in the mobile layer and
  map.
- Never use `Alert.alert` for in-app dialogs (hard rule, see
  `AGENTS.md` rule 4 and `scripts/check-no-alert-alert.sh`). Use
  `AppDialogSheet` or inline error UI.
- Distinguish three surfaces:
  - **Inline field error** — under the field, replaces helper
    text. One sentence. ("Enter a valid email.")
  - **Page-level error** — inline notice at the top of the screen
    or in the empty state. Two sentences max. ("Couldn't load
    reports. Pull to refresh.")
  - **Toast error** — for failures during a user action. One
    sentence. Names the action that failed. ("Couldn't save
    note.")
- If a retry is possible, the action half of the message is the
  retry verb ("Try again", "Pull to refresh", "Check your
  connection"). If retry happens automatically, omit the action
  half.
- If the cause is on the user's side (offline, permission denied),
  say so plainly. If the cause is on the server's side, don't
  pretend it's the user ("Our servers are having trouble" is
  fine — terse and honest).

✅ "Couldn't save changes. Try again."
✅ "You're offline. Reconnect to load reports."
✅ "Photos access is off. Open Settings to allow."
❌ "Failed to save profile." • "An error occurred." • "Oops!
Something went wrong, please try again."

## Toasts & inline feedback

- **Success toast** — past-tense verb + object. No exclamation,
  no period. ("Report saved", "Address copied", "Code resent")
- **Error toast** — see [Error messages](#error-messages).
- **Duration** — success: 2 seconds. Error: 4 seconds or until
  dismissed. Long errors that need reading should go to inline
  UI, not toasts.
- **Dismissibility** — toasts auto-dismiss. Errors users need to
  act on belong in dialogs or inline notices.
- **One toast at a time.** New toasts replace old ones.

✅ "Report saved" • "Address copied" • "Couldn't copy address"
❌ "Successfully saved the report!" • "Done." • "Saved 🎉"

## Dialog & sheet copy

For any mount of `AppDialogSheet` (and its callers via
`lib/dialogs/app-dialog-copy.ts`):

- **Title** — sentence case verb phrase or noun phrase, not a
  sentence. Names the action or object. 2–4 words.
- **Message** — `<what will happen>. <permanence/consequence>.`
  Two sentences max. Plain language.
- **Confirm button** — verb + object for destructive actions
  ("Delete report"). Just the verb is fine if the title already
  names the object ("Delete" inside a "Delete report" dialog).
- **Cancel button** — always "Cancel", `quiet` variant.
- **`noticeTitle`** — short two-word label on the inline notice
  ("Permanent action", "Heads up", "Can't undo"). Sentence case.
- For non-confirmation dialogs (informational, permission-blocked,
  upgrade prompts) the primary action labels the resolution:
  "Open Settings", "Upgrade plan", "Got it".
- Permission-blocked dialogs offer a path forward, not just "OK".

✅ Title "Delete report", message "This report will be permanently
deleted. This cannot be undone.", confirm "Delete"
✅ Title "Photos access is off", message "Allow camera roll access
in Settings to save captured photos.", actions "Open Settings" +
"Cancel"
❌ Title "Delete Draft" • title "Are you sure you want to delete
this report?" • single-action "OK" on a permission-blocked dialog

## Accessibility labels

- **Every icon-only `Pressable`, `TouchableOpacity`, or `Button`
  must have an `accessibilityLabel`.** No exceptions.
- Pattern: `<verb> <object>` in sentence case. ("Open menu",
  "Close dialog", "Delete photo")
- Do not duplicate a visible text label in `accessibilityLabel` —
  the platform reads the visible text. Only set it when there's no
  visible text or the visible text is an icon/glyph.
- Use `accessibilityHint` for non-obvious consequences only ("Opens
  the camera"). Skip it for normal navigation buttons.
- For toggleable controls use `accessibilityState={{selected,
  disabled, busy}}` — don't bake state into the label
  ("Selected: Photos" is wrong; the label is "Photos", state is
  separate).
- Form fields take labels from their visible `<Text>` label via
  `accessibilityLabel` only if the visible label isn't programmatically
  associated.

✅ Icon-only back button: `accessibilityLabel="Go back"`
✅ Toggle row: label `accessibilityLabel="Save to camera roll"`,
state via `accessibilityState`
❌ Icon button with no label • `accessibilityLabel="Button"` •
`accessibilityLabel="Save (currently disabled)"`

## Loading & skeleton states

- When a skeleton is visible, do **not** also show "Loading…" text.
  The skeleton is the loading state.
- For inline pending UI (button submitting, query refetching),
  prefer a present-progressive verb on the button itself ("Saving…")
  over a separate spinner + label.
- Pull-to-refresh has no label.
- For long operations (uploads, export) show progress when known
  ("Uploaded 3 of 12"), an indeterminate spinner with a one-word
  label otherwise ("Uploading…").
- Idle states are silent. Never write "Nothing to show" if the
  user just arrived and the data hasn't loaded — that's loading,
  not empty.

✅ "Saving…" on the submit button while pending
✅ "Uploaded 3 of 12" during a multi-file upload
❌ Skeleton list + "Loading…" header • "Please wait…" • "Loading
your reports, this may take a moment"

## Numbers, dates & units

- **Counts** — numerals always, no spell-out. Lowercase noun in
  agreement with the number. ("0 reports", "1 report", "2 reports")
  Avoid singular/plural ternaries that ship as a string by
  pluralising correctly at the call site.
- **Dates** — relative within the last 7 days ("2m ago", "1h ago",
  "Yesterday"). Calendar dates beyond that ("Jun 8" — abbreviated
  month, no leading zero on day, no comma before a 4-digit year).
  Years only when the date is not in the current year.
- **Times** — 24-hour or 12-hour follows the device locale.
  Never both in the same surface.
- **Units** — lowercase ("kb", "mb", "gb" are fine in cramped UI;
  "KB", "MB", "GB" are correct in formal contexts. Pick one per
  surface). No space between number and unit short form.
- **Currency** — symbol prefix with no space, ISO code suffix when
  ambiguous ("$12" vs "$12 USD" if the audience is multi-region).

✅ "2 photos" • "Yesterday" • "Jun 8" • "12mb"
❌ "Two photos" • "1 day ago" • "06/08/2026" • "12 MB"

## How to cite this guide

Every recommendation row and gap bullet in `audit-findings.md`
must end with a markdown link to the relevant section here.
Anchors are auto-generated from headings:

- `[Voice & tone](./style-guide.md#voice--tone)`
- `[Reserved/forbidden words & punctuation](./style-guide.md#reservedforbidden-words--punctuation)`
- `[Sentence case vs title case](./style-guide.md#sentence-case-vs-title-case)`
- `[Screen titles & headers](./style-guide.md#screen-titles--headers)`
- `[Button labels](./style-guide.md#button-labels)`
- `[Form labels, placeholders & helper text](./style-guide.md#form-labels-placeholders--helper-text)`
- `[Empty states](./style-guide.md#empty-states)`
- `[Error messages](./style-guide.md#error-messages)`
- `[Toasts & inline feedback](./style-guide.md#toasts--inline-feedback)`
- `[Dialog & sheet copy](./style-guide.md#dialog--sheet-copy)`
- `[Accessibility labels](./style-guide.md#accessibility-labels)`
- `[Loading & skeleton states](./style-guide.md#loading--skeleton-states)`
- `[Numbers, dates & units](./style-guide.md#numbers-dates--units)`

If a recommendation needs to cite more than one section, link both —
don't pick one arbitrarily.
