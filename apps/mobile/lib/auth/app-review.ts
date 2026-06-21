const APP_REVIEW_EMAIL_REGEX = /^app-review\+[a-z0-9]{6,20}@harpapro\.com$/i;

export function isAppReviewEmail(email: string): boolean {
  return APP_REVIEW_EMAIL_REGEX.test(email.trim());
}
