/**
 * Safe metadata-only diagnostics for email paths that do not deliver.
 *
 * These functions deliberately do not accept message bodies, URLs,
 * tokens, OTPs, or subjects. A recipient address is reduced to its
 * validated domain before any value is serialized.
 */

function recipientDomain(recipient: string): string {
  const separator = recipient.lastIndexOf('@');
  const domain = separator >= 0 ? recipient.slice(separator + 1).toLowerCase() : '';
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ? domain : 'invalid';
}

function writeDiagnostic(fields: Record<string, string | boolean>): void {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ level: 'info', ...fields }));
}

export function logEmailOtpPreview(input: { recipient: string; type: string }): void {
  writeDiagnostic({
    msg: 'email_otp_preview',
    transport: 'fake',
    recipientDomain: recipientDomain(input.recipient),
    type: input.type,
  });
}

export function logFakeResendSend(input: {
  recipient: string;
  messageId: string;
  hasHtml: boolean;
  hasText: boolean;
}): void {
  writeDiagnostic({
    msg: 'fake_resend_send',
    transport: 'fake',
    messageId: input.messageId,
    recipientDomain: recipientDomain(input.recipient),
    hasHtml: input.hasHtml,
    hasText: input.hasText,
  });
}
