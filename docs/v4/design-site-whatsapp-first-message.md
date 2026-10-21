# Guided first WhatsApp message

## Purpose

Help a procurement visitor start a useful conversation without having to
write a project brief from scratch. The homepage procurement questions are
the source for the enquiry topics and suggested opening messages.

## Interaction

Keep the WhatsApp and email cards compact and side by side on wider screens.
The WhatsApp card offers two separate actions: **Message on WhatsApp** opens
WhatsApp directly with no prefilled text; **Help me write a message** opens
the native helper dialog. Each FAQ answer can open the same dialog with its
topic selected. Use one short **Ask us** link under each answer.

Use a white dialog, charcoal text, and a green WhatsApp action. Keep the
existing page palette. Use the topic selector followed by three optional
prompts: products and rough quantity in one field, a multi-select material
picker, and delivery city/country. Materials are wood, stone/marble, metal,
glass, and fabric/leather. Use native labelled checkboxes and inputs.

This takes inspiration from YoumanChina's focused product/quantity questions
and service-specific pickers on its
[supplier request](https://youmanchina.com/services/find-suppliers) and
[inspection request](https://youmanchina.com/services/inspect-goods) pages.
Keep this first conversation shorter: no account, upload, budget, or full
quotation form. Visitors can skip any detail they do not know yet.

Build the WhatsApp message from the topic and only the details supplied.
Avoid a separate editable message field or expanded preview. Preserve all
answers when changing topics or closing and reopening the helper. Escape,
the close button, and backdrop clicks close it and restore focus.

**Continue in WhatsApp** opens the published number `+86 193 7283 7269` with
the message encoded in the `text` query parameter. A short note says
**Review and send in WhatsApp.** Closing the dialog or pressing Escape returns
focus to its trigger. Keep the dialog within the viewport on mobile.

This is a static browser enhancement, with no API or persistence. Without
JavaScript, retain the direct WhatsApp link, hide the helper button, and keep
the dialog closed.
Keep the email actions and the existing contact conversion event. Exclude
the entire composer from autocapture; typed details and the message URL must
not enter analytics. Use existing site tokens and responsive contact styles.

## Validation

Run site unit tests, lint, Astro check, and production build. Browser tests
cover the independent direct WhatsApp link, topic selection from the card and
FAQ, optional answers, multiple materials, topic changes, URL encoding and
the complete phone number, Escape and focus return,
mobile overflow, compact page height, and the direct-link fallback without
JavaScript. The real-SDK analytics test verifies that composed details remain
private and opening the helper does not count as an outbound contact click.

This refines the direct-link behaviour in
[public site product navigation](design-public-site-product-navigation.md).
