/**
 * Root layout — full provider tree + error boundary.
 *
 * Provider order (top → bottom):
 *   AppErrorBoundary → GestureHandlerRootView → SafeAreaProvider →
 *   QueryClientProvider → AuthSessionProvider → StatusBar →
 *   DialogSheetProvider → QueueProvider → AudioPlaybackProvider →
 *   SentryProvider → Slot
 *
 * See docs/v4/arch-p2-6-app-shell.md for rationale.
 */
import '../global.css';
import { Component, type ReactNode } from 'react';
import { Slot } from 'expo-router';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/lib/design-tokens/colors';
import { AuthSessionProvider } from '@/lib/auth/session';
import { DialogSheetProvider } from '@/lib/dialogs/DialogSheetProvider';
import { QueueProvider } from '@/lib/uploads/QueueProvider';
import { AudioPlaybackProvider } from '@/lib/audio/AudioPlaybackProvider';
import { SentryProvider, initSentry } from '@/lib/telemetry/SentryStub';

// Initialize Sentry (no-op stub for P2.6).
initSentry();

// Sensible TanStack defaults so re-mounting a screen (e.g. tabbing back
// into a report) renders the cached data instantly while a background
// refetch revalidates. Matching canonical: staleTime 30s, gcTime 5min,
// refetchOnWindowFocus false, refetchOnReconnect true, retry 1.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * AppErrorBoundary — catches any uncaught React error and renders a
 * fallback with a "Try Again" button. Positioned at the very top so it
 * catches errors from all layers below. Styled with inline styles pulling
 * `colors.*` from the Tailwind config so it works even if NativeWind fails.
 */
class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[error-boundary] Uncaught error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: colors.background,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: colors.foreground,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: colors.muted.foreground,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              borderWidth: 1,
              borderColor: colors.foreground,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthSessionProvider>
              <StatusBar style="dark" />
              <DialogSheetProvider>
                <QueueProvider>
                  <AudioPlaybackProvider>
                    <SentryProvider>
                      <Slot />
                    </SentryProvider>
                  </AudioPlaybackProvider>
                </QueueProvider>
              </DialogSheetProvider>
            </AuthSessionProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
