const DEMO_ACCOUNT_EMAILS = new Set([
  'demo@harpapro.com',
  'demo2@harpapro.com',
  'demo3@harpapro.com',
]);

export function isDemoAccountEmail(email: string): boolean {
  return DEMO_ACCOUNT_EMAILS.has(email.trim().toLowerCase());
}

export function isPasswordAccountEmail(
  email: string,
  additionalEmails: readonly string[] = [],
): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    DEMO_ACCOUNT_EMAILS.has(normalizedEmail) ||
    additionalEmails.some((candidate) => candidate.trim().toLowerCase() === normalizedEmail)
  );
}
