# Guided first WhatsApp message

## Purpose

Help a procurement visitor start a useful conversation without having to
write a project brief from scratch. The homepage procurement questions are
the source for the enquiry topics and suggested opening messages.

## Interaction

Keep the WhatsApp and email cards compact and side by side on wider screens.
The WhatsApp card contains only the number and **Message on WhatsApp** link.
Clicking it opens a native dialog with a topic chooser and one editable
message. Each FAQ answer can open the same dialog with its topic selected.
Use one short **Ask us** link under each answer.

Use short topic labels and opening messages. Avoid a separate preview and
introductory paragraphs. One brief hint suggests products, quantities,
delivery location, or timing. The visitor can continue with the suggested
message alone. Switching topics updates an untouched opening while preserving
appended details; a fully rewritten message remains unchanged.

**Continue in WhatsApp** opens the published number `+86 193 7283 7269` with
the message encoded in the `text` query parameter. A short note says
**Review and send in WhatsApp.** Closing the dialog or pressing Escape returns
focus to its trigger. Keep the dialog within the viewport on mobile.

This is a static browser enhancement, with no API or persistence. Without
JavaScript, retain the direct WhatsApp link and keep the dialog closed.
Keep the email actions and the existing contact conversion event. Exclude
the entire composer from autocapture; typed details and the message URL must
not enter analytics. Use existing site tokens and responsive contact styles.

## Validation

Run site unit tests, lint, Astro check, and production build. Browser tests
cover topic selection from both the card and FAQ, editable messages, topic
changes, URL encoding and the complete phone number, Escape and focus return,
mobile overflow, compact page height, and the direct-link fallback without
JavaScript. The real-SDK analytics test verifies that composed details remain
private and opening the helper does not count as an outbound contact click.

This refines the direct-link behaviour in
[public site product navigation](design-public-site-product-navigation.md).
