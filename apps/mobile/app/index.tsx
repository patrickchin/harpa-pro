/**
 * Root index — redirect to (app) so the auth gate handles routing.
 *
 * The auth gate inside `(app)/_layout.tsx` will bounce unauthenticated
 * users to `/(auth)/sign-in/phone` and needs-onboarding users to
 * `/(auth)/onboarding`.
 */
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href={"/(app)/projects" as any} />;
}
