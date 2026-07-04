/**
 * Root layout — full provider tree + error boundary.
 *
 * Provider order (top → bottom):
 *   AppErrorBoundary → GestureHandlerRootView → SafeAreaProvider →
 *   PersistQueryClientProvider → AuthSessionProvider → StatusBar →
 *   BillingProvider → DialogSheetProvider → QueueProvider → AudioPlaybackProvider →
 *   SentryProvider → Slot
 *
 * See docs/v4/arch-p2-6-app-shell.md for rationale.
 *
 * `PersistQueryClientProvider` rehydrates the TanStack Query cache
 * from MMKV before children mount, so cold-start screens render the
 * last-seen data instantly while a background refetch revalidates.
 * See `lib/api/query-persister.ts` for the storage adapter and
 * allowlist.
 */
import '../global.css';
import { Component, type ReactNode } from 'react';
import { Slot } from 'expo-router';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/lib/design-tokens/colors';
import { AuthSessionProvider } from '@/lib/auth/session';
import { BillingProvider } from '@/lib/billing';
import { DialogSheetProvider } from '@/lib/dialogs/DialogSheetProvider';
import { QueueProvider } from '@/lib/uploads/QueueProvider';
import { AudioPlaybackProvider } from '@/lib/audio/AudioPlaybackProvider';
import {
  SentryProvider,
  captureReactError,
  initSentry,
} from '@/lib/telemetry/Sentry';
import { queryClient, queryPersister } from '@/lib/api/query-client';
import { shouldDehydrateQuery } from '@/lib/api/query-persister';

// Initialize Sentry when EXPO_PUBLIC_SENTRY_DSN is present.
initSentry();

const persistOptions = {
  persister: queryPersister.persister,
  maxAge: queryPersister.maxAge,
  buster: queryPersister.buster,
  dehydrateOptions: { shouldDehydrateQuery },
};

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
    captureReactError(error, info);
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
            {this.state.error?.message ?? 'Pull to retry, or restart the app.'}
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
              Try again
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
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
          >
            <AuthSessionProvider>
              <BillingProvider>
                <StatusBar hidden={false} style="dark" />
                <DialogSheetProvider>
                  <QueueProvider>
                    <AudioPlaybackProvider>
                      <SentryProvider>
                        <Slot />
                      </SentryProvider>
                    </AudioPlaybackProvider>
                  </QueueProvider>
                </DialogSheetProvider>
              </BillingProvider>
            </AuthSessionProvider>
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
