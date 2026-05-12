/**
 * (auth) group layout — auth flow screens (sign-in/phone, sign-in/verify,
 * etc.). No auth gate here; these screens ARE FOR unauthenticated users.
 * The authenticated gate lands in (app)/_layout.tsx (P2.6).
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
