/**
 * Dev/test-only password login for live deployment E2E.
 *
 * Maestro authenticates allowlisted test accounts through better-auth's
 * `emailAndPassword` plugin (allowlist enforced server-side via the
 * `before` hook on `/api/auth/sign-in/email` — see
 * docs/v4/arch-auth-and-rls.md). A local CLI broker keeps the shared
 * password out of Maestro env/input logs; the mobile client receives
 * the password at runtime and performs the actual sign-in so the Expo
 * cookie storage is populated correctly.
 *
 * This route is intentionally unavailable in production builds.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { useAuthSession } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';
import { env } from '@/lib/config/env';
import { colors } from '@/lib/design-tokens/colors';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function E2ePasswordLoginPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    broker?: string | string[];
    email?: string | string[];
  }>();
  const broker = firstParam(params.broker);
  const email = firstParam(params.email).trim().toLowerCase();
  const session = useAuthSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const brokerStartedRef = useRef(false);

  useEffect(() => {
    if (env.EXPO_PUBLIC_APP_VARIANT === 'production') {
      setError('Password E2E login is unavailable in production builds.');
    }
  }, []);

  useEffect(() => {
    if (
      env.EXPO_PUBLIC_APP_VARIANT === 'production' ||
      !broker ||
      !email ||
      brokerStartedRef.current
    ) {
      return;
    }

    brokerStartedRef.current = true;
    const controller = new AbortController();
    setError(null);
    setSubmitting(true);

    void (async () => {
      try {
        await runBrokerSignIn(broker, email, controller.signal);
        await session.refresh();
        router.replace('/' as Href);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign in test account.';
        setError(message);
        setSubmitting(false);
      }
    })();

    return () => controller.abort();
  }, [broker, email, router, session]);

  async function handleSubmit() {
    if (isSubmitting || !email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });
      if (signInError) {
        throw new Error(signInError.message ?? 'Unable to sign in test account.');
      }
      await session.refresh();
      router.replace('/' as Href);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in test account.';
      setError(message);
      setSubmitting(false);
    }
  }

  const disabled =
    env.EXPO_PUBLIC_APP_VARIANT === 'production' ||
    !email ||
    password.length === 0 ||
    isSubmitting;

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      testID="screen-e2e-password-login"
    >
      {error ? (
        <Text
          className="text-center text-base font-semibold text-destructive"
          testID="e2e-password-login-error"
        >
          {error}
        </Text>
      ) : isSubmitting ? (
        <>
          <ActivityIndicator color={colors.foreground} />
          <Text
            className="mt-4 text-center text-base text-muted-foreground"
            testID="e2e-password-login-status"
          >
            Signing in test account
          </Text>
        </>
      ) : broker ? (
        <Text
          className="text-center text-base font-semibold text-foreground"
          testID="e2e-password-login-status"
        >
          Preparing test account sign in
        </Text>
      ) : (
        <>
          <Text
            className="mb-4 text-center text-base font-semibold text-foreground"
            testID="e2e-password-login-status"
          >
            Test account password
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full rounded border border-border px-4 py-3 text-foreground"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            testID="input-e2e-password"
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            className="mt-4 w-full items-center rounded bg-foreground px-4 py-3 disabled:opacity-50"
            disabled={disabled}
            onPress={handleSubmit}
            testID="btn-e2e-password-login"
          >
            <Text className="font-semibold text-background">Sign in</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/**
 * Hit the local CLI auth broker. The broker returns the shared test
 * password for an allowlisted email, and the mobile client then calls
 * `authClient.signIn.email()` locally. That keeps the password out of
 * Maestro logs while still letting better-auth's Expo storage persist
 * the session on the device.
 */
async function runBrokerSignIn(
  broker: string,
  email: string,
  signal: AbortSignal,
): Promise<void> {
  const url = new URL('/session', broker);
  url.searchParams.set('email', email);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Auth broker returned invalid JSON.');
  }

  if (!res.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      body.error &&
      typeof body.error === 'object' &&
      'message' in body.error &&
      typeof body.error.message === 'string'
        ? body.error.message
        : 'Auth broker rejected the test account.';
    throw new Error(message);
  }

  // Broker hands us back {password} so the mobile client can run the
  // real authClient.signIn.email() locally — that's the only way the
  // expoClient cookie storage gets populated.
  if (
    !body ||
    typeof body !== 'object' ||
    !('password' in body) ||
    typeof (body as { password: unknown }).password !== 'string'
  ) {
    throw new Error('Auth broker returned an invalid session.');
  }

  const password = (body as { password: string }).password;
  const { error: signInError } = await authClient.signIn.email({ email, password });
  if (signInError) {
    throw new Error(signInError.message ?? 'Auth broker password rejected.');
  }
}
