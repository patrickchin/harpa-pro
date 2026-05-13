/**
 * (app) group layout — authenticated screens. Auth gate + tab shell.
 *
 * Auth gate: If status is loading, render splash. If unauthenticated or
 * needs-onboarding, redirect to the appropriate auth screen. If
 * authenticated, render the tab shell.
 *
 * Tab shell: Single "Projects" tab with tabBarStyle hidden, matching
 * canonical. Android double-back-to-exit handler.
 */
import { useEffect, useRef, useCallback } from 'react';
import { BackHandler, ToastAndroid, Platform, ActivityIndicator, View } from 'react-native';
import { Tabs, useNavigation, Redirect } from 'expo-router';
import { FolderOpen } from 'lucide-react-native';
import { colors } from '@/lib/design-tokens/colors';
import { useAuthSession } from '@/lib/auth/session';
import { decideAppRedirect } from '@/lib/auth/auth-gate';

export default function AppLayout() {
  const { status } = useAuthSession();
  const navigation = useNavigation();
  const lastBackPress = useRef(0);

  // Auth gate: redirect unauthenticated / needs-onboarding users away (FIRST).
  const target = decideAppRedirect(status);
  if (target) {
    return <Redirect href={target as any} />;
  }

  // Android double-back-to-exit handler (ported from canonical).
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

  // Render splash if still loading (suppresses flicker on cold start).
  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  // Render the tab shell. Tab bar is hidden per canonical (single tab).
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted.foreground,
        tabBarStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarButtonTestID: 'tab-projects',
          tabBarIcon: ({ color, size }) => <FolderOpen size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
