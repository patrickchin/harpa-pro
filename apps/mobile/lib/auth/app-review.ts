const APP_REVIEW_EMAIL = 'app-review@harpapro.com';

export function isAppReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === APP_REVIEW_EMAIL;
}
