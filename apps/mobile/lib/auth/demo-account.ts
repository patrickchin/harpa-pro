const DEMO_ACCOUNT_EMAILS = new Set([
  'demo@harpapro.com',
  'demo2@harpapro.com',
  'demo3@harpapro.com',
]);

export function isDemoAccountEmail(email: string): boolean {
  return DEMO_ACCOUNT_EMAILS.has(email.trim().toLowerCase());
}
