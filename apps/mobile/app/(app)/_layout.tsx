/**
 * (app) group layout — authenticated screens. Auth gate + stack shell.
 *
 * Auth gate: If status is loading, render splash. If unauthenticated or
 * needs-onboarding, redirect to the appropriate auth screen. If
 * authenticated, render the stack shell.
 *
 * Stack shell: All (app) screens in a single Stack with no native
 * headers (each screen renders its own ScreenHeader). Android
 * double-back-to-exit handler.
 */
import { useEffect, useRef, useCallback } from 'react';
import { BackHandler, ToastAndroid, Platform, ActivityIndicator, View } from 'react-native';
import { Stack, useNavigation, Redirect } from 'expo-router';
import { useAuthSession } from '@/lib/auth/session';
import { decideAppRedirect } from '@/lib/auth/auth-gate';
import { colors } from '@/lib/design-tokens/colors';

export default function AppLayout() {
  const { status } = useAuthSession();
  const navigation = useNavigation();
  const lastBackPress = useRef(0);

  // Android double-back-to-exit handler (ported from canonical).
  // Declared BEFORE any conditional return so hook order stays stable
  // across renders when the auth gate flips (Rules of Hooks).
  const handleBackPress = useCallback(() => {
    if (Platform.OS !== 'android') return false;
    if (navigation.canGoBack()) return false; // let default nav handle it
    // At root — require double-press to exit
    const now = Date.now();
    if (now - lastBackPress.current < 2000) {
      return false; // let the app close
    }
    lastBackPress.current = now;
    ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
    return true; // prevent default (closing the app)
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => sub.remove();
  }, [handleBackPress]);

  // Auth gate: redirect unauthenticated / needs-onboarding users away.
  // Must come AFTER all hook calls.
  const target = decideAppRedirect(status);
  if (target) {
    return <Redirect href={target as any} />;
  }

  // Render splash if still loading (suppresses flicker on cold start).
  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="projects" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="account" />
      <Stack.Screen name="usage" />
    </Stack>
  );
}
