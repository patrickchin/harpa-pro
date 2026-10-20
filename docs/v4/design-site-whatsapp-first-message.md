# Guided first WhatsApp message

## Purpose

Help a procurement visitor start a useful conversation without having to
write a project brief from scratch. The homepage procurement questions are
the source for the enquiry topics and suggested opening messages.

## Interaction

At `/#contact`, the WhatsApp card offers a topic, optional project details,
and a preview of the message that will open in WhatsApp. Topics cover
understanding the service, sourcing products, checking quality, and
preparing a project brief. Each FAQ answer links to its matching topic.

Use a native select and a labelled textarea. Give topic-specific guidance
about useful details. Details are optional; a visitor who is still exploring
can continue with the suggested opening alone. Changing topics preserves
anything the visitor has already typed. Render details as plain text.

The existing **Message on WhatsApp** link opens the published number
`+86 193 7283 7269` with the preview encoded in the `text` query parameter.
Explain that the visitor can edit the message in WhatsApp and must press
Send there. Do not claim a message was sent on link click.

This is a static browser enhancement, with no API or persistence. Without
JavaScript, hide the interactive fields and retain the direct WhatsApp link.
Keep the email actions and the existing contact conversion event. Exclude
the entire composer from autocapture; typed details and the message URL must
not enter analytics. Use existing site tokens and responsive contact styles.

## Validation

Run site unit tests, lint, Astro check, and production build. Browser tests
cover topic selection from both the card and FAQ, optional details, topic
changes, URL encoding and the complete phone number, keyboard interaction,
mobile overflow, and the direct-link fallback without JavaScript. Extend
the real-SDK analytics test to verify that composed details remain private.

This refines the direct-link behaviour in
[public site product navigation](design-public-site-product-navigation.md).
