/**
 * Dev/test-only password login for live deployment E2E.
 *
 * This route lets Maestro authenticate allowlisted test accounts through a
 * local CLI auth broker when the dev deployment has live email OTP enabled.
 * The broker keeps the shared password out of Maestro env/input logs. It is
 * intentionally unavailable in production builds.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

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
  const email = firstParam(params.email).trim();
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
        const brokerPassword = await fetchBrokerPassword(broker, email, controller.signal);
        const { error: signInError } = await authClient.signIn.email({
          email,
          password: brokerPassword,
          rememberMe: false,
        });
        if (signInError) throw new Error(signInError.message ?? 'Sign-in failed.');
        router.replace('/' as Href);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign in test account.';
        setError(message);
        setSubmitting(false);
      }
    })();

    return () => controller.abort();
  }, [broker, email, router]);

  async function handleSubmit() {
    if (isSubmitting || !email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        rememberMe: false,
      });
      if (signInError) throw new Error(signInError.message ?? 'Sign-in failed.');
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
 * Fetch the test account password from the local CLI broker.
 * The broker returns `{ password: string }` for the given email.
 */
async function fetchBrokerPassword(
  broker: string,
  email: string,
  signal: AbortSignal,
): Promise<string> {
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

  if (
    !body ||
    typeof body !== 'object' ||
    !('password' in body) ||
    typeof body.password !== 'string'
  ) {
    throw new Error('Auth broker returned an invalid response (expected { password }).');
  }

  return body.password;
}
